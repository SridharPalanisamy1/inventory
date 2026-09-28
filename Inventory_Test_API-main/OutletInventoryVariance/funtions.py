from __future__ import annotations
import asyncio
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from bson import ObjectId
from pydantic import Field
from core.compute import ist_now, round_qty, safe_float
from core.lookups import get_uom_precision_map
from core.models import TenantAuditMixin
from db.collections import (
    approvedstocks_fg_collection,
    inventorytest_stock_collection,
    item_master_collection,
    outlet_physical_stock_closing_collection,
    stock_history_collection,
)


CLOSING_SOURCE_STATUS = "pendingapproval"

# outletphysicalstockclosing holds FG + RM rows. FG approval checks FG rows only.
FG_ITEM_TYPES = ["FG", "fg", "Fg"]
# itemType missing / null / "" -> treated as FG (monitor app posts itemType only for RM)
FG_CLOSING_FILTER = {"itemType": {"$in": FG_ITEM_TYPES + [None, ""]}}


def _failure_action(result: Dict[str, Any], stage: str = "") -> str:
    """What the user should do for a failed / skipped approval item."""
    msg = str(result.get("message") or "").lower()
    status = result.get("approvalStatus")
    if status == "notAvailable" and "not found in" in msg:
        return "Item code is not in the item master. Add it to the master, or remove this request from the monitor app and resubmit."
    if status == "notAvailable":
        return "No pending request found for this item. Resubmit physical stock from the monitor app."
    if status == "error":
        return "Server error while approving. Check the backend log for this item and click Approve All again."
    if stage == "inventory":
        return "Stock row was not updated. Check the stock row for this item and location, then click Approve All again."
    if stage == "approval":
        return "Approval record was not saved. Click Approve All again (already-approved items are not changed twice)."
    if stage == "pending":
        return "Request is still pending in the closing collection. Check that request document's _id / status, then click Approve All again."
    return "Click Approve All again. If it still fails, check the backend log."

 
def _master():
    return item_master_collection()


class BulkApproveItemRequest(TenantAuditMixin):
    itemCodes: List[str] = Field(default_factory=list)
    approved_by: str = "Inventory"
    description: str = ""
    adjustmentMode: str = "ADJUST_SYSTEM"


class ApproveAllBranchRequest(TenantAuditMixin):
    approved_by: str = "Inventory"
    description: str = ""
    adjustmentMode: str = "ADJUST_SYSTEM"
    varianceThresholdPct: Optional[float] = None
    varianceThresholdUnits: Optional[float] = None


def _target_date_parts(query_date: Optional[date]):
    target_date = query_date or ist_now().date()
    target_date_str = target_date.isoformat()
    start_dt = datetime.combine(target_date, datetime.min.time())
    end_dt = start_dt + timedelta(days=1)
    return target_date, target_date_str, start_dt, end_dt




async def _get_closing_row(
    *,
    location_id: str,
    item_code: str,
    query_date: Optional[date] = None,
) -> Optional[Dict[str, Any]]:
    _, target_date_str, _, _ = _target_date_parts(query_date)

    closing_doc = await outlet_physical_stock_closing_collection().find_one(
        {
            "locationId": location_id,
            "itemCode": item_code,
            "status": CLOSING_SOURCE_STATUS,
            **FG_CLOSING_FILTER,
        },
        sort=[("updatedAt", -1), ("createdAt", -1)],
    )

    if not closing_doc:
        return None

    return {
        "closingDocId": str(closing_doc.get("_id")),
        "updatedCurrentSystem": closing_doc.get("systemStock"),
        "physicalClosing": closing_doc.get("physicalStock"),
        "variance": closing_doc.get("variance"),
        "closingStatus": closing_doc.get("status"),
        "closingDate": closing_doc.get("date") or target_date_str,
    }


