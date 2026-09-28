from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import BulkWriteError

from db.collections import (
    inventorytest_stock_collection,
    item_master_collection,
    outlet_physical_stock_closing_collection,
)
from core.compute import calculate_variance, safe_float
from core.lookups import get_category_map, get_subcategory_map
from .time_service import get_live_utc_datetime

from .models import (
    EditPendingOutletPhysicalClosingRequest,
    SubmitOutletPhysicalClosingRequest,
)

IST = ZoneInfo("Asia/Kolkata")
PENDING_STATUS = "pendingapproval"
APPROVED_STATUS = "approved"

PENDING_ITEM_UNIQUE_INDEX = "uq_one_pending_outlet_closing_per_item"
PENDING_LIST_INDEX = "ix_outlet_physical_closing_location_status_id"
PENDING_IDS_COVERING_INDEX = "ix_outlet_physical_closing_location_status_itemcode"
_LEGACY_PENDING_LIST_INDEX = "ix_outlet_physical_closing_location_status_created"
_INDEX_SETUP_LOCK = asyncio.Lock()
_INDEXES_READY = False


def _serialize_datetime(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


async def list_pending_outlet_physical_closing_ids(
    *, location_id: Optional[str] = None,
) -> Dict[str, Any]:
    location_id = (location_id or "").strip()
    if not location_id:
        raise HTTPException(status_code=400, detail="locationId is required")

    collection = outlet_physical_stock_closing_collection()
    query = {"status": PENDING_STATUS, "locationId": location_id}
    cursor = collection.find(query, {"itemCode": 1, "_id": 0})
    ids = await cursor.to_list(length=None)

    return {"itemCodes": [str(d.get("itemCode") or "").strip() for d in ids if d.get("itemCode")]}

    
def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


def _month_utc_range(month_value: str) -> Tuple[datetime, datetime]:
    from datetime import timezone

    try:
        local_start = datetime.strptime(month_value, "%Y-%m").replace(tzinfo=IST)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="closingMonth must use YYYY-MM format",
        ) from exc

    if local_start.month == 12:
        local_end = local_start.replace(year=local_start.year + 1, month=1)
    else:
        local_end = local_start.replace(month=local_start.month + 1)

    return (
        local_start.astimezone(timezone.utc),
        local_end.astimezone(timezone.utc),
    )


def _stored_history(document: Dict[str, Any]) -> List[Dict[str, Any]]:
    history = document.get("editHistory")
    return history if isinstance(history, list) else []


def _response_history(document: Dict[str, Any]) -> List[Dict[str, Any]]:
    history = _stored_history(document)
    if history:
        original_physical = safe_float(history[0].get("previousPhysicalStock"))
        original_variance = safe_float(history[0].get("previousVariance"))
    else:
        original_physical = safe_float(document.get("physicalStock"))
        original_variance = safe_float(document.get("variance"))

    response: List[Dict[str, Any]] = []
    for index, entry in enumerate(history, start=1):
        response.append(
            {
                "editVersion": index,
                "originalPhysicalStock": original_physical,
                "previousPhysicalStock": safe_float(entry.get("previousPhysicalStock")),
                "revisedPhysicalStock": safe_float(entry.get("revisedPhysicalStock")),
                "originalVariance": original_variance,
                "previousVariance": safe_float(entry.get("previousVariance")),
                "revisedVariance": safe_float(entry.get("revisedVariance")),
                "editedBy": entry.get("editedBy", ""),
                "editedAt": _serialize_datetime(entry.get("editedAt")),
                "reason": str(entry.get("reason") or "").strip(),
            }
        )

    return response


