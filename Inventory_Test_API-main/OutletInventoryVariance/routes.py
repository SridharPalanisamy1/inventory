from __future__ import annotations

import asyncio
import io
# newly add this line 11 8 2
import re
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from core.search import mongo_token_query
from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

logger = logging.getLogger(__name__)

from OutletInventory.funtions import _get_all_active_locations

from OutletInventoryVariance.funtions import (
    ApproveAllBranchRequest,
    BulkApproveItemRequest,
    _apply_stock_closing_status,
    _approve_one_stock_closing_item,
    _prefetch_item_docs,
    _get_approved_map_by_closing,
    _get_stock_closing_map,
    approve_all_branch_items,
    get_pending_item_codes,
    get_outlet_closing_edit_history,
)
from OutletInventoryVariance.models import ApproveItemRequest, ItemResponse

from db.collections import (
    approvedstocks_fg_collection,
    closingstocks_collection,
    inventorytest_stock_collection,
    item_master_collection,
    location_collection,
    outlet_physical_stock_closing_collection,
    # newly add this part 10 8 1
    stock_history_collection,

)

from core.aggregations import (
    batch_closing_stocks,
    batch_dispatch_map,
    batch_sales_map,
    batch_sales_return_map,
    batch_transfer_map,
    batch_warehouse_return_map,
    batch_wastage_return_map,
    fetch_all_movement_maps,
)
from core.compute import (
    apply_inventory_doc,
    apply_movements,
    apply_precision,
    build_item_skeleton,
    compute_system_closing,
    daterange,
    ist_now,
    round_qty,
    safe_float,
)
from core.lookups import (
    format_display_name,
    get_all_filter_options,
    get_category_map,
    get_opening_stock_map,
    get_subcategory_map,
    get_uom_precision_map,
)

router = APIRouter()




def _master():
    return item_master_collection()



