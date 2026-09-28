# OutletRMInventoryVariance/routes.py
# ─────────────────────────────────────────────────────────────────────────────
# Outlet RM "Physical Stock Variance Modification" (approval screen).
#
# Same API contract as OutletInventoryVariance (FG) so the outlet variance
# screen reuses the same slice / table; only the data sources differ:
#
#   rows      : purchase.rawMaterials (all raw materials, like FG lists ItemMaster)
#   stock     : Branch_wise_stock (itemType RM)
#   requests  : outletrmphysicalstockclosing  <- posted by the audit app
#   approved  : approvedstocksOutletRM
#
# RM has no variance name, so `varianceName` carries the raw-material name (the
# table column is relabelled "Item Name" for RM on the frontend). Movement
# columns (receiving / stock in-out / sales / wastage) are 0 for RM.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Query

from OutletInventoryVariance.funtions import ApproveAllBranchRequest, BulkApproveItemRequest
from OutletInventoryVariance.models import ApproveItemRequest
from OutletRMInventory.routes import (
    CATEGORY_FIELD,
    SUBCATEGORY_FIELD,
    _empty_options,
    _item_options,
    _master_filter,
    _text_options,
)
from core.compute import ist_now, safe_float
from db.collections import (
    approvedstocks_outlet_rm_collection,
    outlet_rm_physical_stock_closing_collection,
    purchaseitem_collection,
)

from .funtions import (
    PRECISION,
    _code,
    _r,
    apply_closing_status,
    approve_all_branch_items,
    approve_one_rm_closing_item,
    get_approved_map,
    get_closing_map,
    get_pending_item_codes,
    get_rm_closing_edit_history,
    get_stock_map,
    prefetch_masters,
)

router = APIRouter()


def _skeleton(raw: Dict[str, Any]) -> Dict[str, Any]:
    code = _code(raw.get("itemCode"))
    name = raw.get("itemName") or ""
    group = raw.get("itemgroupName") or name
    category = raw.get(CATEGORY_FIELD)
    sub_category = raw.get(SUBCATEGORY_FIELD)
    return {
        "id": str(raw["_id"]),
        "itemCode": code,
        "uomPrecision": PRECISION,
        "category": {"id": category, "name": (category or "").upper() or None},
        "subCategory": {"id": sub_category, "name": (sub_category or "").upper() or None},
        "itemName": {"id": code, "name": group},
        "varianceName": {"id": code, "name": name},  # RM: the raw-material name
        "openingStockQty": 0.0,
        "receivedQty": 0.0,
        "stockTransferInQty": 0.0,
        "stockTransferOutQty": 0.0,
        "salesQty": 0.0,
        "salesReturnQty": 0.0,
        "wastageReceivedQty": 0.0,
        "wastageReturnQty": 0.0,
        "closingStockQty": 0.0,
    }


async def _filter_options(
    category: Optional[str],
    sub_category: Optional[str],
    item_name: Optional[str],
    category_page: int,
    category_limit: int,
    category_search: Optional[str],
    sub_page: int,
    sub_limit: int,
    sub_search: Optional[str],
    item_page: int,
    item_limit: int,
    item_search: Optional[str],
) -> Dict[str, Any]:
    categories, sub_categories, item_names = await asyncio.gather(
        _text_options(
            CATEGORY_FIELD,
            _master_filter(category, sub_category, item_name, exclude="category"),
            category_page,
            category_limit,
            category_search,
        ),
        _text_options(
            SUBCATEGORY_FIELD,
            _master_filter(category, sub_category, item_name, exclude="subCategory"),
            sub_page,
            sub_limit,
            sub_search,
        ),
        _item_options(
            _master_filter(category, sub_category, item_name, exclude="itemName"),
            item_page,
            item_limit,
            item_search,
        ),
    )
    return {
        "category": categories,
        "subCategory": sub_categories,
        "itemName": item_names,
        "varianceName": _empty_options(1, 20),
    }