def _serialize_document(
    document: Dict[str, Any],
    item_metadata: Optional[Dict[str, Any]] = None,
    category_map: Optional[Dict[str, Any]] = None,
    subcategory_map: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    item_metadata = item_metadata or {}
    category_map = category_map or {}
    subcategory_map = subcategory_map or {}

    history = _response_history(document)
    latest_history = history[-1] if history else None

    current_physical = safe_float(document.get("physicalStock"))
    current_variance = safe_float(document.get("variance"))

    if history:
        original_physical = safe_float(history[0].get("originalPhysicalStock"))
        original_variance = safe_float(history[0].get("originalVariance"))
    else:
        original_physical = current_physical
        original_variance = current_variance

    created_at = document.get("createdAt")
    closing_month = ""
    if isinstance(created_at, datetime):
        closing_month = created_at.astimezone(IST).strftime("%Y-%m")

    category_id = item_metadata.get("category")
    sub_id = item_metadata.get("subCategory")

    response = {
        "closingId": str(document.get("_id") or ""),
        "closingMonth": closing_month,
        "locationId": document.get("locationId", ""),
        "itemCode": document.get("itemCode", ""),
        "category": category_map.get(category_id),
        "subcategory": subcategory_map.get(sub_id),
        "itemName": item_metadata.get("itemName"),
        "varianceName": item_metadata.get("varianceName"),
        "uom": item_metadata.get("uom"),
        "systemStock": safe_float(document.get("systemStock")),
        "physicalStock": original_physical,
        "previousSystemStock": safe_float(document.get("previousSystemStock")),
        "variance": original_variance,
        "latestPhysicalStock": current_physical,
        "latestVariance": current_variance,
        "editVersion": len(history),
        "physicalStockEditHistory": history,
        "latestEditedBy": latest_history.get("editedBy") if latest_history else None,
        "latestEditedAt": latest_history.get("editedAt") if latest_history else None,
        "status": document.get("status", PENDING_STATUS),
        "submittedBy": document.get("createdBy", ""),
        "submittedAt": _serialize_datetime(document.get("createdAt")),
        "createdAt": _serialize_datetime(document.get("createdAt")),
        "createdBy": document.get("createdBy", ""),
    }

    if document.get("updatedAt") is not None:
        response["updatedAt"] = _serialize_datetime(document.get("updatedAt"))

    last_updated_by = document.get("lastUpdatedBy")
    if last_updated_by not in (None, ""):
        response["lastUpdatedBy"] = last_updated_by

    return response


async def ensure_outlet_physical_closing_indexes() -> None:
    global _INDEXES_READY

    if _INDEXES_READY:
        return

    async with _INDEX_SETUP_LOCK:
        if _INDEXES_READY:
            return

        collection = outlet_physical_stock_closing_collection()

        try:
            await collection.drop_index(_LEGACY_PENDING_LIST_INDEX)
        except Exception:
            pass

        await collection.create_index(
            [("locationId", 1), ("status", 1), ("_id", -1)],
            name=PENDING_LIST_INDEX,
        )
        await collection.create_index(
            [("locationId", 1), ("itemCode", 1)],
            unique=True,
            partialFilterExpression={"status": PENDING_STATUS},
            name=PENDING_ITEM_UNIQUE_INDEX,
        )
        await collection.create_index(
            [("locationId", 1), ("status", 1), ("itemCode", 1)],
            name=PENDING_IDS_COVERING_INDEX,
        )

        _INDEXES_READY = True


async def submit_outlet_physical_closing(
    request: SubmitOutletPhysicalClosingRequest,
) -> Dict[str, Any]:
   

    await ensure_outlet_physical_closing_indexes()
    now = await get_live_utc_datetime()
    
    closing_collection = outlet_physical_stock_closing_collection()
    stock_collection = inventorytest_stock_collection()

    location_id = request.resolved_location_id
    created_by = request.resolved_created_by

    requested_map = {item.itemCode: item for item in request.items}
    item_codes = list(requested_map.keys())

    # Pull current system stock for each item at this location.
    stock_docs = await stock_collection.find(
        {"locationId": location_id, "itemCode": {"$in": item_codes}},
        {"itemCode": 1, "systemStock": 1, "previousSystemStock": 1},
    ).to_list(None)
    stock_map = {doc["itemCode"]: doc for doc in stock_docs if doc.get("itemCode")}

    # Confirm items exist in the master (mirrors warehouse's missing-inventory guard).
    master_docs = await item_master_collection().find(
        {"itemCode": {"$in": item_codes}},
        {"itemCode": 1},
    ).to_list(None)
    known_item_codes = {doc.get("itemCode") for doc in master_docs}
    missing_inventory = [code for code in item_codes if code not in known_item_codes]

    existing_pending_docs = await closing_collection.find(
        {
            "locationId": location_id,
            "itemCode": {"$in": item_codes},
            "status": PENDING_STATUS,
        },
        {"itemCode": 1},
    ).to_list(None)
    already_pending = {doc.get("itemCode") for doc in existing_pending_docs}

    documents: List[Dict[str, Any]] = []
    skipped_pending: List[str] = []

    for item_code, item in requested_map.items():
        if item_code in missing_inventory:
            continue
        if item_code in already_pending:
            skipped_pending.append(item_code)
            continue

        stock_doc = stock_map.get(item_code, {})
        system_stock = safe_float(stock_doc.get("systemStock"))
        physical_stock = safe_float(item.physicalStock)

        documents.append(
            {
                "itemCode": item_code,
                "locationId": location_id,
                "systemStock": system_stock,
                "physicalStock": physical_stock,
                "previousSystemStock": safe_float(
                    stock_doc.get("previousSystemStock"), system_stock
                ),
                "variance": calculate_variance(system_stock, physical_stock),
                "status": PENDING_STATUS,
                "createdAt": now,
                "createdBy": created_by,
                "editHistory": [],
            }
        )

    inserted_ids: List[str] = []
    if documents:
        try:
            result = await closing_collection.insert_many(documents, ordered=False)
            inserted_ids = [str(value) for value in result.inserted_ids]
        except BulkWriteError as exc:
            details = exc.details or {}
            write_errors = details.get("writeErrors") or []

            duplicate_indexes = {
                int(error.get("index"))
                for error in write_errors
                if error.get("code") == 11000 and error.get("index") is not None
            }
            unexpected_errors = [
                error for error in write_errors if error.get("code") != 11000
            ]

            if unexpected_errors:
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": "Unable to create physical-closing rows",
                        "writeErrors": _json_safe(unexpected_errors),
                    },
                ) from exc


            raced_item_codes = [
                str(documents[index].get("itemCode") or "")
                for index in sorted(duplicate_indexes)
                if 0 <= index < len(documents)
            ]
            skipped_pending.extend(code for code in raced_item_codes if code)

            successful_item_codes = [
                str(document.get("itemCode") or "")
                for index, document in enumerate(documents)
                if index not in duplicate_indexes
            ]
            if successful_item_codes:
                inserted_documents = await closing_collection.find(
                    {
                        "locationId": location_id,
                        "itemCode": {"$in": successful_item_codes},
                        "status": PENDING_STATUS,
                        "createdAt": now,
                    },
                    {"_id": 1},
                ).to_list(None)
                inserted_ids = [str(doc["_id"]) for doc in inserted_documents]

    if not inserted_ids and not skipped_pending and missing_inventory:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "No matching inventory rows were found",
                "missingInventory": missing_inventory,
            },
        )

    return {
        "closingId": inserted_ids[0] if inserted_ids else "",
        "ids": inserted_ids,
        "status": PENDING_STATUS,
        "inserted": len(inserted_ids),
        "skippedAlreadyPending": skipped_pending,
        "missingInventory": missing_inventory,
        "message": (
            f"{len(inserted_ids)} physical stock item(s) sent for approval"
            if inserted_ids
            else "Physical stock is already pending approval"
        ),
    }


