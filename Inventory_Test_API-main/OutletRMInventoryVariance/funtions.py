# OutletRMInventoryVariance/funtions.py
# ─────────────────────────────────────────────────────────────────────────────
# RM version of OutletInventoryVariance/funtions.py (FG). SAME approval logic:
#
#   pending audit request (outletrmphysicalstockclosing, status pendingapproval)
#        --approve-->  Branch_wise_stock.systemStock += variance
#                      approved record  -> approvedstocksOutletRM
#                      stock history    -> outletRMStockHist
#                      closing row      -> status "approved"
#
# Only the data sources differ (see OutletRMInventory/routes.py).
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
from datetime import date
from typing import Any, Dict, List, Optional

from bson import ObjectId

from OutletInventoryVariance.funtions import CLOSING_SOURCE_STATUS, _failure_action, _target_date_parts
from OutletRMInventory.routes import (
    RM_TYPES,
    _branch_name,
    _code_variants,
    _new_stock_doc,
)
from core.compute import ist_now, round_qty, safe_float
from db.collections import (
    approvedstocks_outlet_rm_collection,
    outlet_rm_physical_stock_closing_collection,
    outlet_rm_stock_collection,
    outlet_rm_stock_history_collection,
    purchaseitem_collection,
)

PRECISION = 3  # raw materials are shown with up to 3 decimals


def _r(value: Any) -> float:
    return round_qty(safe_float(value), PRECISION)


def _code(value: Any) -> str:
    return str(value or "").strip()


# ─────────────────────────────────────────────────────────────────────────────
# lookups used by the list screen
# ─────────────────────────────────────────────────────────────────────────────
async def get_stock_map(location_id: str, item_codes: List[str]) -> Dict[str, Dict[str, Any]]:
    if not item_codes:
        return {}
    docs = await (
        outlet_rm_stock_collection()
        .find(
            {
                "itemType": {"$in": RM_TYPES},
                "locationId": location_id,
                "itemCode": {"$in": _code_variants(item_codes)},
            }
        )
        .sort([("updatedAt", -1), ("_id", -1)])
        .to_list(None)
    )
    result: Dict[str, Dict[str, Any]] = {}
    for d in docs:
        result.setdefault(_code(d.get("itemCode")), d)
    return result


async def get_closing_map(
    location_id: str, item_codes: List[str], query_date: Optional[date] = None
) -> Dict[str, Dict[str, Any]]:
    clean_location_id = _code(location_id)
    clean_codes = [c for c in {_code(c) for c in item_codes} if c]
    if not clean_location_id or not clean_codes:
        return {}

    _, target_date_str, _, _ = _target_date_parts(query_date)

    docs = await (
        outlet_rm_physical_stock_closing_collection()
        .find(
            {
                "locationId": clean_location_id,
                "itemCode": {"$in": clean_codes},
                "status": CLOSING_SOURCE_STATUS,
                "itemType": {"$in": RM_TYPES},
            }
        )
        .sort([("updatedAt", -1), ("createdAt", -1)])
        .to_list(None)
    )

    result: Dict[str, Dict[str, Any]] = {}
    for doc in docs:
        code = _code(doc.get("itemCode"))
        if code and code not in result:
            result[code] = {
                "closingDocId": str(doc.get("_id")),
                "updatedCurrentSystem": doc.get("systemStock"),
                "physicalClosing": doc.get("physicalStock"),
                "variance": doc.get("variance"),
                "closingStatus": doc.get("status"),
                "closingDate": doc.get("date") or target_date_str,
                "hasEditHistory": bool(doc.get("editHistory")),
            }
    return result


async def get_approved_map(location_id: str, item_codes: List[str]) -> Dict[str, Dict[str, Any]]:
    clean_location_id = _code(location_id)
    wanted = [_code(x) for x in item_codes if _code(x)]
    if not clean_location_id or not wanted:
        return {}

    docs = await (
        approvedstocks_outlet_rm_collection()
        .find({"locationId": clean_location_id, "itemCode": {"$in": wanted}, "status": "approved"})
        .sort("approvedAt", -1)
        .to_list(None)
    )

    result: Dict[str, Dict[str, Any]] = {}
    for doc in docs:
        code = _code(doc.get("itemCode"))
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