async def _get_stock_closing_map(
    location_id: str,
    item_codes: List[str],
    query_date: Optional[date] = None,
) -> Dict[str, Dict[str, Any]]:
    clean_location_id = str(location_id or "").strip()
    clean_codes = [c for c in {str(c or "").strip() for c in item_codes} if c]

    if not clean_location_id or not clean_codes:
        return {}

    _, target_date_str, _, _ = _target_date_parts(query_date)

    docs = await (
        outlet_physical_stock_closing_collection()
        .find(
            {
                "locationId": clean_location_id,
                "itemCode": {"$in": clean_codes},
                "status": CLOSING_SOURCE_STATUS,
                **FG_CLOSING_FILTER,
            },
            sort=[("updatedAt", -1), ("createdAt", -1)],
        )
        .to_list(None)
    )

    result: Dict[str, Dict[str, Any]] = {}
    for doc in docs:
        code = str(doc.get("itemCode") or "").strip()
        if code and code not in result:
            result[code] = {
                "closingDocId": str(doc.get("_id")),
                "updatedCurrentSystem": doc.get("systemStock"),
                "physicalClosing": doc.get("physicalStock"),
                "variance": doc.get("variance"),
                "closingStatus": doc.get("status"),
                "closingDate": doc.get("date") or target_date_str,
            }

    return result


async def _get_approved_map_by_closing(
    location_id: str,
    item_codes: List[str],
    closing_map: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    clean_location_id = str(location_id or "").strip()
    wanted = [str(x or "").strip() for x in item_codes if str(x or "").strip()]

    if not clean_location_id or not wanted:
        return {}

    docs = (
        await approvedstocks_fg_collection()
        .find(
            {
                "locationId": clean_location_id,
                "itemCode": {"$in": wanted},
                "status": "approved",
            }
        )
        .sort("approvedAt", -1)
        .to_list(None)
    )

    result: Dict[str, Dict[str, Any]] = {}
    for doc in docs:
        code = str(doc.get("itemCode") or "").strip()
        if code and code not in result:
            result[code] = {
                "approvalId": str(doc.get("_id")),
                "itemCode": code,
                "actualVariance": doc.get("actualVariance"),
                "systemStockBefore": doc.get("systemStockBefore"),
                "physicalClosing": doc.get("physicalClosing"),
                "systemStockAfter": doc.get("systemStockAfter"),
                "approvedBy": doc.get("approvedBy"),
                "approvedAt": doc.get("approvedAt"),
                "source": doc.get("source"),
                "closingDocId": doc.get("closingDocId"),
                "closingDate": doc.get("closingDate"),
            }

    return result



def _apply_stock_closing_status(
    result: Dict[str, Any],
    item_code: str,
    precision: int,
    closing_row: Optional[Dict[str, Any]],
    approved_doc: Optional[Dict[str, Any]],
    inventory_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    inventory_system_stock = round_qty(
        safe_float((inventory_doc or {}).get("systemStock", 0)), precision
    )
    result["currentInventorySystemStock"] = inventory_system_stock
    result["currentInventoryPhysicalStock"] = round_qty(
        safe_float((inventory_doc or {}).get("physicalStock", 0)), precision
    )

    # ── 1. Pending approval (closing doc exists, not yet approved) ─────────
    if closing_row:
        physical_closing = round_qty(
            safe_float(closing_row.get("physicalClosing")), precision
        )
        # Recalculated from current values — mirrors warehouse where
        # variance = round_by_precision(physical_stock - system_stock, precision)
        variance = round_qty(physical_closing - inventory_system_stock, precision)

        result["updatedCurrentSystem"] = inventory_system_stock
        result["systemStock"] = inventory_system_stock
        result["physicalClosing"] = physical_closing
        result["physicalStock"] = physical_closing
        result["variance"] = variance
        result["previousSystemStock"] = round_qty(
            safe_float((inventory_doc or {}).get("previousSystemStock", 0)),
            precision,
        )
        result["adjustmentQty"] = None
        result["systemStockAfter"] = None
        result["stockSource"] = "STOCK_CLOSING_APP"
        result["closingDocId"] = closing_row.get("closingDocId")
        result["closingDate"] = closing_row.get("closingDate")

        result["status"] = "pendingApproval"
        result["approvalStatus"] = "pendingApproval"
        result["approvalButton"] = True
        result["canApprove"] = True
        return result


    if approved_doc:
        live_system_stock = inventory_system_stock

        system_stock_before = round_qty(
            safe_float(
                approved_doc.get(
                    "systemStockBefore",
                    (inventory_doc or {}).get("previousSystemStock", 0),
                )
            ),
            precision,
        )

        physical_closing = round_qty(
            safe_float(
                approved_doc.get(
                    "physicalClosing",
                    (inventory_doc or {}).get("physicalStock", 0),
                )
            ),
            precision,
        )

        actual_variance = round_qty(
            safe_float(approved_doc.get("actualVariance", 0)),
            precision,
        )

        result["updatedCurrentSystem"] = live_system_stock
        result["systemStock"] = live_system_stock
        result["physicalClosing"] = physical_closing
        result["physicalStock"] = physical_closing
        result["variance"] = 0.0
        result["previousSystemStock"] = system_stock_before
        result["systemStockAfter"] = live_system_stock
        result["adjustmentQty"] = actual_variance

        result["status"] = "approved"
        result["approvalStatus"] = "approved"
        result["approvalButton"] = False
        result["canApprove"] = False

        result["stockSource"] = approved_doc.get(
            "source",
            "APPROVED_HISTORY",
        )
        result["closingDocId"] = approved_doc.get("closingDocId")
        result["closingDate"] = approved_doc.get("closingDate")

        return result

    # ── 3. No closing document for this item ────────────────────────────────
    result["updatedCurrentSystem"] = None
    result["systemStock"] = inventory_system_stock
    result["physicalClosing"] = None
    result["physicalStock"] = None
    result["variance"] = None
    result["previousSystemStock"] = None
    result["systemStockAfter"] = None
    result["adjustmentQty"] = None
    result["status"] = "notAvailable"
    result["approvalStatus"] = "notAvailable"
    result["approvalButton"] = False
    result["canApprove"] = False
    result["stockSource"] = "NO_STOCK_CLOSING"
    return result


async def _prefetch_item_docs(
    item_codes: List[str],
) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, int]]:
    clean_codes = [c for c in {str(c or "").strip() for c in item_codes} if c]
    if not clean_codes:
        return {}, {}

    item_master_docs, uom_precision_map = await asyncio.gather(
        _master().find({"itemCode": {"$in": clean_codes}}).to_list(None),
        get_uom_precision_map(),
    )
    item_doc_map = {
        str(d.get("itemCode") or "").strip(): d for d in item_master_docs
    }
    return item_doc_map, uom_precision_map