async def list_pending_outlet_physical_closings(
    *,
    page: int,
    limit: int,
    location_id: Optional[str] = None,
    closing_month: Optional[str] = None,
) -> Dict[str, Any]:
    collection = outlet_physical_stock_closing_collection()

    query: Dict[str, Any] = {"status": PENDING_STATUS}
    if location_id:
        query["locationId"] = location_id.strip()
    if closing_month:
        start_utc, end_utc = _month_utc_range(closing_month)
        query["createdAt"] = {"$gte": start_utc, "$lt": end_utc}

    skip = (page - 1) * limit
    total, documents = await asyncio.gather(
        collection.count_documents(query),
        collection.find(query)
        .sort("_id", -1)
        .skip(skip)
        .limit(limit)
        .to_list(limit),
    )
    item_codes = [
        str(document.get("itemCode") or "").strip()
        for document in documents
        if document.get("itemCode")
    ]

    category_map, subcategory_map, metadata_documents = await asyncio.gather(
        get_category_map(),
        get_subcategory_map(),
        item_master_collection().find(
            {"itemCode": {"$in": item_codes}},
            {
                "itemCode": 1,
                "category": 1,
                "subCategory": 1,
                "itemName": 1,
                "varianceName": 1,
                "uom": 1,
            },
        ).to_list(None) if item_codes else asyncio.sleep(0, result=[]),
    )

    metadata_map = {
        str(document.get("itemCode") or "").strip(): document
        for document in metadata_documents
    }

    results = [
        _serialize_document(
            document,
            metadata_map.get(str(document.get("itemCode") or "").strip()),
            category_map,
            subcategory_map,
        )
        for document in documents
    ]

    return {
        "results": results,
        "total": total,
        "page": page,
        "limit": limit,
        "count": len(results),
        "hasMore": skip + len(results) < total,
    }