# ─────────────────────────────────────────────────────────────────────────────
# list
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/")
async def get_items(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    branch: str = Query(...),
    category: Optional[str] = Query(None),
    subCategory: Optional[str] = Query(None),
    itemName: Optional[str] = Query(None),
    varianceName: Optional[str] = Query(None),  # not used for RM (kept for the shared frontend)
    queryDate: Optional[date] = Query(None),
    include_filter_options: bool = Query(True),
    only_filter_options: bool = Query(False),
    categoryPage: int = Query(1, ge=1),
    categoryLimit: int = Query(20, ge=1),
    categorySearch: Optional[str] = Query(None),
    subCategoryPage: int = Query(1, ge=1),
    subCategoryLimit: int = Query(20, ge=1),
    subCategorySearch: Optional[str] = Query(None),
    itemNamePage: int = Query(1, ge=1),
    itemNameLimit: int = Query(20, ge=1),
    itemNameSearch: Optional[str] = Query(None),
):
    clean_branch = str(branch or "").strip()

    async def options():
        return await _filter_options(
            category, subCategory, itemName,
            categoryPage, categoryLimit, categorySearch,
            subCategoryPage, subCategoryLimit, subCategorySearch,
            itemNamePage, itemNameLimit, itemNameSearch,
        )

    if only_filter_options:
        return {"filterOptions": await options()} if include_filter_options else {}

    master = purchaseitem_collection()
    query = _master_filter(category, subCategory, itemName)
    skip = (page - 1) * limit

    total, raw_items = await asyncio.gather(
        master.count_documents(query),
        master.find(query).sort("_id", 1).skip(skip).limit(limit).to_list(length=limit),
    )

    codes = [_code(r.get("itemCode")) for r in raw_items if r.get("itemCode")]

    stock_map, closing_map, approved_map = await asyncio.gather(
        get_stock_map(clean_branch, codes),
        get_closing_map(clean_branch, codes, queryDate),
        get_approved_map(clean_branch, codes),
    )

    items: List[Dict[str, Any]] = []
    for raw in raw_items:
        code = _code(raw.get("itemCode"))
        if not code:
            continue

        result = _skeleton(raw)
        closing_row = closing_map.get(code)
        apply_closing_status(result, closing_row, approved_map.get(code), stock_map.get(code))
        result["hasEditHistory"] = bool(closing_row and closing_row.get("hasEditHistory"))
        items.append(result)

    response: Dict[str, Any] = {
        "filteredItems": {
            "total": total,
            "page": page,
            "limit": limit,
            "count": len(items),
            "items": items,
        }
    }
    if include_filter_options:
        response["filterOptions"] = await options()

    return response


@router.get("/pending-codes")
async def get_pending_codes(
    branch: str = Query(..., description="locationId of the branch"),
    queryDate: Optional[date] = Query(None),
):
    return await get_pending_item_codes(location_id=branch, query_date=queryDate)


@router.get("/{itemCode}/edit-history")
async def get_item_edit_history(
    itemCode: str,
    locationId: str = Query(..., description="Outlet / Location ID"),
):
    return await get_rm_closing_edit_history(location_id=locationId, item_code=itemCode)


# ─────────────────────────────────────────────────────────────────────────────
# approve
# ─────────────────────────────────────────────────────────────────────────────
@router.patch("/{itemCode}/approve")
async def approve_rm_item(
    itemCode: str,
    locationId: str = Query(...),
    request: ApproveItemRequest = Body(...),
    queryDate: Optional[date] = Query(None),
):
    return await approve_one_rm_closing_item(
        item_code=itemCode,
        location_id=locationId,
        approved_by=request.approved_by,
        description=request.description or "",
        query_date=queryDate,
        adjustment_mode=request.adjustmentMode or "ADJUST_SYSTEM",
        tenant_id=request.tenant_id,
        idempotency_key=request.idempotency_key,
    )


