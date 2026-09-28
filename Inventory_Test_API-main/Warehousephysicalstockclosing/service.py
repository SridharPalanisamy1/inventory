from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo
from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import BulkWriteError
from db.collections import (
    approvedstocks_rm_collection,
    inventory_stock_collection,
    purchaseitem_collection,
    warehouse_physical_stock_closing_collection,
)

from .models import (
    EditPendingPhysicalClosingRequest,
    SubmitWarehousePhysicalClosingRequest,
)
from .time_service import get_live_utc_datetime


IST = ZoneInfo("Asia/Kolkata")
PENDING_STATUS = "pendingapproval"
APPROVED_STATUS = "approved"

LEGACY_IDEMPOTENCY_INDEX = "uq_warehouse_closing_idempotency_item"
LEGACY_BATCH_ITEM_INDEX = "uq_warehouse_closing_batch_item"
LEGACY_LOCATION_STATUS_CREATED_INDEX = "ix_physical_closing_location_status_created"
PENDING_ITEM_UNIQUE_INDEX = "uq_one_pending_physical_closing_per_item"
_INDEX_SETUP_LOCK = asyncio.Lock()
_INDEXES_READY = False


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or str(value).strip() == "":
            return float(default)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def calculate_variance(system_stock: float, physical_stock: float) -> float:
    return round(float(physical_stock) - float(system_stock), 6)


def _serialize_datetime(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def _json_safe(value: Any) -> Any:
    """Convert MongoDB/Python values into JSON-safe error details."""
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
                "previousPhysicalStock": safe_float(
                    entry.get("previousPhysicalStock")
                ),
                "revisedPhysicalStock": safe_float(
                    entry.get("revisedPhysicalStock")
                ),
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
) -> Dict[str, Any]:
    item_metadata = item_metadata or {}
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

    response = {
        # Response-only aliases. closingId is MongoDB _id; it is not duplicated.
        "closingId": str(document.get("_id") or ""),
        "closingMonth": closing_month,
        "idempotencyKey": "",
        "tenantId": "",
        "randomId": document.get("randomId", ""),
        "locationId": document.get("locationId", ""),
        "itemCode": item_metadata.get("itemCode"),
        "itemType": document.get("itemType", ""),
        "category": item_metadata.get("purchasecategoryName"),
        "subcategory": item_metadata.get("purchasesubcategoryName"),
        "itemName": item_metadata.get("itemgroupName"),
        "varianceName": item_metadata.get("itemName"),
        "uom": item_metadata.get("uom"),
        "systemStock": safe_float(document.get("systemStock")),
        "physicalStock": original_physical,
        "previousSystemStock": safe_float(document.get("previousSystemStock")),
        "variance": original_variance,
        "latestPhysicalStock": current_physical,
        "latestVariance": current_variance,
        "latestAdjustmentQty": 0,
        "editVersion": len(history),
        "physicalStockEditHistory": history,
        "latestEditedBy": latest_history.get("editedBy") if latest_history else None,
        "latestEditedAt": latest_history.get("editedAt") if latest_history else None,
        "status": document.get("status", PENDING_STATUS),
        "submittedById": "",
        "submittedBy": document.get("createdBy", ""),
        "submittedAt": _serialize_datetime(document.get("createdAt")),
        "description": None,
        "createdAt": _serialize_datetime(document.get("createdAt")),
        "createdBy": document.get("createdBy", ""),
    }
    if document.get("updatedAt") is not None:
        response["updatedAt"] = _serialize_datetime(document.get("updatedAt"))

    last_updated_by = document.get("lastUpdatedBy")
    if last_updated_by not in (None, ""):
        response["lastUpdatedBy"] = last_updated_by

    return response