async def _approve_one_stock_closing_item(
    item_code: str,
    location_id: str,
    approved_by: str,
    query_date: Optional[date],
    adjustment_mode: str = "ADJUST_SYSTEM",
    description: str = "",
    tenant_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    _closing_row: Optional[Dict[str, Any]] = None,
    _item_doc: Optional[Dict[str, Any]] = None,
    _precision: Optional[int] = None,
) -> Dict[str, Any]:
    inventory_col = inventorytest_stock_collection()
    approved_col = approvedstocks_fg_collection()
    closing_col = outlet_physical_stock_closing_collection()
    history_col = stock_history_collection()

    clean_item_code = str(item_code or "").strip()
    clean_location_id = str(location_id or "").strip()

    if not clean_item_code:
        return {
            "itemCode": clean_item_code,
            "locationId": clean_location_id,
            "success": False,
            "approvalStatus": "invalid",
            "approvalButton": False,
            "message": "Invalid itemCode.",
        }

    # 1. Item master + UOM precision (skip if pre-fetched)
    item_doc = _item_doc
    precision = _precision
    if item_doc is None:
        item_doc = await _master().find_one({"itemCode": clean_item_code})
    if not item_doc:
        return {
            "itemCode": clean_item_code,
            "locationId": clean_location_id,
            "success": False,
            "approvalStatus": "notAvailable",
            "approvalButton": False,
            "message": f"itemCode {clean_item_code} not found in item master.",
        }
    if precision is None:
        uom_map = await get_uom_precision_map()
        precision = uom_map.get(item_doc.get("item_Uom"), 0)

    # 2. Pending closing row (skip if pre-fetched)
    closing_row = _closing_row
    if closing_row is None:
        closing_row = await _get_closing_row(
            location_id=clean_location_id,
            item_code=clean_item_code,
            query_date=query_date,
        )

    if not closing_row:
        return {
            "itemCode": clean_item_code,
            "locationId": clean_location_id,
            "success": False,
            "approvalStatus": "notAvailable",
            "approvalButton": False,
            "message": "No pending outlet closing stock found for this item.",
        }

    incoming_physical_stock = round_qty(
        safe_float(closing_row.get("physicalClosing")), precision
    )

    now = ist_now()

    def _flip_closing_status_to_approved(closing_doc_id: Optional[str]):
        try:
            closing_object_id = ObjectId(closing_doc_id) if closing_doc_id else None
        except Exception:
            closing_object_id = None

        if closing_object_id:
            return closing_col.update_one(
                {"_id": closing_object_id},
                {
                    "$set": {
                        "status": "approved",
                        "approvedAt": now,
                        "approvedBy": approved_by,
                    }
                },
            )

        return closing_col.update_one(
            {
                "itemCode": clean_item_code,
                "locationId": clean_location_id,
                "status": CLOSING_SOURCE_STATUS,
                **FG_CLOSING_FILTER,
            },
            {
                "$set": {
                    "status": "approved",
                    "approvedAt": now,
                    "approvedBy": approved_by,
                }
            },
        )

    # 3. Idempotency pre-check
    already = await approved_col.find_one(
        {
            "locationId": clean_location_id,
            "itemCode": clean_item_code,
            "closingDocId": closing_row.get("closingDocId"),
            "physicalClosing": incoming_physical_stock,
            "status": "approved",
        }
    )

    if already:
        await _flip_closing_status_to_approved(closing_row.get("closingDocId"))
        return {
            "itemCode": clean_item_code,
            "locationId": clean_location_id,
            "success": True,
            "approvalStatus": "approved",
            "approvalButton": False,
            "message": "Already approved. Inventory stock synced successfully.",
            "approvalId": str(already.get("_id")),
            "updatedSystemStock": incoming_physical_stock,
            "varianceAfterApproval": 0,
            "inventoryUpdate": {"matchedCount": 0, "modifiedCount": 0, "upsertedId": None},
        }

    # 4. Current inventory doc (the LIVE truth used for the calculation)
    doc = await inventory_col.find_one(
        {
            "$or": [
                {"locationId": clean_location_id, "itemCode": clean_item_code},
                {"branch": clean_location_id, "itemCode": clean_item_code},
            ],
        }
    )

    system_stock_after = incoming_physical_stock
    inventory_update_result = None

    if adjustment_mode == "ADJUST_SYSTEM":
        if doc:
            current_system_stock = round_qty(safe_float(doc.get("systemStock", 0)), precision)
            current_physical_stock = round_qty(safe_float(doc.get("physicalStock", 0)), precision)


            approval_variance = round_qty(safe_float(closing_row.get("variance")), precision)
            adjustment_qty = approval_variance

            system_stock_after = round_qty(current_system_stock + approval_variance, precision)
            new_variance = 0.0

            update_data = {
                "previousSystemStock": current_system_stock,
                "systemStock": system_stock_after,
                "physicalStock": incoming_physical_stock,
                "variance": new_variance,
                "adjustmentQty": adjustment_qty,
                "isInitialStock": False,
                "status": "approved",
                "updatedAt": now,
                "lastUpdatedBy": approved_by,
                "tenantId": tenant_id or "",
                "idempotencyKey": idempotency_key or "",
            }

            inventory_update_result = await inventory_col.update_one(
                {"_id": doc["_id"]},
                {"$set": update_data},
            )

            await history_col.insert_one({
                "itemCode": clean_item_code,
                "locationId": clean_location_id,
                "itemType": item_doc.get("itemType", ""),
                "beforeStock": current_physical_stock,
                "afterStock": incoming_physical_stock,
                "variance": approval_variance,
                "adjustmentQty": adjustment_qty,
                "isInitialStock": False,
                "status": "approved",
                "updatedAt": now,
                "action": "STOCK_CLOSING_APPROVE",
                "updatedBy": approved_by,
                "description": description or "Stock adjusted based on physical variance approval",
                "tenantId": tenant_id or "",
                "idempotencyKey": idempotency_key or "",
            })
        else:
            # Fallback if inventory document doesn't exist yet.
            update_data = {
                "locationId": clean_location_id,
                "itemCode": clean_item_code,
                "itemType": item_doc.get("itemType", ""),
                "systemStock": incoming_physical_stock,
                "physicalStock": incoming_physical_stock,
                "systemStockSo": 0,
                "physicalStockSo": 0,
                "previousSystemStock": incoming_physical_stock,
                "variance": 0.0,
                "adjustmentQty": 0.0,
                "isInitialStock": True,
                "status": "approved",
                "createdAt": now,
                "updatedAt": now,
                "createdBy": approved_by,
                "lastUpdatedBy": approved_by,
                "tenantId": tenant_id or "",
                "idempotencyKey": idempotency_key or "",
            }

            inventory_update_result = await inventory_col.update_one(
                {"itemCode": clean_item_code, "locationId": clean_location_id},
                {"$set": update_data},
                upsert=True,
            )

            await history_col.insert_one({
                "itemCode": clean_item_code,
                "locationId": clean_location_id,
                "itemType": item_doc.get("itemType", ""),
                "beforeStock": 0,
                "afterStock": incoming_physical_stock,
                "variance": incoming_physical_stock,
                "adjustmentQty": incoming_physical_stock,
                "isInitialStock": True,
                "status": "approved",
                "updatedAt": now,
                "action": "APPROVAL_CREATE",
                "updatedBy": approved_by,
                "description": description or "Stock initialized based on physical variance approval",
                "tenantId": tenant_id or "",
                "idempotencyKey": idempotency_key or "",
            })
    else:
        # KEEP_SYSTEM
        inventory_update_result = await inventory_col.update_one(
            {"locationId": clean_location_id, "itemCode": clean_item_code},
            {
                "$set": {
                    "physicalStock": incoming_physical_stock,
                    "status": "approved",
                    "updatedAt": now,
                    "lastUpdatedBy": approved_by,
                }
            },
            upsert=True,
        )

    # 5. Approval audit record
    variance_doc = {
        "itemCode": clean_item_code,
        "itemName": item_doc.get("varianceName", ""),
        "locationId": clean_location_id,
        "systemStockBefore": doc.get("systemStock", 0) if doc else incoming_physical_stock,
        "physicalClosing": incoming_physical_stock,
        "actualVariance": incoming_physical_stock
        - (doc.get("systemStock", 0) if doc else incoming_physical_stock),
        "systemStockAfter": system_stock_after,
        "status": "approved",
        "source": "STOCK_CLOSING_APP",
        "closingDocId": closing_row.get("closingDocId"),
        "closingDate": closing_row.get("closingDate"),
        "closingStatus": closing_row.get("closingStatus"),
        "adjustmentMode": adjustment_mode,
        "approvedBy": approved_by,
        "description": description,
        "approvedAt": now,
        "tenantId": tenant_id or "",
        "idempotencyKey": idempotency_key or "",
    }
    insert_result = await approved_col.insert_one(variance_doc.copy())
    variance_doc["_id"] = str(insert_result.inserted_id)

    await _flip_closing_status_to_approved(closing_row.get("closingDocId"))

    return {
        "itemCode": clean_item_code,
        "locationId": clean_location_id,
        "success": True,
        "message": "Stock variance approved successfully",
        "data": {
            **variance_doc,
            "physicalClosing": incoming_physical_stock,
            "systemStockAfter": system_stock_after,
            "variance": 0.0,
            "actualVariance": variance_doc.get("actualVariance"),
        },
        "updatedSystemStock": system_stock_after,
        "varianceAfterApproval": 0.0,
        "approvalStatus": "approved",
        "approvalButton": False,
        "status": "approved",
        "inventoryUpdate": {
            "matchedCount": inventory_update_result.matched_count if inventory_update_result else 0,
            "modifiedCount": inventory_update_result.modified_count if inventory_update_result else 0,
            "upsertedId": (
                str(inventory_update_result.upserted_id)
                if inventory_update_result and getattr(inventory_update_result, "upserted_id", None)
                else None
            ),
        },
    }