@router.patch("/approve/bulk")
async def approve_multiple_rm_items(
    locationId: str = Query(...),
    request: BulkApproveItemRequest = Body(...),
    queryDate: Optional[date] = Query(None),
):
    clean_location_id = str(locationId or "").strip()

    item_codes: List[str] = []
    seen: set = set()
    for raw in request.itemCodes:
        clean_code = str(raw or "").strip()
        if clean_code and clean_code not in seen:
            seen.add(clean_code)
            item_codes.append(clean_code)

    if not item_codes:
        raise HTTPException(status_code=400, detail="itemCodes is required")

    masters = await prefetch_masters(item_codes)

    results: List[Any] = []
    chunk_size = 500
    for i in range(0, len(item_codes), chunk_size):
        chunk = item_codes[i : i + chunk_size]
        results.extend(
            await asyncio.gather(
                *(
                    approve_one_rm_closing_item(
                        item_code=code,
                        location_id=clean_location_id,
                        approved_by=request.approved_by,
                        description=request.description or "Bulk approved from variance module",
                        query_date=queryDate,
                        adjustment_mode=request.adjustmentMode or "ADJUST_SYSTEM",
                        tenant_id=request.tenant_id,
                        idempotency_key=request.idempotency_key,
                        _master=masters.get(code),
                    )
                    for code in chunk
                ),
                return_exceptions=True,
            )
        )

    normalized_results = []
    for code, result in zip(item_codes, results):
        if isinstance(result, Exception):
            normalized_results.append(
                {
                    "itemCode": code,
                    "success": False,
                    "approvalStatus": "error",
                    "approvalButton": True,
                    "message": str(result),
                }
            )
        else:
            normalized_results.append(result)

    def _count(status: str) -> int:
        return sum(1 for r in normalized_results if r.get("approvalStatus") == status)

    return {
        "message": "Bulk stock variance approval completed",
        "locationId": clean_location_id,
        "queryDate": (queryDate or ist_now().date()).isoformat(),
        "totalRequested": len(item_codes),
        "approvedCount": sum(1 for r in normalized_results if r.get("success") is True),
        "alreadyApprovedCount": sum(
            1 for r in normalized_results
            if r.get("approvalStatus") == "approved" and not r.get("success")
        ),
        "noVarianceCount": _count("noVariance"),
        "notAvailableCount": _count("notAvailable"),
        "errorCount": _count("error"),
        "results": normalized_results,
    }


@router.patch("/approve/all")
async def approve_all_for_branch(
    branch: str = Query(..., description="locationId of the branch"),
    queryDate: Optional[date] = Query(None),
    request: ApproveAllBranchRequest = Body(...),
):
    result = await approve_all_branch_items(
        location_id=branch,
        query_date=queryDate,
        approved_by=request.approved_by,
        description=request.description or f"Branch bulk approval — {branch}",
        adjustment_mode=request.adjustmentMode,
        tenant_id=request.tenant_id,
    )

    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Approval failed"))

    return result