async def ensure_physical_closing_indexes() -> None:
    global _INDEXES_READY

    if _INDEXES_READY:
        return

    async with _INDEX_SETUP_LOCK:
        if _INDEXES_READY:
            return

        collection = warehouse_physical_stock_closing_collection()
        indexes = await collection.index_information()

        legacy_idempotency_key = [
            ("tenantId", 1),
            ("idempotencyKey", 1),
            ("randomId", 1),
        ]
        legacy_batch_key = [("closingId", 1), ("randomId", 1)]
        pending_key = [("locationId", 1), ("randomId", 1)]
        pending_filter = {"status": PENDING_STATUS}
        for index_name, index_definition in indexes.items():
            index_key = [
                tuple(part)
                for part in index_definition.get("key", [])
            ]
            if (
                index_name in {
                    LEGACY_IDEMPOTENCY_INDEX,
                    LEGACY_BATCH_ITEM_INDEX,
                }
                or index_key == legacy_idempotency_key
                or index_key == legacy_batch_key
            ):
                await collection.drop_index(index_name)


        if LEGACY_LOCATION_STATUS_CREATED_INDEX in indexes:
            await collection.drop_index(LEGACY_LOCATION_STATUS_CREATED_INDEX)

    
        existing_pending_index = indexes.get(PENDING_ITEM_UNIQUE_INDEX)
        if existing_pending_index:
            existing_key = [
                tuple(part)
                for part in existing_pending_index.get("key", [])
            ]
            existing_filter = existing_pending_index.get(
                "partialFilterExpression"
            )
            is_correct = (
                existing_key == pending_key
                and existing_pending_index.get("unique") is True
                and existing_filter == pending_filter
            )
            if not is_correct:
                await collection.drop_index(PENDING_ITEM_UNIQUE_INDEX)

      
        await collection.create_index(
            [("locationId", 1), ("status", 1), ("_id", 1)],
            name="ix_physical_closing_location_status_id",
        )
        await collection.create_index(
            pending_key,
            unique=True,
            partialFilterExpression=pending_filter,
            name=PENDING_ITEM_UNIQUE_INDEX,
        )

        _INDEXES_READY = True