@router.get("/")
async def get_items(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    branch: str = Query(...),
    category: Optional[str] = Query(None),
    subCategory: Optional[str] = Query(None),
    itemName: Optional[str] = Query(None),
    varianceName: Optional[str] = Query(None),
    queryDate: Optional[date] = Query(None),
    include_filter_options: bool = Query(True),
    only_filter_options: bool = Query(False),
    # filter pagination
    categoryPage: int = Query(1, ge=1),
    categoryLimit: int = Query(20, ge=1),
    categorySearch: Optional[str] = Query(None),
    subCategoryPage: int = Query(1, ge=1),
    subCategoryLimit: int = Query(20, ge=1),
    subCategorySearch: Optional[str] = Query(None),
    itemNamePage: int = Query(1, ge=1),
    itemNameLimit: int = Query(20, ge=1),
    itemNameSearch: Optional[str] = Query(None),
    varianceNamePage: int = Query(1, ge=1),
    varianceNameLimit: int = Query(20, ge=1),
    varianceNameSearch: Optional[str] = Query(None),
):

    from core.lookups import _build_filter_query

    clean_branch = str(branch or "").strip()


    filters = _build_filter_query(
        category=category,
        sub_category=subCategory,
        item_name=itemName,
        variance_name=varianceName,
    )

    col = _master()

    category_map, subcategory_map, uom_precision_map = await asyncio.gather(
        get_category_map(),
        get_subcategory_map(),
        get_uom_precision_map(),
    )

    # Filter-only fast path unchanged
    if only_filter_options:
        if not include_filter_options:
            return {}

        return {
            "filterOptions": await get_all_filter_options(
                col,
                category_map,
                subcategory_map,
                category,
                subCategory,
                itemName,
                varianceName,
                categoryPage,
                categoryLimit,
                categorySearch,
                subCategoryPage,
                subCategoryLimit,
                subCategorySearch,
                itemNamePage,
                itemNameLimit,
                itemNameSearch,
                varianceNamePage,
                varianceNameLimit,
                varianceNameSearch,
            )
        }

    skip = (page - 1) * limit

    total, raw_items, movement_data, opening_map = await asyncio.gather(
        col.count_documents(filters),
        col.find(filters).skip(skip).limit(limit).to_list(length=limit),
        fetch_all_movement_maps(clean_branch, queryDate),
        get_opening_stock_map(clean_branch, queryDate),
    )

    dispatch_map, sales_map, sr_map, warehouse_map, wastage_map, transfer_map = (
        movement_data
    )

    item_codes = [
        str(i.get("itemCode") or "").strip() for i in raw_items if i.get("itemCode")
    ]

    inv_docs, closing_map = await asyncio.gather(
        inventorytest_stock_collection()

        .find({"$or": [{"locationId": clean_branch}, {"branch": clean_branch}], "itemCode": {"$in": item_codes}})
        .to_list(length=len(item_codes)),
        _get_stock_closing_map(clean_branch, item_codes, queryDate),
    )


    approved_map = await _get_approved_map_by_closing(
        clean_branch,
        item_codes,
        closing_map,
    )

    # inventory_map: Dict[str, Any] = {
    #     str(d.get("itemCode") or "").strip(): d for d in inv_docs if d.get("itemCode")
    # }
    # replace the part 10 8 1
    inventory_map: Dict[str, Any] = {
        str(d.get("itemCode") or "").strip().upper(): d
        for d in inv_docs
        if d.get("itemCode")
    }
    items = []

    for raw in raw_items:
        # item_code = str(raw.get("itemCode") or "").strip()
        # replace the part 10 8 1
        item_code = str(raw.get("itemCode") or "").strip()
        item_code_key = item_code.upper()
        map_key = item_code_key

        uom_id = raw.get("item_Uom")
        precision = uom_precision_map.get(uom_id, 0)
        opening = safe_float(opening_map.get(item_code, 0.0))

        result = build_item_skeleton(
            raw,
            category_map,
            subcategory_map,
            precision,
            opening,
        )

        # Keep movement fields unchanged for your existing frontend.
        apply_movements(
            result,
            dispatch_map.get(map_key),
            sales_map.get(map_key),
            sr_map.get(map_key),
            warehouse_map.get(map_key),
            wastage_map.get(map_key),
            transfer_map.get(map_key),
        )


        _apply_stock_closing_status(
            result=result,
            item_code=item_code,
            precision=precision,
            closing_row=closing_map.get(item_code_key),
            approved_doc=approved_map.get(item_code_key),
            inventory_doc=inventory_map.get(item_code_key),
        )

        apply_precision(result, precision)
        items.append(result)

    # ── hasEditHistory check (mirrors warehouse) ──
    item_codes_for_history = [
        str(item.get("itemCode") or "").strip()
        for item in items
        if item.get("itemCode")
    ]

    history_map: Dict[str, bool] = {}

    if item_codes_for_history:
        history_docs = await outlet_physical_stock_closing_collection().find(
            {
                "locationId": clean_branch,
                "itemCode": {"$in": item_codes_for_history},
                # newly add one line 13 8 2
                "status": "pendingapproval",
            },
            {
                "_id": 0,
                "itemCode": 1,
                "editHistory": 1,
                "updatedAt": 1,
                "createdAt": 1,
            },
        ).sort(
            [
                ("updatedAt", -1),
                ("createdAt", -1),
            ]
        ).to_list(None)

        for doc in history_docs:
            code = str(doc.get("itemCode") or "").strip()
            if not code or code in history_map:
                continue
            edit_history = doc.get("editHistory") or []
            history_map[code] = bool(edit_history)

    for item in items:
        code = str(item.get("itemCode") or "").strip()
        item["hasEditHistory"] = history_map.get(code, False)

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
        response["filterOptions"] = await get_all_filter_options(
            col,
            category_map,
            subcategory_map,
            category,
            subCategory,
            itemName,
            varianceName,
            categoryPage,
            categoryLimit,
            categorySearch,
            subCategoryPage,
            subCategoryLimit,
            subCategorySearch,
            itemNamePage,
            itemNameLimit,
            itemNameSearch,
            varianceNamePage,
            varianceNameLimit,
            varianceNameSearch,
        )

    return response




@router.get("/pending-codes")
async def get_pending_codes(
    branch: str = Query(..., description="locationId of the branch"),
    queryDate: Optional[date] = Query(None),
):

    return await get_pending_item_codes(
        location_id=branch,
        query_date=queryDate,
    )


@router.get("/{itemCode}/edit-history")
async def get_item_edit_history(
    itemCode: str,
    locationId: str = Query(..., description="Outlet / Location ID"),
):
    return await get_outlet_closing_edit_history(
        location_id=locationId,
        item_code=itemCode,
    )