def apply_closing_status(
    result: Dict[str, Any],
    closing_row: Optional[Dict[str, Any]],
    approved_doc: Optional[Dict[str, Any]],
    stock_doc: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Same 3 states as FG: pendingApproval / approved / notAvailable."""
    system_stock = _r((stock_doc or {}).get("systemStock", 0))
    result["currentInventorySystemStock"] = system_stock
    result["currentInventoryPhysicalStock"] = _r((stock_doc or {}).get("physicalStock", 0))

    # 1. pending approval - audit app sent a physical stock
    if closing_row:
        physical_closing = _r(closing_row.get("physicalClosing"))
        result["updatedCurrentSystem"] = system_stock
        result["systemStock"] = system_stock
        result["physicalClosing"] = physical_closing
        result["physicalStock"] = physical_closing
        result["variance"] = _r(physical_closing - system_stock)
        result["previousSystemStock"] = _r((stock_doc or {}).get("previousSystemStock", 0))
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

    # 2. already approved
    if approved_doc:
        result["updatedCurrentSystem"] = system_stock
        result["systemStock"] = system_stock
        result["physicalClosing"] = _r(approved_doc.get("physicalClosing"))
        result["physicalStock"] = result["physicalClosing"]
        result["variance"] = 0.0
        result["previousSystemStock"] = _r(approved_doc.get("systemStockBefore"))
        result["systemStockAfter"] = system_stock
        result["adjustmentQty"] = _r(approved_doc.get("actualVariance"))
        result["status"] = "approved"
        result["approvalStatus"] = "approved"
        result["approvalButton"] = False
        result["canApprove"] = False
        result["stockSource"] = approved_doc.get("source", "APPROVED_HISTORY")
        result["closingDocId"] = approved_doc.get("closingDocId")
        result["closingDate"] = approved_doc.get("closingDate")
        return result

    # 3. nothing from the audit app for this item
    result["updatedCurrentSystem"] = None
    result["systemStock"] = system_stock
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


# ─────────────────────────────────────────────────────────────────────────────
# approve one item
# ─────────────────────────────────────────────────────────────────────────────
async def _get_closing_row(location_id: str, item_code: str) -> Optional[Dict[str, Any]]:
    doc = await outlet_rm_physical_stock_closing_collection().find_one(
        {"locationId": location_id, "itemCode": item_code, "status": CLOSING_SOURCE_STATUS, "itemType": {"$in": RM_TYPES}},
        sort=[("updatedAt", -1), ("createdAt", -1)],
    )
    if not doc:
        return None
    return {
        "closingDocId": str(doc.get("_id")),
        "updatedCurrentSystem": doc.get("systemStock"),
        "physicalClosing": doc.get("physicalStock"),
        "variance": doc.get("variance"),
        "closingStatus": doc.get("status"),
        "closingDate": doc.get("date"),
    }


async def prefetch_masters(item_codes: List[str]) -> Dict[str, Dict[str, Any]]:
    clean = [c for c in {_code(c) for c in item_codes} if c]
    if not clean:
        return {}
    docs = await purchaseitem_collection().find({"itemCode": {"$in": _code_variants(clean)}}).to_list(None)
    return {_code(d.get("itemCode")): d for d in docs}


async def approve_one_rm_closing_item(
    item_code: str,
    location_id: str,
    approved_by: str,
    query_date: Optional[date],
    adjustment_mode: str = "ADJUST_SYSTEM",
    description: str = "",
    tenant_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    _closing_row: Optional[Dict[str, Any]] = None,
    _master: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    stock_col = outlet_rm_stock_collection()
    approved_col = approvedstocks_outlet_rm_collection()
    closing_col = outlet_rm_physical_stock_closing_collection()
    history_col = outlet_rm_stock_history_collection()

    clean_item_code = _code(item_code)
    clean_location_id = _code(location_id)

    if not clean_item_code:
        return {
            "itemCode": clean_item_code,
            "locationId": clean_location_id,
            "success": False,
            "approvalStatus": "invalid",
            "approvalButton": False,
            "message": "Invalid itemCode.",
        }

    master = _master
    if master is None:
        master = await purchaseitem_collection().find_one(
            {"itemCode": {"$in": _code_variants([clean_item_code])}}
        )
    if not master:
        return {
            "itemCode": clean_item_code,
            "locationId": clean_location_id,
            "success": False,
            "approvalStatus": "notAvailable",
            "approvalButton": False,
            "message": f"itemCode {clean_item_code} not found in raw materials.",
        }

    closing_row = _closing_row or await _get_closing_row(clean_location_id, clean_item_code)
    if not closing_row:
        return {
            "itemCode": clean_item_code,
            "locationId": clean_location_id,
            "success": False,
            "approvalStatus": "notAvailable",
            "approvalButton": False,
            "message": "No pending outlet RM closing stock found for this item.",
        }

    incoming_physical_stock = _r(closing_row.get("physicalClosing"))
    now = ist_now()

    def _flip_closing_status_to_approved(closing_doc_id: Optional[str]):
        try:
            closing_object_id = ObjectId(closing_doc_id) if closing_doc_id else None
        except Exception:
            closing_object_id = None

        flt: Dict[str, Any] = (
            {"_id": closing_object_id}
            if closing_object_id
            else {
                "itemCode": clean_item_code,
                "locationId": clean_location_id,
                "status": CLOSING_SOURCE_STATUS,
            }
        )
        return closing_col.update_one(
            flt, {"$set": {"status": "approved", "approvedAt": now, "approvedBy": approved_by}}
        )

    # idempotency pre-check
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

    # live stock row = the truth used for the calculation
    doc = await stock_col.find_one(
        {
            "itemType": {"$in": RM_TYPES},
            "locationId": clean_location_id,
            "itemCode": {"$in": _code_variants([clean_item_code])},
        }
    )

    system_stock_after = incoming_physical_stock
    matched = modified = 0
    upserted_id: Optional[str] = None

    if adjustment_mode == "ADJUST_SYSTEM" and doc:
        current_system_stock = _r(doc.get("systemStock", 0))
        current_physical_stock = _r(doc.get("physicalStock", 0))

        approval_variance = _r(closing_row.get("variance"))
        adjustment_qty = approval_variance
        system_stock_after = _r(current_system_stock + approval_variance)

        res = await stock_col.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "previousSystemStock": current_system_stock,
                    "systemStock": system_stock_after,
                    "physicalStock": incoming_physical_stock,
                    "variance": 0.0,
                    "adjustmentQty": adjustment_qty,
                    "isInitialStock": False,
                    "status": "approved",
                    "updatedAt": now,
                    "lastUpdatedDate": now,
                    "lastUpdatedBy": approved_by,
                    "tenantId": tenant_id or "",
                    "idempotencyKey": idempotency_key or "",
                }
            },
        )
        matched, modified = res.matched_count, res.modified_count

        await history_col.insert_one(
            {
                "itemCode": clean_item_code,
                "locationId": clean_location_id,
                "itemType": "RM",
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
            }
        )
    elif adjustment_mode == "ADJUST_SYSTEM":
        # outlet has no RM stock row yet -> create it (physical becomes the system stock)
        computed = {
            "systemStock": incoming_physical_stock,
            "physicalStock": incoming_physical_stock,
            "previousSystemStock": incoming_physical_stock,
            "currentVariance": 0.0,
            "adjustmentQty": 0.0,
            "isInitialStock": True,
        }
        new_doc = _new_stock_doc(
            clean_item_code,
            clean_location_id,
            await _branch_name(clean_location_id),
            master,
            computed,
            "approved",
            now,
            approved_by,
            tenant_id,
            idempotency_key,
        )
        res = await stock_col.insert_one(new_doc)
        upserted_id = str(res.inserted_id)

        await history_col.insert_one(
            {
                "itemCode": clean_item_code,
                "locationId": clean_location_id,
                "itemType": "RM",
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
            }
        )
    else:
        # KEEP_SYSTEM: only record the physical stock, system stock untouched
        if doc:
            res = await stock_col.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "physicalStock": incoming_physical_stock,
                        "status": "approved",
                        "updatedAt": now,
                        "lastUpdatedDate": now,
                        "lastUpdatedBy": approved_by,
                    }
                },
            )
            matched, modified = res.matched_count, res.modified_count
        else:
            computed = {
                "systemStock": 0.0,
                "physicalStock": incoming_physical_stock,
                "previousSystemStock": 0.0,
                "currentVariance": 0.0,
                "adjustmentQty": 0.0,
                "isInitialStock": True,
            }
            res = await stock_col.insert_one(
                _new_stock_doc(
                    clean_item_code,
                    clean_location_id,
                    await _branch_name(clean_location_id),
                    master,
                    computed,
                    "approved",
                    now,
                    approved_by,
                    tenant_id,
                    idempotency_key,
                )
            )
            upserted_id = str(res.inserted_id)
        system_stock_after = _r((doc or {}).get("systemStock", 0))

    # approval audit record
    system_before = safe_float(doc.get("systemStock", 0)) if doc else incoming_physical_stock
    variance_doc = {
        "itemCode": clean_item_code,
        "itemName": master.get("itemName", ""),
        "itemType": "RM",
        "locationId": clean_location_id,
        "systemStockBefore": system_before,
        "physicalClosing": incoming_physical_stock,
        "actualVariance": incoming_physical_stock - system_before,
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
            "matchedCount": matched,
            "modifiedCount": modified,
            "upsertedId": upserted_id,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# pending codes / approve all / edit history
# ─────────────────────────────────────────────────────────────────────────────
async def get_pending_item_codes(location_id: str, query_date: Optional[date] = None) -> Dict[str, Any]:
    clean_location_id = _code(location_id)

    docs = await outlet_rm_physical_stock_closing_collection().find(
        {
            "locationId": clean_location_id,
            "status": {"$in": ["pending", "variance", CLOSING_SOURCE_STATUS]},
            "itemType": {"$in": RM_TYPES},
        },
        {"itemCode": 1},
    ).to_list(None)

    item_codes = [d.get("itemCode") for d in docs if d.get("itemCode")]
    _, target_date_str, _, _ = _target_date_parts(query_date)

    return {
        "locationId": clean_location_id,
        "date": target_date_str,
        "itemCodes": item_codes,
        "pendingRandomIds": item_codes,  # alias kept for the shared frontend
        "total": len(item_codes),
        "count": len(item_codes),
        "message": None if item_codes else "No pending items found for this branch.",
    }


async def approve_all_branch_items(
    location_id: str,
    query_date: Optional[date],
    approved_by: str,
    description: str,
    adjustment_mode: str = "ADJUST_SYSTEM",
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    clean_location_id = _code(location_id)
    if not clean_location_id:
        return {"success": False, "error": "locationId is required"}

    pending = await get_pending_item_codes(clean_location_id, query_date)
    item_codes = pending.get("itemCodes", [])

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

    masters, closing_map = await asyncio.gather(
        prefetch_masters(item_codes),
        get_closing_map(clean_location_id, item_codes, query_date),
    )

    results: List[Any] = []
    chunk_size = 50
    for i in range(0, len(item_codes), chunk_size):
        chunk = item_codes[i : i + chunk_size]
        results.extend(
            await asyncio.gather(
                *(
                    approve_one_rm_closing_item(
                        item_code=code,
                        location_id=clean_location_id,
                        approved_by=approved_by,
                        query_date=query_date,
                        adjustment_mode=adjustment_mode,
                        description=description or f"Branch bulk approval — {clean_location_id}",
                        tenant_id=tenant_id,
                        _closing_row=closing_map.get(_code(code)),
                        _master=masters.get(_code(code)),
                    )
                    for code in chunk
                ),
                return_exceptions=True,
            )
        )

    normalized = []
    for code, result in zip(item_codes, results):
        if isinstance(result, Exception):
            normalized.append(
                {"itemCode": code, "success": False, "approvalStatus": "error", "message": str(result)}
            )
        else:
            normalized.append(result)

    approved_count = sum(1 for r in normalized if r.get("success") is True)
    not_available = sum(1 for r in normalized if r.get("approvalStatus") == "notAvailable")
    error_count = sum(1 for r in normalized if r.get("approvalStatus") == "error")

    return {
        "success": True,
        "locationId": clean_location_id,
        "totalInClosing": len(item_codes),
        "approved": approved_count,
        "autoVerified": 0,
        "skipped": not_available,
        "flagged": 0,
        "failed": error_count,
        "flaggedItems": [],
        "failedItems": [r for r in normalized if r.get("approvalStatus") == "error"],
        # Failed / skipped items only: exact reason + what to do (shown in UI)
        "failedReasons": [
            {
                "itemCode": _code(r.get("itemCode")),
                "reason": r.get("message") or "Approval failed",
                "action": _failure_action(r),
            }
            for r in normalized
            if r.get("success") is not True
        ],
        "message": (
            f"Branch approval complete. Approved: {approved_count}, "
            f"Skipped: {not_available}, Failed: {error_count}"
        ),
    }


async def get_rm_closing_edit_history(location_id: str, item_code: str) -> Dict[str, Any]:
    clean_location_id = _code(location_id)
    clean_item_code = _code(item_code)

    if not clean_location_id or not clean_item_code:
        return {"history": [], "itemCode": clean_item_code, "locationId": clean_location_id}

    doc = await outlet_rm_physical_stock_closing_collection().find_one(
        {"locationId": clean_location_id, "itemCode": clean_item_code, "status": CLOSING_SOURCE_STATUS},
        {"_id": 0, "editHistory": 1},
        sort=[("updatedAt", -1), ("createdAt", -1)],
    )

    history: List[Dict[str, Any]] = []
    if doc:
        history = sorted(
            doc.get("editHistory") or [],
            key=lambda h: str(h.get("editedAt", "")),
            reverse=True,
        )

    return {"history": history, "itemCode": clean_item_code, "locationId": clean_location_id}