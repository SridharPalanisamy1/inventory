# OutletRMPhysicalStockClosing/service.py
# ─────────────────────────────────────────────────────────────────────────────
# Audit / monitoring app -> RM physical stock requests (pending approval).
# Mirrors OutletPhysicalStockClosing/service.py (FG) line for line, only the
# data sources differ:
#
#   FG : item master + outletinventoryStock  -> outletphysicalstockclosing
#   RM : purchase.rawMaterials + Branch_wise_stock (itemType RM)
#                                            -> outletrmphysicalstockclosing
#
# The pending row keeps the same shape as FG:
#   {itemCode, locationId, systemStock, physicalStock, previousSystemStock,
#    variance, status="pendingapproval", createdAt, createdBy, editHistory}
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import BulkWriteError

from OutletPhysicalStockClosing.models import (
    EditPendingOutletPhysicalClosingRequest,
    SubmitOutletPhysicalClosingRequest,
)
from OutletPhysicalStockClosing.service import (
    PENDING_STATUS,
    _json_safe,
    _month_utc_range,
    _serialize_document,
    _stored_history,
)
from OutletPhysicalStockClosing.time_service import get_live_utc_datetime
from OutletRMInventory.routes import RM_TYPES, _code_variants
from core.compute import calculate_variance, safe_float
from db.collections import (
    outlet_rm_physical_stock_closing_collection,
    outlet_rm_stock_collection,
    purchaseitem_collection,
)

PENDING_ITEM_UNIQUE_INDEX = "uq_one_pending_outlet_rm_closing_per_item"
PENDING_LIST_INDEX = "ix_outlet_rm_physical_closing_location_status_id"
PENDING_IDS_COVERING_INDEX = "ix_outlet_rm_physical_closing_location_status_itemcode"
_INDEX_SETUP_LOCK = asyncio.Lock()
_INDEXES_READY = False


async def ensure_rm_physical_closing_indexes() -> None:
    global _INDEXES_READY

    if _INDEXES_READY:
        return

    async with _INDEX_SETUP_LOCK:
        if _INDEXES_READY:
            return

        collection = outlet_rm_physical_stock_closing_collection()
        await collection.create_index(
            [("locationId", 1), ("status", 1), ("_id", -1)],
            name=PENDING_LIST_INDEX,
        )
        # one pending request per item per outlet (same rule as FG)
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


def _serialize(document: Dict[str, Any], meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """FG serializer + RM item details (rawMaterials has no variance)."""
    response = _serialize_document(document)
    meta = meta or {}
    response.update(
        {
            "category": meta.get("purchasecategoryName"),
            "subcategory": meta.get("purchasesubcategoryName"),
            "itemName": meta.get("itemName"),
            "varianceName": None,
            "uom": meta.get("uom"),
        }
    )
    return response


async def _rm_meta_map(item_codes: List[str]) -> Dict[str, Dict[str, Any]]:
    if not item_codes:
        return {}
    docs = await purchaseitem_collection().find(
        {"itemCode": {"$in": _code_variants(item_codes)}},
        {
            "itemCode": 1,
            "itemName": 1,
            "itemgroupName": 1,
            "purchasecategoryName": 1,
            "purchasesubcategoryName": 1,
            "uom": 1,
        },
    ).to_list(None)
    return {str(d.get("itemCode") or "").strip(): d for d in docs}


async def list_pending_rm_physical_closing_ids(*, location_id: Optional[str] = None) -> Dict[str, Any]:
    location_id = (location_id or "").strip()
    if not location_id:
        raise HTTPException(status_code=400, detail="locationId is required")

    docs = await outlet_rm_physical_stock_closing_collection().find(
        {"status": PENDING_STATUS, "locationId": location_id},
        {"itemCode": 1, "_id": 0},
    ).to_list(length=None)

    return {"itemCodes": [str(d.get("itemCode") or "").strip() for d in docs if d.get("itemCode")]}


async def submit_rm_physical_closing(
    request: SubmitOutletPhysicalClosingRequest,
) -> Dict[str, Any]:
    await ensure_rm_physical_closing_indexes()
    now = await get_live_utc_datetime()

    closing_collection = outlet_rm_physical_stock_closing_collection()

    location_id = request.resolved_location_id
    created_by = request.resolved_created_by

    requested_map = {item.itemCode: item for item in request.items}
    item_codes = list(requested_map.keys())

    # current system stock of each raw material at this outlet
    stock_docs = await outlet_rm_stock_collection().find(
        {
            "itemType": {"$in": RM_TYPES},
            "locationId": location_id,
            "itemCode": {"$in": _code_variants(item_codes)},
        },
        {"itemCode": 1, "systemStock": 1, "previousSystemStock": 1},
    ).to_list(None)
    stock_map = {str(doc["itemCode"]).strip(): doc for doc in stock_docs if doc.get("itemCode")}

    # item must exist in purchase.rawMaterials
    master_docs = await purchaseitem_collection().find(
        {"itemCode": {"$in": _code_variants(item_codes)}},
        {"itemCode": 1},
    ).to_list(None)
    known_item_codes = {str(doc.get("itemCode")).strip() for doc in master_docs}
    missing_inventory = [code for code in item_codes if code not in known_item_codes]

    existing_pending_docs = await closing_collection.find(
        {"locationId": location_id, "itemCode": {"$in": item_codes}, "status": PENDING_STATUS},
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
                "itemType": "RM",
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
            unexpected_errors = [e for e in write_errors if e.get("code") != 11000]

            if unexpected_errors:
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": "Unable to create RM physical-closing rows",
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
                "message": "No matching raw materials were found",
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
            f"{len(inserted_ids)} RM physical stock item(s) sent for approval"
            if inserted_ids
            else "Physical stock is already pending approval"
        ),
    }