@router.patch("/{itemCode}/approve")
async def approve_branchwise_item(
    itemCode: str,
    locationId: str = Query(...),
    request: ApproveItemRequest = Body(...),
    queryDate: Optional[date] = Query(None),
):
    return await _approve_one_stock_closing_item(
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
async def approve_multiple_branchwise_items(
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

    item_doc_map, uom_precision_map = await _prefetch_item_docs(item_codes)

    results = []
    chunk_size = 500
    for i in range(0, len(item_codes), chunk_size):
        chunk = item_codes[i: i + chunk_size]
        chunk_results = await asyncio.gather(
            *(
                _approve_one_stock_closing_item(
                    item_code=code,
                    location_id=clean_location_id,
                    approved_by=request.approved_by,
                    description=request.description or "Bulk approved from variance module",
                    query_date=queryDate,
                    adjustment_mode=request.adjustmentMode or "ADJUST_SYSTEM",
                    tenant_id=request.tenant_id,
                    idempotency_key=request.idempotency_key,
                    _item_doc=item_doc_map.get(code),
                    _precision=uom_precision_map.get(
                        (item_doc_map.get(code) or {}).get("item_Uom"), 0
                    ) if code in item_doc_map else None,
                )
                for code in chunk
            ),
            return_exceptions=True,
        )
        results.extend(chunk_results)

    normalized_results = []
    for code, result in zip(item_codes, results):
        if isinstance(result, Exception):
            normalized_results.append({
                "itemCode": code,
                "success": False,
                "approvalStatus": "error",
                "approvalButton": True,
                "message": str(result),
            })
        else:
            normalized_results.append(result)

    approved_count = sum(1 for r in normalized_results if r.get("success") is True)
    already_approved_count = sum(
        1
        for r in normalized_results
        if r.get("approvalStatus") == "approved" and not r.get("success")
    )
    no_variance_count = sum(
        1 for r in normalized_results if r.get("approvalStatus") == "noVariance"
    )
    not_available_count = sum(
        1 for r in normalized_results if r.get("approvalStatus") == "notAvailable"
    )
    error_count = sum(
        1 for r in normalized_results if r.get("approvalStatus") == "error"
    )

    return {
        "message": "Bulk stock variance approval completed",
        "locationId": clean_location_id,
        "queryDate": (queryDate or ist_now().date()).isoformat(),
        "totalRequested": len(item_codes),
        "approvedCount": approved_count,
        "alreadyApprovedCount": already_approved_count,
        "noVarianceCount": no_variance_count,
        "notAvailableCount": not_available_count,
        "errorCount": error_count,
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
        variance_threshold_pct=request.varianceThresholdPct,
        variance_threshold_units=request.varianceThresholdUnits,
        tenant_id=request.tenant_id,
    )

    # Only invalid input is an HTTP error. Verification failure returns 200 with
    # success=false + failedReasons so the UI can show why and what to do.
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result.get("error"))

    return result


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
            end = start + timedelta(days=1)
            date_filter = {"$gte": start, "$lt": end}
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

    if itemName and itemName.strip():
        query["itemName"] = {"$regex": re.escape(itemName.strip()), "$options": "i"}

    skip = (page - 1) * limit


    if status == "pendingapproval":
        pending_query = {**query, "status": "pendingapproval"}
        if date_filter:
            pending_query["updatedAt"] = date_filter

        total, items = await asyncio.gather(
            outlet_physical_stock_closing_collection().count_documents(pending_query),
            outlet_physical_stock_closing_collection()
            .find(pending_query)
            .sort("createdAt", -1)
            .skip(skip)
            .limit(limit)
            .to_list(limit),
        )

        # Fetch item metadata for display names (mirrors warehouse)
        item_codes = [
            str(itm.get("itemCode") or "").strip()
            for itm in items
            if itm.get("itemCode")
        ]

        category_map_pending = {}
        subcategory_map_pending = {}
        metadata_map_pending = {}

        if item_codes:
            category_map_pending, subcategory_map_pending, metadata_docs = await asyncio.gather(
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
                        "item_Uom": 1,
                    },
                ).to_list(None),
            )
            metadata_map_pending = {
                str(doc.get("itemCode") or "").strip(): doc
                for doc in metadata_docs
            }

        response = []
        for itm in items:
            updated_at = itm.get("updatedAt") or itm.get("createdAt")
            code = str(itm.get("itemCode") or "").strip()
            meta = metadata_map_pending.get(code, {})
            cat_id = meta.get("category")
            sub_id = meta.get("subCategory")

            response.append({
                "_id": str(itm["_id"]),
                "itemCode": code,
                "itemName": meta.get("itemName"),
                "varianceName": meta.get("varianceName"),
                "category": category_map_pending.get(cat_id),
                "subcategory": subcategory_map_pending.get(sub_id),
                "uom": meta.get("item_Uom"),
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
                    itm.get("createdAt").strftime("%Y-%m-%d %H:%M:%S")
                    if isinstance(itm.get("createdAt"), datetime)
                    else None
                ),
            })

        return {"data": response, "page": page, "limit": limit, "total": total}

    approved_query = {**query, "status": "approved"}
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

    coll = approvedstocks_fg_collection()

    total, items, uom_map, master_items = await asyncio.gather(
        coll.count_documents(approved_query),
        coll.find(approved_query, projection).skip(skip).limit(limit).to_list(length=limit),
        get_uom_precision_map(),
        _master().find({}, {"itemCode": 1, "item_Uom": 1}).to_list(None),
    )

    item_uom_lookup = {
        i["itemCode"]: i.get("item_Uom") for i in master_items if i.get("itemCode")
    }

    for item in items:
        item["_id"] = str(item["_id"])
        if isinstance(item.get("approvedAt"), datetime):
            item["approvedAt"] = item["approvedAt"].strftime("%Y-%m-%d %H:%M:%S")
        prec = uom_map.get(item_uom_lookup.get(item.get("itemCode")), 0)
        for field in (
            "systemStockBefore",
            "physicalClosing",
            "systemStockAfter",
            "actualVariance",
            "previousSystemStock",
        ):
            if field in item and item[field] is not None:
                item[field] = round_qty(item[field], prec)

    return {"data": items, "page": page, "limit": limit, "total": total}