async def edit_pending_outlet_physical_closing(
    closing_id: str,
    item_code: str,
    request: EditPendingOutletPhysicalClosingRequest,
) -> Dict[str, Any]:
    if not ObjectId.is_valid(closing_id):
        raise HTTPException(status_code=400, detail="Invalid closingId")

    object_id = ObjectId(closing_id)
    collection = outlet_physical_stock_closing_collection()

    current = await collection.find_one(
        {
            "_id": object_id,
            "itemCode": item_code.strip(),
            "status": PENDING_STATUS,
        }
    )
    if not current:
        raise HTTPException(
            status_code=404,
            detail="Pending physical-closing item was not found",
        )

    current_history = _stored_history(current)
    current_version = len(current_history)
    if current_version >= 1:
        raise HTTPException(
            status_code=409,
            detail=(
                "This pending physical stock was already corrected once. "
                "It must now continue through approval."
            ),
        )

    if current_version != request.expectedEditVersion:
        raise HTTPException(
            status_code=409,
            detail=(
                "This item was already modified by another user. "
                "Refresh the pending list and try again."
            ),
        )

    previous_physical = safe_float(current.get("physicalStock"))
    revised_physical = safe_float(request.physicalStock)
    if previous_physical == revised_physical:
        raise HTTPException(
            status_code=400,
            detail="New physicalStock is the same as current physicalStock",
        )

    previous_variance = safe_float(current.get("variance"))
    revised_variance = calculate_variance(
        safe_float(current.get("systemStock")),
        revised_physical,
    )
    edited_by = request.resolved_editor
    
    # --- INTEGRATION POINT: Fetch live datetime from the external service ---
    edited_at = await get_live_utc_datetime()

    history_entry = {
        "previousPhysicalStock": previous_physical,
        "revisedPhysicalStock": revised_physical,
        "previousVariance": previous_variance,
        "revisedVariance": revised_variance,
        "editedBy": edited_by,
        "editedAt": edited_at,
        "reason": str(request.reason or "").strip(),
    }

    # Atomic compare-and-set: the $expr guard re-checks editHistory is still
    # empty at write time, closing the race window between the find_one
    # read above and this update (two concurrent edit requests can't both
    # succeed).
    updated = await collection.find_one_and_update(
        {
            "_id": object_id,
            "itemCode": item_code.strip(),
            "status": PENDING_STATUS,
            "$expr": {"$eq": [{"$size": {"$ifNull": ["$editHistory", []]}}, 0]},
        },
        {
            "$set": {
                "physicalStock": revised_physical,
                "variance": revised_variance,
                "updatedAt": edited_at,           # <-- ADDED: Track edit time for frontend sorting
                "lastUpdatedBy": edited_by,       # <-- CHANGED: from $unset to $set
            },
            "$push": {"editHistory": history_entry},
        },
        return_document=ReturnDocument.AFTER,
    )

    if not updated:
        raise HTTPException(
            status_code=409,
            detail=(
                "This item changed while you were editing it. "
                "Refresh the pending list and try again."
            ),
        )

    category_map, subcategory_map = await asyncio.gather(
        get_category_map(),
        get_subcategory_map(),
    )
    item_metadata = await item_master_collection().find_one(
        {"itemCode": updated.get("itemCode")},
        {
            "itemCode": 1,
            "category": 1,
            "subCategory": 1,
            "itemName": 1,
            "varianceName": 1,
            "uom": 1,
        },
    )

    return {
        "message": "Pending physical stock updated successfully",
        "item": _serialize_document(updated, item_metadata, category_map, subcategory_map),
    }


async def mark_outlet_physical_closing_approved(
    *,
    closing_id: str,
    approved_by: str,
) -> Dict[str, Any]:
    if not ObjectId.is_valid(closing_id):
        raise HTTPException(status_code=400, detail="Invalid closingId")

    # --- INTEGRATION POINT: Fetch live datetime from the external service ---
    now = await get_live_utc_datetime()
    
    result = await outlet_physical_stock_closing_collection().update_one(
        {"_id": ObjectId(closing_id), "status": PENDING_STATUS},
        {
            "$set": {
                "status": APPROVED_STATUS,
                "updatedAt": now,
                "lastUpdatedBy": approved_by or "System",
            }
        },
    )

    return {
        "matchedCount": result.matched_count,
        "modifiedCount": result.modified_count,
    }