async def approve_all_branch_items(
    location_id: str,
    query_date: Optional[date],
    approved_by: str,
    description: str,
    adjustment_mode: str = "ADJUST_SYSTEM",
    variance_threshold_pct: Optional[float] = None,
    variance_threshold_units: Optional[float] = None,
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    clean_location_id = str(location_id or "").strip()

    if not clean_location_id:
        return {"success": False, "error": "locationId is required"}

    pending_data = await get_pending_item_codes(
        location_id=clean_location_id,
        query_date=query_date,
    )

    item_codes = pending_data.get("itemCodes", [])

    if not item_codes:
        return {
            "success": True,
            "locationId": clean_location_id,
            "totalInClosing": 0,
            "approved": 0,
            "autoVerified": 0,
            "skipped": 0,
            "flagged": 0,
            "failed": 0,
            "flaggedItems": [],
            "failedItems": [],
            "message": "No pending items found for approval.",
        }

    item_doc_map, uom_precision_map = await _prefetch_item_docs(item_codes)
    closing_map = await _get_stock_closing_map(clean_location_id, item_codes, query_date)

    results: List[Any] = []
    chunk_size = 50
    for i in range(0, len(item_codes), chunk_size):
        chunk = item_codes[i : i + chunk_size]
        chunk_results = await asyncio.gather(
            *(
                _approve_one_stock_closing_item(
                    item_code=code,
                    location_id=clean_location_id,
                    approved_by=approved_by,
                    query_date=query_date,
                    adjustment_mode=adjustment_mode,
                    description=description or f"Branch bulk approval — {clean_location_id}",
                    tenant_id=tenant_id,
                    _closing_row=closing_map.get(code),
                    _item_doc=item_doc_map.get(code),
                    _precision=(
                        uom_precision_map.get((item_doc_map.get(code) or {}).get("item_Uom"), 0)
                        if code in item_doc_map
                        else None
                    ),
                )
                for code in chunk
            ),
            return_exceptions=True,
        )
        results.extend(chunk_results)

    normalized_results = []

    for code, result in zip(item_codes, results):
        if isinstance(result, Exception):
            normalized_results.append(
                {
                    "itemCode": code,
                    "success": False,
                    "approvalStatus": "error",
                    "message": str(result),
                }
            )
        else:
            normalized_results.append(result)

    approved_count = sum(
        1
        for r in normalized_results
        if r.get("success") is True
    )

    not_available_count = sum(
        1 for r in normalized_results
        if r.get("approvalStatus") == "notAvailable"
    )

    error_count = sum(
        1 for r in normalized_results
        if r.get("approvalStatus") == "error"
    )

    # ============================================================
    # FINAL DATABASE VERIFICATION
    # UI success MUST depend on this verification.
    # ============================================================

    inventory_col = inventorytest_stock_collection()
    approved_col = approvedstocks_fg_collection()
    closing_col = outlet_physical_stock_closing_collection()

    verification_results: List[Dict[str, Any]] = []

    clean_codes = [
        str(code or "").strip()
        for code in item_codes
        if str(code or "").strip()
    ]

    # ============================================================
    # VERIFY DATABASE IN BULK
    # Instead of 3 DB queries for EVERY item,
    # perform bulk queries and compare results in memory.
    # ============================================================

    inventory_cursor = inventory_col.find(
        {
            "itemCode": {"$in": clean_codes},
            "$or": [
                {"locationId": clean_location_id},
                {"branch": clean_location_id},
            ],
            "status": "approved",
        },
        {
            "_id": 0,
            "itemCode": 1,
        },
    )

    inventory_docs = await inventory_cursor.to_list(length=None)

    inventory_verified_codes = {
        str(doc.get("itemCode", "")).strip()
        for doc in inventory_docs
        if doc.get("itemCode")
    }

    # ------------------------------------------------------------
    # Approved stock verification
    # ------------------------------------------------------------

    approved_cursor = approved_col.find(
        {
            "locationId": clean_location_id,
            "itemCode": {"$in": clean_codes},
            "status": "approved",
        },
        {
            "_id": 0,
            "itemCode": 1,
        },
    )

    approved_docs = await approved_cursor.to_list(length=None)

    approved_verified_codes = {
        str(doc.get("itemCode", "")).strip()
        for doc in approved_docs
        if doc.get("itemCode")
    }

    # ------------------------------------------------------------
    # Check which items STILL remain pending
    # ------------------------------------------------------------

    pending_cursor = closing_col.find(
        {
            "locationId": clean_location_id,
            "itemCode": {"$in": clean_codes},
            "status": CLOSING_SOURCE_STATUS,
            **FG_CLOSING_FILTER,
        },
        {
            "_id": 0,
            "itemCode": 1,
        },
    )

    pending_docs = await pending_cursor.to_list(length=None)

    still_pending_codes = {
        str(doc.get("itemCode", "")).strip()
        for doc in pending_docs
        if doc.get("itemCode")
    }

    # ------------------------------------------------------------
    # Build verification result
    # ------------------------------------------------------------

    for clean_code in clean_codes:

        inventory_updated = clean_code in inventory_verified_codes
        approval_created = clean_code in approved_verified_codes
        pending_cleared = clean_code not in still_pending_codes

        verified = (
            inventory_updated
            and approval_created
            and pending_cleared
        )

        verification_results.append(
            {
                "itemCode": clean_code,
                "verified": verified,
                "inventoryUpdated": inventory_updated,
                "approvalCreated": approval_created,
                "pendingCleared": pending_cleared,
            }
        )
    # Failed items only: exact reason + what to do (shown in UI)
    approve_result_map = {
        str(r.get("itemCode", "")).strip(): r for r in normalized_results
    }
    failed_reasons: List[Dict[str, Any]] = []
    for v in verification_results:
        if v["verified"]:
            continue
        r = approve_result_map.get(v["itemCode"]) or {}
        if r.get("success") is not True:
            reason = r.get("message") or "Approval failed"
            action = _failure_action(r)
        elif not v["inventoryUpdated"]:
            reason = "Inventory stock not updated (outletinventoryStock)"
            action = _failure_action(r, "inventory")
        elif not v["approvalCreated"]:
            reason = "Approval record not created (approvedstocksOutlet)"
            action = _failure_action(r, "approval")
        else:
            reason = "Request still pendingapproval (outletphysicalstockclosing)"
            action = _failure_action(r, "pending")
        failed_reasons.append(
            {"itemCode": v["itemCode"], "reason": reason, "action": action}
        )

    verified_count = sum(
        1 for item in verification_results
        if item["verified"]
    )

    verification_failed_items = [
        item for item in verification_results
        if not item["verified"]
    ]

    db_verified = (
        len(item_codes) > 0
        and verified_count == len(item_codes)
        and len(verification_failed_items) == 0
    )

    return {
        # IMPORTANT:
        # success is TRUE only after actual DB verification
        "success": db_verified,
        "dbVerified": db_verified,

        "locationId": clean_location_id,
        "totalInClosing": len(item_codes),

        "approved": approved_count,
        "verified": verified_count,

        "autoVerified": 0,
        "skipped": not_available_count,
        "flagged": 0,
        "failed": error_count + len(verification_failed_items),

        "flaggedItems": [],

        "failedItems": [
            r for r in normalized_results
            if r.get("approvalStatus") == "error"
        ],

        "verificationResults": verification_results,
        "verificationFailedItems": verification_failed_items,
        "failedReasons": failed_reasons,

        "message": (
            f"Database verification successful. "
            f"{verified_count}/{len(item_codes)} items verified."
            if db_verified
            else
            f"Database verification failed. "
            f"{verified_count}/{len(item_codes)} items verified."
        ),
    }



async def get_pending_item_codes(
    location_id: str,
    query_date: Optional[date] = None,
) -> Dict[str, Any]:
    clean_location_id = str(location_id or "").strip()

    query = {
        "locationId": clean_location_id,
        "status": {"$in": ["pending", "variance", CLOSING_SOURCE_STATUS]},
        **FG_CLOSING_FILTER,
    }

    cursor = outlet_physical_stock_closing_collection().find(query, {"itemCode": 1})
    docs = await cursor.to_list(None)

    item_codes = [d.get("itemCode") for d in docs if d.get("itemCode")]

    _, target_date_str, _, _ = _target_date_parts(query_date)

    return {
        "locationId": clean_location_id,
        "date": target_date_str,
        "itemCodes": item_codes,
        "pendingRandomIds": item_codes,  # alias kept for any legacy callers
        "total": len(item_codes),
        "count": len(item_codes),
        "message": None if item_codes else "No pending items found for this branch.",
    }



async def get_outlet_closing_edit_history(
    location_id: str,
    item_code: str,
) -> Dict[str, Any]:
    """
    Fetch edit history ONLY from the latest pendingapproval document.
    Mirrors warehouse — shows only current pending cycle's edits, not all history.
    """
    clean_location_id = str(location_id or "").strip()
    clean_item_code = str(item_code or "").strip()

    if not clean_location_id or not clean_item_code:
        return {
            "history": [],
            "itemCode": clean_item_code,
            "locationId": clean_location_id,
        }

    doc = await (
        outlet_physical_stock_closing_collection()
        .find_one(
            {
                "locationId": clean_location_id,
                "itemCode": clean_item_code,
                "status": "pendingapproval",
            },
            {
                "_id": 0,
                "editHistory": 1,
            },
            sort=[("updatedAt", -1), ("createdAt", -1)],
        )
    )

    history = []
    if doc:
        edit_history = doc.get("editHistory") or []
        # Sort most recent edit first
        history = sorted(
            edit_history,
            key=lambda h: str(h.get("editedAt", "")),
            reverse=True,
        )

    return {
        "history": history,
        "itemCode": clean_item_code,
        "locationId": clean_location_id,
    }