@router.post("/create")
async def create_inventory_snapshot_all_locations(createdBy: str = "Inventory"):
    inventory_col = closingstocks_collection()
    stock_col = inventorytest_stock_collection()

    now = ist_now()
    today_date = now.date()
    today = today_date.isoformat()

    active_status = {"$in": [1, "1", "active", "Active", "ACTIVE"]}

    uom_precision_map, locations, items = await asyncio.gather(
        get_uom_precision_map(),
        _get_all_active_locations(
            apply_pagination=False,
            include_warehouses=True,
        ),
        _master()
        .find(
            {
                "status": active_status,
                "itemCode": {"$exists": True, "$ne": ""},
            },
            {
                "_id": 0,
                "itemCode": 1,
                "item_Uom": 1,
            },
        )
        .to_list(None),
    )

    if not locations:
        raise HTTPException(status_code=404, detail="No active locations found")

    if not items:
        raise HTTPException(status_code=404, detail="No active items found")

    item_uom_lookup = {
        i["itemCode"]: i.get("item_Uom") for i in items if i.get("itemCode")
    }

    item_codes = list(item_uom_lookup.keys())

    item_precision = {
        code: uom_precision_map.get(item_uom_lookup.get(code), 0) for code in item_codes
    }

    def _matches_today(value: Any) -> bool:
        if not value:
            return False

        try:
            if isinstance(value, datetime):
                # Direct date match
                if value.date() == today_date:
                    return True

                # If DB value is UTC naive, this also catches IST date
                ist_value = value + timedelta(hours=5, minutes=30)
                return ist_value.date() == today_date

            if isinstance(value, date):
                return value == today_date

            if isinstance(value, str):
                clean = value.replace("Z", "").replace("T", " ")
                parsed = datetime.fromisoformat(clean)
                if parsed.date() == today_date:
                    return True

                ist_parsed = parsed + timedelta(hours=5, minutes=30)
                return ist_parsed.date() == today_date

        except Exception:
            return False

        return False

    def _has_today_physical_stock(stock_doc: Dict[str, Any]) -> bool:
        return _matches_today(stock_doc.get("updatedAt")) or _matches_today(
            stock_doc.get("createdAt")
        )

    async def _snapshot_location(location_doc: Dict[str, Any]) -> Dict[str, Any]:
        location_id = str(location_doc.get("locationId") or "").strip()

        if not location_id:
            return {
                "locationId": None,
                "locationName": location_doc.get("locationName"),
                "locationType": location_doc.get("locationType"),
                "insertedItems": 0,
                "skippedExistingItems": 0,
                "skippedNoStockItems": 0,
                "notAvailableItems": 0,
                "pendingItems": 0,
                "approvedItems": 0,
                "error": "Missing locationId",
            }

        stock_records, existing_snapshot_docs = await asyncio.gather(
            stock_col.find(
                {
                    "locationId": location_id,
                    "itemCode": {"$in": item_codes},
                },
                {
                    "_id": 0,
                    "itemCode": 1,
                    "systemStock": 1,
                    "physicalStock": 1,
                    "variance": 1,
                    "status": 1,
                    "createdAt": 1,
                    "updatedAt": 1,
                },
            ).to_list(None),
            inventory_col.find(
                {
                    "date": today,
                    "locationId": location_id,
                    "itemCode": {"$in": item_codes},
                },
                {
                    "_id": 0,
                    "itemCode": 1,
                },
            ).to_list(None),
        )

        stock_map = {s["itemCode"]: s for s in stock_records if s.get("itemCode")}

        already_snapshotted_codes = {
            d["itemCode"] for d in existing_snapshot_docs if d.get("itemCode")
        }

        docs = []

        skipped_no_stock_items = 0
        not_available_items = 0
        pending_items = 0
        approved_items = 0

        for code in item_codes:
          
            if code in already_snapshotted_codes:
                continue

            stock_doc = stock_map.get(code)


            if not stock_doc:
                skipped_no_stock_items += 1
                continue

            precision = item_precision.get(code, 0)

            # System stock always comes from current inventory doc.
            system_stock = round_qty(
                safe_float(stock_doc.get("systemStock", 0.0)),
                precision,
            )

            has_today_physical = _has_today_physical_stock(stock_doc)

            if has_today_physical:
                physical_stock = round_qty(
                    safe_float(stock_doc.get("physicalStock", 0.0)),
                    precision,
                )

                snapshot_variance = round_qty(
                    physical_stock - system_stock,
                    precision,
                )

                snapshot_status = (
                    "pending" if safe_float(snapshot_variance) != 0 else "approved"
                )

                if snapshot_status == "pending":
                    pending_items += 1
                else:
                    approved_items += 1

            else:
                # Physical stock was not updated/created today.
                # Keep it unavailable instead of forcing 0.
                physical_stock = None
                snapshot_variance = None
                snapshot_status = "notAvailable"
                not_available_items += 1

            docs.append(
                {
                    "locationId": location_id,
                    "locationName": location_doc.get("locationName"),
                    "locationType": location_doc.get("locationType"),
                    "itemCode": code,
                    "systemStock": system_stock,
                    "physicalStock": physical_stock,
                    "variance": snapshot_variance,
                    "status": snapshot_status,
                    "sourceStockUpdatedAt": stock_doc.get("updatedAt"),
                    "sourceStockCreatedAt": stock_doc.get("createdAt"),
                    "date": today,
                    "createdBy": createdBy,
                    "createdAt": now,
                }
            )

        if docs:
            await inventory_col.insert_many(docs, ordered=False)

        return {
            "locationId": location_id,
            "locationName": location_doc.get("locationName"),
            "locationType": location_doc.get("locationType"),
            "insertedItems": len(docs),
            "skippedExistingItems": len(already_snapshotted_codes),
            "skippedNoStockItems": skipped_no_stock_items,
            "notAvailableItems": not_available_items,
            "pendingItems": pending_items,
            "approvedItems": approved_items,
        }

    results = await asyncio.gather(
        *(_snapshot_location(loc) for loc in locations),
        return_exceptions=True,
    )

    created_locations = 0
    skipped_locations = 0
    total_inserted_items = 0
    total_skipped_existing_items = 0
    total_skipped_no_stock_items = 0
    total_not_available_items = 0
    total_pending_items = 0
    total_approved_items = 0
    errors = []
    location_results = []

    for result in results:
        if isinstance(result, Exception):
            error_message = str(result)
            errors.append(error_message)
            logger.error(f"Location snapshot error: {error_message}")
            continue

        location_results.append(result)

        inserted = int(result.get("insertedItems", 0))
        skipped_existing = int(result.get("skippedExistingItems", 0))
        skipped_no_stock = int(result.get("skippedNoStockItems", 0))
        not_available = int(result.get("notAvailableItems", 0))
        pending = int(result.get("pendingItems", 0))
        approved = int(result.get("approvedItems", 0))

        if inserted > 0:
            created_locations += 1
        else:
            skipped_locations += 1

        total_inserted_items += inserted
        total_skipped_existing_items += skipped_existing
        total_skipped_no_stock_items += skipped_no_stock
        total_not_available_items += not_available
        total_pending_items += pending
        total_approved_items += approved

        if result.get("error"):
            errors.append(
                f"{result.get('locationId') or 'UNKNOWN'}: {result.get('error')}"
            )

    return {
        "message": "Daily inventory snapshot created",
        "date": today,
        "totalLocations": len(locations),
        "createdLocations": created_locations,
        "skippedLocations": skipped_locations,
        "totalActiveItems": len(item_codes),
        "totalInsertedItems": total_inserted_items,
        "totalSkippedExistingItems": total_skipped_existing_items,
        "totalSkippedNoStockItems": total_skipped_no_stock_items,
        "totalNotAvailableItems": total_not_available_items,
        "totalPendingItems": total_pending_items,
        "totalApprovedItems": total_approved_items,
        "errors": errors,
        "locations": location_results,
    }