async def list_pending_rm_physical_closings(
    *,
    page: int,
    limit: int,
    location_id: Optional[str] = None,
    closing_month: Optional[str] = None,
) -> Dict[str, Any]:
    collection = outlet_rm_physical_stock_closing_collection()

    query: Dict[str, Any] = {"status": PENDING_STATUS}
    if location_id:
        query["locationId"] = location_id.strip()
    if closing_month:
        start_utc, end_utc = _month_utc_range(closing_month)
        query["createdAt"] = {"$gte": start_utc, "$lt": end_utc}

    skip = (page - 1) * limit
    total, documents = await asyncio.gather(
        collection.count_documents(query),
        collection.find(query).sort("_id", -1).skip(skip).limit(limit).to_list(limit),
    )

    item_codes = [
        str(document.get("itemCode") or "").strip()
        for document in documents
        if document.get("itemCode")
    ]
    meta_map = await _rm_meta_map(item_codes)

    results = [
        _serialize(document, meta_map.get(str(document.get("itemCode") or "").strip()))
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


async def edit_pending_rm_physical_closing(
    closing_id: str,
    item_code: str,
    request: EditPendingOutletPhysicalClosingRequest,
) -> Dict[str, Any]:
    if not ObjectId.is_valid(closing_id):
        raise HTTPException(status_code=400, detail="Invalid closingId")

    object_id = ObjectId(closing_id)
    collection = outlet_rm_physical_stock_closing_collection()

    current = await collection.find_one(
        {"_id": object_id, "itemCode": item_code.strip(), "status": PENDING_STATUS}
    )
    if not current:
        raise HTTPException(status_code=404, detail="Pending physical-closing item was not found")

    current_version = len(_stored_history(current))
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
            status_code=400, detail="New physicalStock is the same as current physicalStock"
        )

    previous_variance = safe_float(current.get("variance"))
    revised_variance = calculate_variance(safe_float(current.get("systemStock")), revised_physical)
    edited_by = request.resolved_editor
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

    # atomic compare-and-set: only one edit can win
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
                "updatedAt": edited_at,
                "lastUpdatedBy": edited_by,
            },
            "$push": {"editHistory": history_entry},
        },
        return_document=ReturnDocument.AFTER,
    )

    if not updated:
        raise HTTPException(
            status_code=409,
            detail="This item changed while you were editing it. Refresh the pending list and try again.",
        )

    meta_map = await _rm_meta_map([str(updated.get("itemCode") or "").strip()])

    return {
        "message": "Pending physical stock updated successfully",
        "item": _serialize(updated, meta_map.get(str(updated.get("itemCode") or "").strip())),
    }