async def submit_physical_closing(
    request: SubmitWarehousePhysicalClosingRequest,
) -> Dict[str, Any]:

    now = await get_live_utc_datetime()
    closing_collection = warehouse_physical_stock_closing_collection()
    inventory_collection = inventory_stock_collection()
    approved_collection = approvedstocks_rm_collection()

    location_id = request.resolved_location_id
    created_by = request.resolved_created_by

    # Keep one entry when a duplicate randomId is accidentally sent.
    requested_map = {item.randomId: item for item in request.items}
    random_ids = list(requested_map.keys())

    # replace the part 6 8 2
    inventory_pipeline = [
        {
            "$match": {
                "locationId": location_id,
                "randomId": {"$in": random_ids},
            }
        },
        {
            "$sort": {
                "updatedAt": -1,
                "_id": -1,
            }
        },
        {
            "$group": {
                "_id": "$randomId",
                "document": {"$first": "$$ROOT"},
            }
        },
        {
            "$replaceRoot": {
                "newRoot": "$document"
            }
        },
        {
            "$project": {
                "randomId": 1,
                "itemType": 1,
                "systemStock": 1,
                "previousSystemStock": 1,
            }
        },
    ]

    source_documents, closing_documents = await asyncio.gather(
        inventory_collection.aggregate(inventory_pipeline).to_list(None),
        closing_collection.find(
            {
                "locationId": location_id,
                "randomId": {"$in": random_ids},
            },
            {
                "randomId": 1,
                "status": 1,
                "createdAt": 1,
                "updatedAt": 1,
            },
        )
        .sort([("createdAt", -1), ("_id", -1)])
        .to_list(None),
    )
    source_map = {
        str(document.get("randomId") or "").strip(): document
        for document in source_documents
        if document.get("randomId")
    }


    rows_by_random_id: Dict[str, List[Dict[str, Any]]] = {}
    latest_closing_map: Dict[str, Dict[str, Any]] = {}

    for document in closing_documents:
        random_id = str(document.get("randomId") or "").strip()
        if not random_id:
            continue

        rows_by_random_id.setdefault(random_id, []).append(document)
        latest_closing_map.setdefault(random_id, document)

    latest_pending_random_ids = [
        random_id
        for random_id, document in latest_closing_map.items()
        if str(document.get("status") or "").strip().lower() == PENDING_STATUS
    ]

    latest_approved_map: Dict[str, Dict[str, Any]] = {}
    if latest_pending_random_ids:
        approved_documents = await approved_collection.find(
            {
                "locationId": location_id,
                "randomId": {"$in": latest_pending_random_ids},
                "status": APPROVED_STATUS,
            },
            {
                "randomId": 1,
                "status": 1,
                "approvedAt": 1,
            },
        ).sort([("approvedAt", -1), ("_id", -1)]).to_list(None)

        for document in approved_documents:
            random_id = str(document.get("randomId") or "").strip()
            if random_id and random_id not in latest_approved_map:
                latest_approved_map[random_id] = document

    repaired_latest_pending_ids: List[ObjectId] = []

    for random_id in latest_pending_random_ids:
        pending_document = latest_closing_map.get(random_id) or {}
        approved_document = latest_approved_map.get(random_id)
        if not approved_document:
            continue

        pending_id = pending_document.get("_id")
        approved_id = approved_document.get("_id")

        if not isinstance(pending_id, ObjectId) or not isinstance(approved_id, ObjectId):
            continue

        if approved_id.generation_time < pending_id.generation_time:
            continue

        repaired_latest_pending_ids.append(pending_id)
        pending_document["status"] = APPROVED_STATUS
        pending_document["updatedAt"] = now
        pending_document["lastUpdatedBy"] = created_by

    if repaired_latest_pending_ids:
        await closing_collection.update_many(
            {
                "_id": {"$in": repaired_latest_pending_ids},
                "status": PENDING_STATUS,
            },
            {
                "$set": {
                    "status": APPROVED_STATUS,
                    "updatedAt": now,
                    "lastUpdatedBy": created_by,
                }
            },
        )


    stale_pending_ids: List[ObjectId] = []

    for random_id, rows in rows_by_random_id.items():
        latest_document = latest_closing_map.get(random_id) or {}
        latest_status = str(latest_document.get("status") or "").strip().lower()

        if latest_status == PENDING_STATUS:
            continue

        for older_document in rows[1:]:
            older_status = str(older_document.get("status") or "").strip().lower()
            older_id = older_document.get("_id")

            if older_status == PENDING_STATUS and isinstance(older_id, ObjectId):
                stale_pending_ids.append(older_id)

    if stale_pending_ids:
        await closing_collection.delete_many(
            {
                "_id": {"$in": stale_pending_ids},
                "status": PENDING_STATUS,
            }
        )
    await ensure_physical_closing_indexes()

    existing_pending_map: Dict[str, str] = {}
    documents: List[Dict[str, Any]] = []
    missing_inventory: List[str] = []
    skipped_pending: List[str] = []

    for random_id, item in requested_map.items():
        source = source_map.get(random_id)
        if not source:
            missing_inventory.append(random_id)
            continue

        system_stock = safe_float(source.get("systemStock"))
        physical_stock = safe_float(item.physicalStock)

        documents.append(
            {
                "randomId": random_id,
                "locationId": location_id,
                "itemType": str(
                    source.get("itemType") or request.itemType or "Raw Material"
                ),
                "systemStock": system_stock,
                "physicalStock": physical_stock,
                "previousSystemStock": safe_float(
                    source.get("previousSystemStock"),
                    system_stock,
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
            result = await closing_collection.insert_many(
                documents,
                ordered=False,
            )
            inserted_ids = [str(value) for value in result.inserted_ids]
        except BulkWriteError as exc:
            details = exc.details or {}
            write_errors = details.get("writeErrors") or []
            write_concern_errors = details.get("writeConcernErrors") or []

            duplicate_errors = [
                error for error in write_errors if error.get("code") == 11000
            ]
            unexpected_errors = [
                error for error in write_errors if error.get("code") != 11000
            ]

            if unexpected_errors or write_concern_errors:
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": "Unable to create physical-closing rows",
                        "writeErrors": _json_safe(unexpected_errors),
                        "writeConcernErrors": _json_safe(write_concern_errors),
                    },
                ) from exc

            duplicate_indexes = {
                int(error.get("index"))
                for error in duplicate_errors
                if error.get("index") is not None
            }

            raced_random_ids = [
                str(documents[index].get("randomId") or "").strip()
                for index in sorted(duplicate_indexes)
                if 0 <= index < len(documents)
            ]
            raced_random_ids = [rid for rid in raced_random_ids if rid]

            successful_random_ids = [
                str(document.get("randomId") or "").strip()
                for index, document in enumerate(documents)
                if index not in duplicate_indexes
            ]
            successful_random_ids = [rid for rid in successful_random_ids if rid]

            if successful_random_ids:
                inserted_documents = await closing_collection.find(
                    {
                        "locationId": location_id,
                        "randomId": {"$in": successful_random_ids},
                        "status": PENDING_STATUS,
                        "createdAt": now,
                    },
                    {"_id": 1, "randomId": 1},
                ).to_list(None)
                inserted_ids = [
                    str(document["_id"])
                    for document in inserted_documents
                ]

            pending_after_race_map: Dict[str, str] = {}
            if raced_random_ids:
                pending_after_race = await closing_collection.find(
                    {
                        "locationId": location_id,
                        "randomId": {"$in": raced_random_ids},
                        "status": PENDING_STATUS,
                    },
                    {"_id": 1, "randomId": 1},
                ).sort([("createdAt", -1), ("_id", -1)]).to_list(None)

                for document in pending_after_race:
                    random_id = str(document.get("randomId") or "").strip()
                    if random_id and random_id not in pending_after_race_map:
                        pending_after_race_map[random_id] = str(document.get("_id") or "")


            unresolved_duplicate_ids = [
                random_id
                for random_id in raced_random_ids
                if random_id not in pending_after_race_map
            ]
            if unresolved_duplicate_ids:
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": (
                            "MongoDB duplicate-key conflict occurred, but no "
                            "pendingapproval row exists for the affected item."
                        ),
                        "randomIds": unresolved_duplicate_ids,
                        "writeErrors": _json_safe(duplicate_errors),
                    },
                ) from exc

         
            existing_pending_map.update(pending_after_race_map)
            skipped_pending.extend(
                random_id
                for random_id in raced_random_ids
                if random_id not in skipped_pending
            )

    if not inserted_ids and not existing_pending_map and missing_inventory:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "No matching inventory rows were found",
                "missingInventory": missing_inventory,
                "skippedAlreadyPending": skipped_pending,
            },
        )

    return {
        "closingId": (
            inserted_ids[0]
            if inserted_ids
            else next(iter(existing_pending_map.values()), "")
        ),
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


async def list_pending_physical_closings(
    *,
    page: int,
    limit: int,
    location_id: Optional[str] = None,
    closing_month: Optional[str] = None,
) -> Dict[str, Any]:
    collection = warehouse_physical_stock_closing_collection()

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

    random_ids = [
        str(document.get("randomId") or "").strip()
        for document in documents
        if document.get("randomId")
    ]

    metadata_documents = []
    if random_ids:
        metadata_documents = await purchaseitem_collection().find(
            {"randomId": {"$in": random_ids}},
            {
                "randomId": 1,
                "itemCode": 1,
                "purchasecategoryName": 1,
                "purchasesubcategoryName": 1,
                "itemName": 1,
                "itemgroupName": 1,
                "uom": 1,
            },
        ).to_list(None)

    metadata_map = {
        str(document.get("randomId") or "").strip(): document
        for document in metadata_documents
    }

    results = [
        _serialize_document(
            document,
            metadata_map.get(str(document.get("randomId") or "").strip()),
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


async def edit_pending_physical_closing(
    closing_id: str,
    random_id: str,
    request: EditPendingPhysicalClosingRequest,
) -> Dict[str, Any]:
    if not ObjectId.is_valid(closing_id):
        raise HTTPException(status_code=400, detail="Invalid closingId")

    object_id = ObjectId(closing_id)
    collection = warehouse_physical_stock_closing_collection()

    current = await collection.find_one(
        {
            "_id": object_id,
            "randomId": random_id.strip(),
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
    edited_at = await get_live_utc_datetime()

    history_entry = {
        "previousPhysicalStock": previous_physical,
        "revisedPhysicalStock": revised_physical,
        "previousVariance": previous_variance,
        "revisedVariance": revised_variance,
        "editedBy": edited_by,
        "editedAt": edited_at,
        "reason": request.reason,
    }

    # One MongoDB document update = current values and audit history are atomic.
    updated = await collection.find_one_and_update(
        {
            "_id": object_id,
            "randomId": random_id.strip(),
            "status": PENDING_STATUS,
            "$expr": {
                "$eq": [
                    {"$size": {"$ifNull": ["$editHistory", []]}},
                    0,
                ]
            },
        },
        {
            "$set": {
                "physicalStock": revised_physical,
                "variance": revised_variance,
            },
            # Keep update audit only inside editHistory. These top-level fields
            # are intentionally absent for POST and pending-item PATCH records.
            "$unset": {
                "updatedAt": "",
                "lastUpdatedBy": "",
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

    item_metadata = await purchaseitem_collection().find_one(
        {"randomId": updated.get("randomId")},
        {
            "itemCode": 1,
            "purchasecategoryName": 1,
            "purchasesubcategoryName": 1,
            "itemName": 1,
            "itemgroupName": 1,
            "uom": 1,
        },
    )

    return {
        "message": "Pending physical stock updated successfully",
        "item": _serialize_document(updated, item_metadata),
    }


async def mark_physical_closing_approved(
    *,
    closing_id: str,
    approved_by: str,
) -> Dict[str, Any]:

    if not ObjectId.is_valid(closing_id):
        raise HTTPException(status_code=400, detail="Invalid closingId")

    now = await get_live_utc_datetime()
    result = await warehouse_physical_stock_closing_collection().update_one(
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



async def list_pending_physical_closing_ids(
    *,
    location_id: Optional[str] = None,
) -> Dict[str, Any]:

    collection = warehouse_physical_stock_closing_collection()

    query: Dict[str, Any] = {"status": PENDING_STATUS}
    if location_id:
        query["locationId"] = location_id.strip()

    cursor = collection.find(query, {"randomId": 1, "_id": 0})
    ids = await cursor.to_list(length=None)

    return {
        "randomIds": [
            str(doc.get("randomId") or "").strip()
            for doc in ids
            if doc.get("randomId")
        ],
    }