@router.get("/items", response_model=List[ItemResponse])
async def get_item_names(
    page: int = Query(1, ge=1),
    limit: int = Query(10, le=100),
    search: Optional[str] = None,
):
    query = mongo_token_query(search, ["varianceName", "itemName"])

    cursor = (
        _master()
        .find(query, {"_id": 0, "itemCode": 1, "varianceName": 1, "itemName": 1})
        .skip((page - 1) * limit)
        .limit(limit)
    )

    result = []
    async for d in cursor:
        if d.get("itemCode") and d.get("varianceName"):
            name = format_display_name(d["varianceName"], d.get("itemName"))
            result.append({
                "itemCode": d["itemCode"],
                "varianceName": name,
            })
    return result


async def _get_item_details(item_code: str) -> Dict[str, Any]:
    from db.collections import uom_collection

    item = await _master().find_one(
        {"itemCode": item_code},
        {
            "varianceName": 1,
            "item_Uom": 1,
        },
    )

    uom_id = (item or {}).get("item_Uom")
    uom_doc = await uom_collection().find_one({"uomId": uom_id}) if uom_id else None

    return {
        "varianceName": (item or {}).get("varianceName", item_code),
        "uom": (uom_doc or {}).get("uom", ""),
        "precision": (uom_doc or {}).get("precision", 0),
    }