# ─────────────────────────────────────────────────────────────────────────────
# approved / pending history list (Approved Stock screen)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/approved")
async def get_approved_items(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    branch: Optional[str] = Query(None, description="Filter by branch/locationId"),
    date: Optional[str] = None,
    status: str = Query("approved", description="approved | pendingapproval"),
    itemName: Optional[str] = Query(None, description="Search by item name (case-insensitive)"),
    approvedBy: Optional[str] = Query(None, description="Search by approved by (case-insensitive)"),
    fromDate: Optional[str] = Query(None, description="From date YYYY-MM-DD"),
    toDate: Optional[str] = Query(None, description="To date YYYY-MM-DD"),
):
    query: Dict[str, Any] = {}

    if branch and branch.strip():
        query["locationId"] = branch.strip()

    date_filter: Dict[str, Any] = {}
    if date and not fromDate and not toDate:
        try:
            date_obj = datetime.strptime(date, "%Y-%m-%d")
            start = datetime(date_obj.year, date_obj.month, date_obj.day)
            date_filter = {"$gte": start, "$lt": start + timedelta(days=1)}
        except ValueError:
            pass

    if fromDate or toDate:
        if fromDate:
            try:
                date_filter["$gte"] = datetime.strptime(fromDate, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid fromDate format. Use YYYY-MM-DD")
        if toDate:
            try:
                date_filter["$lt"] = datetime.strptime(toDate, "%Y-%m-%d") + timedelta(days=1)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid toDate format. Use YYYY-MM-DD")

    skip = (page - 1) * limit
    name_regex = (
        {"$regex": re.escape(itemName.strip()), "$options": "i"}
        if itemName and itemName.strip()
        else None
    )

    # ---- pending requests (audit app) --------------------------------------
    if status == "pendingapproval":
        closing = outlet_rm_physical_stock_closing_collection()
        pending_query = {**query, "status": "pendingapproval"}
        if date_filter:
            pending_query["updatedAt"] = date_filter

        # closing rows carry no item name -> resolve the name filter through rawMaterials
        if name_regex:
            matches = await purchaseitem_collection().find(
                {"itemName": name_regex}, {"itemCode": 1}
            ).to_list(None)
            pending_query["itemCode"] = {"$in": [_code(m.get("itemCode")) for m in matches]}

        total, docs = await asyncio.gather(
            closing.count_documents(pending_query),
            closing.find(pending_query).sort("createdAt", -1).skip(skip).limit(limit).to_list(limit),
        )

        masters = await prefetch_masters([_code(d.get("itemCode")) for d in docs])

        data = []
        for itm in docs:
            code = _code(itm.get("itemCode"))
            meta = masters.get(code, {})
            updated_at = itm.get("updatedAt") or itm.get("createdAt")
            data.append(
                {
                    "_id": str(itm["_id"]),
                    "itemCode": code,
                    "itemName": meta.get("itemName"),
                    "varianceName": meta.get("itemName"),
                    "category": meta.get(CATEGORY_FIELD),
                    "subcategory": meta.get(SUBCATEGORY_FIELD),
                    "uom": meta.get("uom"),
                    "locationId": itm.get("locationId", ""),
                    "systemStockBefore": safe_float(itm.get("systemStock")),
                    "physicalClosing": safe_float(itm.get("physicalStock")),
                    "actualVariance": safe_float(itm.get("variance")),
                    "systemStockAfter": safe_float(itm.get("systemStock")),
                    "previousSystemStock": safe_float(itm.get("previousSystemStock")),
                    "status": "pendingapproval",
                    "approvedBy": None,
                    "description": itm.get("description"),
                    "approvedAt": (
                        updated_at.strftime("%Y-%m-%d %H:%M:%S")
                        if isinstance(updated_at, datetime)
                        else None
                    ),
                    "submittedBy": itm.get("createdBy", ""),
                    "submittedAt": (
                        itm["createdAt"].strftime("%Y-%m-%d %H:%M:%S")
                        if isinstance(itm.get("createdAt"), datetime)
                        else None
                    ),
                }
            )

        return {"data": data, "page": page, "limit": limit, "total": total}

    # ---- approved records -----------------------------------------------------
    approved_query: Dict[str, Any] = {**query, "status": "approved"}
    if name_regex:
        approved_query["itemName"] = name_regex
    if approvedBy and approvedBy.strip():
        approved_query["approvedBy"] = {"$regex": re.escape(approvedBy.strip()), "$options": "i"}
    if date_filter:
        approved_query["approvedAt"] = date_filter

    projection = {
        "itemCode": 1, "itemName": 1, "locationId": 1,
        "systemStockBefore": 1, "physicalClosing": 1,
        "systemStockAfter": 1, "actualVariance": 1,
        "previousSystemStock": 1, "adjustmentMode": 1,
        "closingDocId": 1, "closingDate": 1,
        "approvedBy": 1, "approvedAt": 1, "description": 1,
    }

    coll = approvedstocks_outlet_rm_collection()
    total, items = await asyncio.gather(
        coll.count_documents(approved_query),
        coll.find(approved_query, projection)
        .sort("approvedAt", -1)
        .skip(skip)
        .limit(limit)
        .to_list(length=limit),
    )

    for item in items:
        item["_id"] = str(item["_id"])
        item["varianceName"] = item.get("itemName")
        if isinstance(item.get("approvedAt"), datetime):
            item["approvedAt"] = item["approvedAt"].strftime("%Y-%m-%d %H:%M:%S")
        for field in (
            "systemStockBefore", "physicalClosing", "systemStockAfter",
            "actualVariance", "previousSystemStock",
        ):
            if item.get(field) is not None:
                item[field] = _r(item[field])

    return {"data": items, "page": page, "limit": limit, "total": total}