async def _build_stock_ledger(
    location_id: str,
    item_code: str,
    from_date: date,
    to_date: date,
) -> Dict[str, Any]:
    details = await _get_item_details(item_code)
    precision = details["precision"]

    dates = list(daterange(from_date, to_date))
    map_key = item_code.upper() if item_code else ""

    (
        b_dispatch,
        b_sales,
        b_transfer,
        b_sr,
        b_warehouse,
        b_wastage,
        b_closing,
    ) = await asyncio.gather(
        batch_dispatch_map(location_id, from_date, to_date),
        batch_sales_map(location_id, from_date, to_date),
        batch_transfer_map(location_id, from_date, to_date),
        batch_sales_return_map(location_id, from_date, to_date),
        batch_warehouse_return_map(location_id, from_date, to_date),
        batch_wastage_return_map(location_id, from_date, to_date),
        batch_closing_stocks(location_id, [item_code], from_date, to_date),
    )

    running_stock = 0.0
    opening_balance = None
    ledger = []

    for current_date in dates:
        d_str = current_date.isoformat()

        dispatched_qty = safe_float(b_dispatch.get(d_str, {}).get(map_key, 0.0))
        sales_qty = safe_float(b_sales.get(d_str, {}).get(map_key, 0.0))

        transfer_data = b_transfer.get(d_str, {}).get(map_key) or {}
        transfer_in = safe_float(transfer_data.get("transferInQty", 0.0))
        transfer_out = safe_float(transfer_data.get("transferOutQty", 0.0))

        sales_return_qty = safe_float(b_sr.get(d_str, {}).get(map_key, 0.0))
        warehouse_qty = safe_float(b_warehouse.get(d_str, {}).get(map_key, 0.0))
        wastage_qty = safe_float(b_wastage.get(d_str, {}).get(map_key, 0.0))

        day_closing = b_closing.get(d_str) or {}
        db_closing = day_closing.get(map_key) or day_closing.get(item_code)

        closing_stock = (
            safe_float(db_closing)
            if db_closing is not None
            else compute_system_closing(
                opening=running_stock,
                received=dispatched_qty,
                transfer_in=transfer_in,
                transfer_out=transfer_out,
                sales=sales_qty,
                sales_return=sales_return_qty,
                wastage_received=warehouse_qty,
                wastage_return=wastage_qty,
            )
        )

        if opening_balance is None:
            opening_balance = running_stock

        ledger.append(
            {
                "date": d_str,
                "openingStock": round_qty(running_stock, precision),
                "dispatchQty": round_qty(dispatched_qty, precision),
                "salesQty": round_qty(sales_qty, precision),
                "salesReturnQty": round_qty(sales_return_qty, precision),
                "stockTransferInQty": round_qty(transfer_in, precision),
                "stockTransferOutQty": round_qty(transfer_out, precision),
                "wastageReceivedQty": round_qty(warehouse_qty, precision),
                "wastageReturnQty": round_qty(wastage_qty, precision),
                "closingStock": round_qty(closing_stock, precision),
            }
        )

        running_stock = closing_stock

    return {
        "varianceName": details["varianceName"],
        "uom": details["uom"],
        "openingBalance": round_qty(opening_balance or 0, precision),
        "openingDate": from_date.isoformat(),
        "closingBalance": round_qty(running_stock, precision),
        "transactions": ledger,
    }



@router.get("/stock-ledger/transactions")
async def stock_ledger_transactions(
    locationId: str = Query(...),
    itemCode: List[str] = Query(...),
    fromDate: date = Query(...),
    toDate: date = Query(...),
):
    if toDate < fromDate:
        raise HTTPException(
            status_code=400,
            detail="toDate must be greater than or equal to fromDate",
        )

    ledgers = await asyncio.gather(
        *(_build_stock_ledger(locationId, code, fromDate, toDate) for code in itemCode)
    )

    return [
        {
            "itemCode": code,
            "varianceName": ledger["varianceName"],
            "uom": ledger["uom"],
            "openingDate": ledger["openingDate"],
            "openingBalance": ledger["openingBalance"],
            "closingBalance": ledger["closingBalance"],
            "transactions": ledger["transactions"],
        }
        for code, ledger in zip(itemCode, ledgers)
    ]





_EXCEL_HEADERS = [
    "Date",
    "Opening Stock",
    "Dispatch",
    "Sales",
    "Sales Return",
    "Stock Transfer In",
    "Stock Transfer Out",
    "Wastage",
    "Closing Stock",
    "UOM",
]

_HEADER_FILL = PatternFill("solid", fgColor="4F81BD")
_HEADER_FONT = Font(color="FFFFFF", bold=True)


@router.get("/stock-ledger/transactions/excel")
async def export_stock_ledger_excel(
    locationName: str = Query(...),
    itemCodes: List[str] = Query(...),
    fromDate: date = Query(...),
    toDate: date = Query(...),
):
    if toDate < fromDate:
        raise HTTPException(
            status_code=400,
            detail="toDate must be greater than or equal to fromDate",
        )

    ledgers = await asyncio.gather(
        *(
            _build_stock_ledger(locationName, code, fromDate, toDate)
            for code in itemCodes
        )
    )

    wb = Workbook()
    wb.remove(wb.active)

    for ledger in ledgers:
        sheet_title = str(ledger["varianceName"] or "Item")[:31]
        ws = wb.create_sheet(title=sheet_title)

        ws.append([f"Variance Name: {ledger['varianceName']}"])
        ws.append([f"Location: {locationName}"])
        ws.append([f"Date Range: {fromDate} to {toDate}"])
        ws.append([f"UOM: {ledger.get('uom', '')}"])
        ws.append([])
        ws.append(_EXCEL_HEADERS)

        header_row = ws.max_row
        for col in range(1, len(_EXCEL_HEADERS) + 1):
            cell = ws.cell(row=header_row, column=col)
            cell.fill = _HEADER_FILL
            cell.font = _HEADER_FONT

        uom = ledger.get("uom", "")

        for row in ledger["transactions"]:
            ws.append(
                [
                    row["date"],
                    row["openingStock"],
                    row["dispatchQty"],
                    row["salesQty"],
                    row["salesReturnQty"],
                    row["stockTransferInQty"],
                    row["stockTransferOutQty"],
                    row["wastageReceivedQty"] + row["wastageReturnQty"],
                    row["closingStock"],
                    uom,
                ]
            )

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    filename = f"stock_ledger_{locationName}_{fromDate}_{toDate}.xlsx"

    return StreamingResponse(
        stream,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )
