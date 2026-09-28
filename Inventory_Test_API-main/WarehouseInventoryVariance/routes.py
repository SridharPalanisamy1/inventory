from fastapi import APIRouter, HTTPException, Query, Body
from typing import Any, List, Optional, Dict
from datetime import date, datetime, timedelta
import asyncio
import math
from openpyxl.styles import Alignment, Font, PatternFill
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
import io
import re
from datetime import timedelta, timezone
from core.search import mongo_token_query
from pydantic import Field

from OutletInventory.funtions import ist_now
from core.lookups import format_display_name
from core.models import TenantAuditMixin
from db.collections import (
    approvedstocks_rm_collection,
    closingstocks_rm_collection,
    warehouse_physical_stock_closing_collection,
    grn_collection,
    inventory_stock_collection,
    purchaseitem_collection,
    storeDispatch_collection,
    warehouse_collection,
    purchase_uom_collection,
    get_stock_updates_collection, 
)
from funtions import force_float_conversion

from .funtions import (
    _approve_one_rm_closing_item,
    build_filter,
    fetch_grn_data,
    fetch_inventory_map_for_day,
    fetch_opening_stock_for_day,
    fetch_purchase_items,
    fetch_pending_purchase_items,
    fetch_store_dispatch_data,
    fetch_warehouse_return_data,
    get_dropdown_values,
    get_uom_precision_map,
    map_purchase_data,
    round_by_precision,
    safe_float,
    get_pending_rm_item_codes,
    approve_all_warehouse_items,
    _prefetch_rm_docs,
    get_rm_closing_edit_history,
)
from . import funtions
from .models import ApproveItemRequest, ItemResponse, ListItemsResponse

router = APIRouter()

class BulkApproveRMItemRequest(TenantAuditMixin):
    randomIds: List[str] = Field(default_factory=list)
    approved_by: str = "Inventory"
    description: str = ""
    adjustmentMode: str = "ADJUST_SYSTEM"

# ==================== GET ENDPOINT - LIST ITEMS ====================




# ==================== GET PENDING ITEM CODES (NEW) ====================
@router.get("/pending-codes")
async def get_pending_item_codes(
    branch: str = Query(..., description="Warehouse / Location ID"),
    queryDate: Optional[str] = Query(None, description="Date (YYYY-MM-DD)"),
):
    clean_location_id = str(branch or "").strip()
    if not clean_location_id:
        raise HTTPException(status_code=400, detail="branch is required")

    parsed_date = None
    if queryDate:
        try:
            parsed_date = datetime.strptime(queryDate, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid queryDate format. Use YYYY-MM-DD."
            )

    pending_result = await get_pending_rm_item_codes(
        location_id=clean_location_id,
        query_date=parsed_date,
    )

    item_codes = pending_result.get("pendingRandomIds", [])

    closing_col = warehouse_physical_stock_closing_collection()

    total_in_closing, already_approved = await asyncio.gather(
        closing_col.count_documents({"locationId": clean_location_id}),
        closing_col.count_documents(
            {"locationId": clean_location_id, "status": "approved"}
        ),
    )

    return {
        "locationId": clean_location_id,
        "itemCodes": item_codes,
        "total": len(item_codes),
        "totalInClosing": total_in_closing,
        "alreadyApproved": already_approved,
        "closingDate": pending_result.get("date"),
    }


@router.get("/", response_model=ListItemsResponse)
async def get_all_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, le=50),
    varianceName: Optional[str] = None,
    itemName: Optional[str] = None,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    locationName: str = Query(...),
    createdDate: Optional[str] = Query(
        None, description="Date (YYYY-MM-DD). Defaults to today."
    ),

        fetchDropdowns: bool = Query(True),
    pendingOnly: bool = Query(
        False,
        description="When true, return only pending warehouse items."
    ),
    categorySearch: Optional[str] = None,
    categoryPage: int = Query(1, ge=1),
    categoryLimit: int = Query(50, le=100),
    subcategorySearch: Optional[str] = None,
    subcategoryPage: int = Query(1, ge=1),
    subcategoryLimit: int = Query(50, le=100),
    varianceNameSearch: Optional[str] = None,
    varianceNamePage: int = Query(1, ge=1),
    varianceNameLimit: int = Query(50, le=100),
    itemNameSearch: Optional[str] = None,
    itemNamePage: int = Query(1, ge=1),
    itemNameLimit: int = Query(50, le=100),
):
    if not locationName:
        raise HTTPException(status_code=400, detail="locationName is required")

    if not createdDate:
        createdDate = ist_now().strftime("%Y-%m-%d")

    try:
        date_obj = datetime.strptime(createdDate, "%Y-%m-%d")
        next_day = date_obj + timedelta(days=1)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid createdDate format. Use YYYY-MM-DD.",
        )


    full_filter = build_filter(
        varianceName,
        category,
        subcategory,
        itemName,
    )

    if pendingOnly:
        purchase_items, total_count, purchase_col = await fetch_pending_purchase_items(
            skip=skip,
            limit=limit,
            varianceName=varianceName,
            category=category,
            subcategory=subcategory,
            itemName=itemName,
            locationName=locationName,
        )
    else:
        purchase_items, total_count, purchase_col = await fetch_purchase_items(
            skip,
            limit,
            varianceName,
            category,
            subcategory,
            itemName,
        )
  

    core_tasks = [
        fetch_grn_data(date_obj, next_day),
        fetch_store_dispatch_data(date_obj),
        fetch_warehouse_return_data(date_obj, locationName),
        fetch_inventory_map_for_day(locationName, date_obj),
        fetch_opening_stock_for_day(locationName, date_obj),
    ]

    dropdown_tasks = []

    if fetchDropdowns:
        cat_base_filter = {
            k: v for k, v in full_filter.items() if k != "purchasecategoryName"
        }
        subcat_base_filter = {
            k: v for k, v in full_filter.items() if k != "purchasesubcategoryName"
        }
        variance_base_filter = {
            k: v for k, v in full_filter.items() if k != "itemName"
        }
        item_base_filter = {
            k: v for k, v in full_filter.items() if k != "itemgroupName"
        }

        dropdown_tasks = [
            get_dropdown_values(
                purchase_col,
                "purchasecategoryName",
                categoryPage,
                categoryLimit,
                categorySearch,
                base_filter=cat_base_filter,
            ),
            get_dropdown_values(
                purchase_col,
                "purchasesubcategoryName",
                subcategoryPage,
                subcategoryLimit,
                subcategorySearch,
                base_filter=subcat_base_filter,
            ),
            get_dropdown_values(
                purchase_col,
                "itemName",
                varianceNamePage,
                varianceNameLimit,
                varianceNameSearch,
                base_filter=variance_base_filter,
            ),
            get_dropdown_values(
                purchase_col,
                "itemgroupName",
                itemNamePage,
                itemNameLimit,
                itemNameSearch,
                base_filter=item_base_filter,
            ),
        ]

    all_tasks = core_tasks + dropdown_tasks

    results = await asyncio.gather(*all_tasks, return_exceptions=True)


    for i, r in enumerate(results):
        if isinstance(r, Exception):
            raise HTTPException(status_code=500, detail=f"Task {i} failed: {r}")

    grn_data, store_map, warehouse_return_map, inventory_map, opening_stock_map = (
        results[:5]
    )

    response = {
        "items": [],
        "totalItems": total_count,
        "currentDate": createdDate,
    }

    if fetchDropdowns and len(results) >= 9:
        cat_dd, subcat_dd, variance_dd, item_dd = results[5:9]

        response["dropdowns"] = {
            "category": {
                "items": cat_dd[0],
                "total": float(cat_dd[1]),
                "page": categoryPage,
                "limit": categoryLimit,
            },
            "subcategory": {
                "items": subcat_dd[0],
                "total": float(subcat_dd[1]),
                "page": subcategoryPage,
                "limit": subcategoryLimit,
            },
            "varianceName": {
                "items": variance_dd[0],
                "total": float(variance_dd[1]),
                "page": varianceNamePage,
                "limit": varianceNameLimit,
            },
            "itemName": {
                "items": item_dd[0],
                "total": float(item_dd[1]),
                "page": itemNamePage,
                "limit": itemNameLimit,
            },
        }

    formatted_items = await map_purchase_data(
        purchase_items,
        grn_data,
        store_map,
        opening_stock_map,
        inventory_map,
        locationName,
        warehouse_return_map,
        date_obj,
    )
    uom_precision_map = await get_uom_precision_map()

    msg = None
    if not grn_data and not store_map:
        msg = f"No GRN or store dispatch transactions found for {createdDate}."
    elif not grn_data:
        msg = f"No GRN transactions found for {createdDate}."
    elif not store_map:
        msg = f"No store dispatch transactions found for {createdDate}."

    items_dict = [i.dict(by_alias=False) for i in formatted_items]

    random_ids = [
        str(item.get("randomId") or "").strip()
        for item in items_dict
        if item.get("randomId")
    ]

    history_map = {}

    if random_ids:
        history_docs = await warehouse_physical_stock_closing_collection().find(
            {
                "locationId": locationName,
                "randomId": {"$in": random_ids},
            },
            {
                "_id": 0,
                "randomId": 1,
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

        # Keep only the latest document for each randomId,
        # matching the same latest-record idea used by the history lookup.
        for doc in history_docs:
            rid = str(doc.get("randomId") or "").strip()

            if not rid or rid in history_map:
                continue

            edit_history = doc.get("editHistory") or []

            history_map[rid] = bool(edit_history)

    # Add ONLY the new flag.
    # Existing item fields remain unchanged.
    for item in items_dict:
        rid = str(item.get("randomId") or "").strip()
        item["hasEditHistory"] = history_map.get(rid, False)

    closing_docs = []

    if random_ids:
        closing_docs = await closingstocks_rm_collection().find(
            {
                "locationId": locationName,
                "date": createdDate,
                "randomId": {"$in": random_ids},
            }
        ).to_list(None)
        
        pending_docs = await warehouse_physical_stock_closing_collection().find(
            {
                "locationId": locationName,
                "status": "pendingapproval",
                "randomId": {"$in": random_ids},
            }
        ).to_list(None)
 
        pending_map = {
            str(doc.get("randomId") or "").strip(): doc
            for doc in pending_docs
            if doc.get("randomId")
        }
        
    closing_map = {
        str(doc.get("randomId") or "").strip(): doc
        for doc in closing_docs
        if doc.get("randomId")
    }

    closing_doc_ids = [
        str(doc.get("_id"))
        for doc in closing_docs
        if doc.get("_id")
    ]

    approved_docs = []

    # if random_ids and closing_doc_ids:
    # replace the one line 3 8 3 chat
    if random_ids:
        approved_docs = await approvedstocks_rm_collection().find(
            {
                "locationId": locationName,
                "randomId": {"$in": random_ids},
                "status": "approved",
            }
        ).sort("approvedAt", -1).to_list(None)

    approved_map = {}

    for doc in approved_docs:
        rid = str(doc.get("randomId") or "").strip()

        if rid and rid not in approved_map:
            approved_map[rid] = doc
  
    for item in items_dict:
        rid = str(item.get("randomId") or "").strip()

        closing_doc = closing_map.get(rid)
        approved_doc = approved_map.get(rid)
        pending_doc = pending_map.get(rid)

    
        if pending_doc:
    
            system_stock = safe_float(item.get("updatedCurrentSystem", 0))

            physical_stock = pending_doc.get("physicalStock")
   
            uom_name = item.get("uom", "")
            item_precision = uom_precision_map.get(uom_name, 0)

            variance = round_by_precision(
                safe_float(physical_stock) - safe_float(system_stock),
                item_precision,
            )

            item["updatedCurrentSystem"] = system_stock
            item["systemStock"] = system_stock

            item["physicalClosing"] = physical_stock
            item["physicalStock"] = physical_stock

            item["variance"] = variance

            item["approvalStatus"] = "pendingApproval"
            item["approvalButton"] = True
            item["canApprove"] = True

            if safe_float(variance) == 0:
                item["status"] = "noVariance"
            else:
                item["status"] = "variance"


        elif approved_doc:
            item["updatedCurrentSystem"] = approved_doc.get("systemStockAfter")
            item["systemStock"] = approved_doc.get("systemStockAfter")

            latest_physical_stock = approved_doc.get(
                "physicalStock",
                approved_doc.get("physicalClosing")
            )

            item["physicalClosing"] = latest_physical_stock
            item["physicalStock"] = latest_physical_stock

            item["variance"] = 0.0
            item["systemStockAfter"] = approved_doc.get("systemStockAfter")

            item["approvalStatus"] = "approved"
            item["approvalButton"] = False
            item["canApprove"] = False
            item["status"] = "approved"

        # --------------------------------------------------
        # 3. OLD CLOSING STOCK SOURCE
        # --------------------------------------------------
        elif closing_doc:
            # Inventory collection is the source of truth.
            system_stock = safe_float(item.get("updatedCurrentSystem", 0))

            physical_stock = closing_doc.get("physicalStock")
            # variance = closing_doc.get("variance")
            # REPLACE THE PART 6 8 2
            uom_name = item.get("uom", "")
            item_precision = uom_precision_map.get(uom_name, 0)

            variance = round_by_precision(
                safe_float(physical_stock) - safe_float(system_stock),
                item_precision,
            )

            item["updatedCurrentSystem"] = system_stock
            item["systemStock"] = system_stock

            item["physicalClosing"] = physical_stock
            item["physicalStock"] = physical_stock

            item["variance"] = variance

            item["approvalStatus"] = "pendingApproval"
            item["approvalButton"] = True
            item["canApprove"] = True

            if safe_float(variance) == 0:
                item["status"] = "noVariance"
            else:
                item["status"] = "variance"

        # --------------------------------------------------
        # 4. NO PHYSICAL/CLOSING RECORD
        # --------------------------------------------------
        else:
            system_stock = safe_float(item.get("updatedCurrentSystem", 0))

            item["updatedCurrentSystem"] = system_stock
            item["systemStock"] = system_stock

            item["physicalClosing"] = None
            item["physicalStock"] = None
            item["variance"] = None

            item["approvalStatus"] = "notAvailable"
            item["approvalButton"] = False
            item["canApprove"] = False

            item["status"] = "notAvailable"


    status_priority = {
        "pendingApproval": 0,
        "variance": 0,
        "noVariance": 0,
        "approved": 1,
        "notAvailable": 2,
    }


    response["items"] = items_dict
    response["totalItems"] = float(total_count)

    if msg:
        response["message"] = msg

    response = force_float_conversion(response)

    return response


def ist_today_range_utc():
    # IST midnight (00:00) in UTC
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    ist_midnight = ist_now.replace(hour=0, minute=0, second=0, microsecond=0)

    utc_start = ist_midnight - timedelta(hours=5, minutes=30)
    utc_end = utc_start + timedelta(days=1)

    return utc_start, utc_end


# ==================== PATCH ENDPOINT - APPROVE ITEM ====================
@router.patch("/{randomId}/approve")
async def approve_item(
    randomId: str,
    locationId: str = Query(..., description="Warehouse / Location ID"),
    request: ApproveItemRequest = Body(...),
    createdDate: Optional[str] = Query(
        None, description="Date (YYYY-MM-DD). Defaults to today."
    ),
):
    return await _approve_one_rm_closing_item(
        random_id=randomId,
        location_id=locationId,
        approved_by=request.approved_by,
        description=request.description,
        created_date=createdDate,
        adjustment_mode=request.adjustmentMode or "ADJUST_SYSTEM",
        tenant_id=request.tenant_id,
        idempotency_key=request.idempotency_key,
    )


@router.patch("/approve/bulk")
async def approve_multiple_rm_items(
    locationId: str = Query(..., description="Warehouse / Location ID"),
    request: BulkApproveRMItemRequest = Body(...),
    createdDate: Optional[str] = Query(
        None, description="Date (YYYY-MM-DD). Defaults to today."
    ),
):
    clean_location_id = str(locationId or "").strip()

    random_ids = []
    seen = set()

    for rid in request.randomIds:
        clean_rid = str(rid or "").strip()
        if clean_rid and clean_rid not in seen:
            seen.add(clean_rid)
            random_ids.append(clean_rid)

    if not random_ids:
        raise HTTPException(status_code=400, detail="randomIds is required")

    purchase_map, closing_map = await _prefetch_rm_docs(
        location_id=clean_location_id,
        random_ids=random_ids,
        created_date=createdDate,
    )

    results = []
    chunk_size = 50
    for i in range(0, len(random_ids), chunk_size):
        chunk = random_ids[i : i + chunk_size]
        chunk_results = await asyncio.gather(
            *(
                _approve_one_rm_closing_item(
                    random_id=rid,
                    location_id=clean_location_id,
                    approved_by=request.approved_by,
                    description=request.description,
                    created_date=createdDate,
                    adjustment_mode=request.adjustmentMode or "ADJUST_SYSTEM",
                    tenant_id=request.tenant_id,
                    idempotency_key=request.idempotency_key,
                    _purchase_doc=purchase_map.get(rid),
                    _closing_row=closing_map.get(rid),
                )
                for rid in chunk
            ),
            return_exceptions=True,
        )
        results.extend(chunk_results)

    normalized_results = []

    for rid, result in zip(random_ids, results):
        if isinstance(result, Exception):
            normalized_results.append(
                {
                    "randomId": rid,
                    "success": False,
                    "approvalStatus": "error",
                    "approvalButton": True,
                    "message": str(result),
                }
            )
        else:
            normalized_results.append(result)

    approved_count = sum(1 for r in normalized_results if r.get("success") is True)
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
        "message": "Bulk warehouse stock variance approval completed",
        "locationId": clean_location_id,
        "createdDate": createdDate or ist_now().date().isoformat(),
        "totalRequested": len(random_ids),
        "approvedCount": approved_count,
        "noVarianceCount": no_variance_count,
        "notAvailableCount": not_available_count,
        "errorCount": error_count,
        "results": normalized_results,
    }
# newly add this part 3 8 2
# ==================== APPROVE ALL PENDING ITEMS FOR A BRANCH (NEW) ====================
@router.patch("/approve/all")
async def approve_all_branch_items(
    branch: str = Query(..., description="Warehouse / Location ID"),
    queryDate: Optional[str] = Query(None, description="Date (YYYY-MM-DD)"),
    request: BulkApproveRMItemRequest = Body(default=BulkApproveRMItemRequest()),
):

    result = await approve_all_warehouse_items(
        location_id=branch,
        approved_by=request.approved_by,
        description=request.description,
        created_date=queryDate,
        adjustment_mode=request.adjustmentMode or "ADJUST_SYSTEM",
        tenant_id=request.tenant_id,
        idempotency_key=request.idempotency_key,
    )

    return {
        **result,
        "approved": result.get("approvedCount", 0),
        "autoVerified": result.get("noVarianceCount", 0),
        "skipped": result.get("notAvailableCount", 0),
        "flagged": result.get("errorCount", 0),
    }




@router.get("/{randomId}/edit-history")
async def get_item_edit_history(
    randomId: str,
    locationId: str = Query(..., description="Warehouse / Location ID"),
):
    return await get_rm_closing_edit_history(
        location_id=locationId,
        random_id=randomId,
    )




@router.get("/approved")
async def get_approved_items(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    locationId: Optional[str] = None,
    date: Optional[str] = None,
    status: str = Query("approved", description="approved | pendingapproval"),
    itemName: Optional[str] = Query(None, description="Search by item name (case-insensitive)"),
    approvedBy: Optional[str] = Query(None, description="Search by approved by (case-insensitive)"),
    fromDate: Optional[str] = Query(None, description="From date YYYY-MM-DD for approvedAt range"),
    toDate: Optional[str] = Query(None, description="To date YYYY-MM-DD for approvedAt range"),
):
    query: Dict[str, Any] = {}

    if locationId:
        query["locationId"] = locationId.strip()

    # ── Build date filter ──
    date_filter: Dict[str, Any] = {}
    if date and not fromDate and not toDate:
        try:
            date_obj = datetime.strptime(date, "%Y-%m-%d")
            start = datetime(date_obj.year, date_obj.month, date_obj.day)
            end = start + timedelta(days=1)
            date_filter = {"$gte": start, "$lt": end}
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

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
            warehouse_physical_stock_closing_collection().count_documents(pending_query),
            warehouse_physical_stock_closing_collection()
            .find(pending_query)
            .sort("updatedAt", -1)
            .skip(skip)
            .limit(limit)
            .to_list(limit),
        )

        response = []
        for itm in items:
            updated_at = itm.get("updatedAt") or itm.get("createdAt")
            response.append({
                "id": str(itm["_id"]),
                "randomId": itm.get("randomId"),
                "itemName": itm.get("itemName"),
                "locationId": itm.get("locationId"),
                "systemStockBefore": itm.get("systemStock") or itm.get("systemStockBefore"),
                "physicalClosing": itm.get("physicalStock") or itm.get("physicalClosing"),
                "actualVariance": itm.get("variance") or itm.get("actualVariance"),
                "systemStockAfter": itm.get("systemStock") or itm.get("systemStockAfter"),
                "status": "pendingapproval",
                "approvedBy": None,
                "description": itm.get("description"),
                "approvedAt": (
                    updated_at.strftime("%d-%m-%Y %H:%M:%S")
                    if updated_at
                    else None
                ),
            })

        return {"data": response, "page": page, "limit": limit, "total": total}

    approved_query = {**query, "status": "approved"}
    if approvedBy and approvedBy.strip():
        approved_query["approvedBy"] = {"$regex": re.escape(approvedBy.strip()), "$options": "i"}
    if date_filter:
        approved_query["approvedAt"] = date_filter

    total, items = await asyncio.gather(
        approvedstocks_rm_collection().count_documents(approved_query),
        approvedstocks_rm_collection()
        .find(approved_query)
        .sort("approvedAt", -1)
        .skip(skip)
        .limit(limit)
        .to_list(limit),
    )

    if not items:
        return {
            "data": [],
            "page": page,
            "limit": limit,
            "total": total,
            "message": "No approved stock records found",
        }

    response = []
    for itm in items:
        response.append({
            "id": str(itm["_id"]),
            "randomId": itm.get("randomId"),
            "itemName": itm.get("itemName"),
            "locationId": itm.get("locationId"),
            "systemStockBefore": itm.get("systemStockBefore"),
            "physicalClosing": itm.get("physicalClosing"),
            "actualVariance": itm.get("actualVariance"),
            "systemStockAfter": itm.get("systemStockAfter"),
            "status": itm.get("status", "approved"),
            "approvedBy": itm.get("approvedBy"),
            "description": itm.get("description"),
            "approvedAt": (
                itm.get("approvedAt").strftime("%d-%m-%Y %H:%M:%S")
                if itm.get("approvedAt")
                else None
            ),
        })

    return {"data": response, "page": page, "limit": limit, "total": total}




@router.post("/dailystock/all")
async def create_daily_rm_snapshot_all_warehouses(createdBy: str = "Inventory"):
    inventory_col = closingstocks_rm_collection()
    warehouse_col = warehouse_collection()
    purchase_items_col = purchaseitem_collection()
    stock_col = inventory_stock_collection()

    now = ist_now()
    today_date = now.date()
    today = today_date.isoformat()

    active_status = {"$in": [1, "1", "active", "Active", "ACTIVE"]}

    warehouses, purchase_items, uom_map = await asyncio.gather(
        warehouse_col.find(
            {
                "status": active_status,
                "type": {"$in": ["main", "Main"]},
            }
        ).to_list(None),
        purchase_items_col.find(
            {
                "status": active_status,
                "randomId": {"$exists": True, "$ne": ""},
            }
        ).to_list(None),
        get_uom_precision_map(),
    )

    if not warehouses:
        raise HTTPException(status_code=404, detail="No active warehouses found")

    if not purchase_items:
        raise HTTPException(status_code=404, detail="No active purchase items found")

    purchase_random_ids = [
        item["randomId"] for item in purchase_items if item.get("randomId")
    ]

    if not purchase_random_ids:
        raise HTTPException(
            status_code=404, detail="No valid purchase item randomIds found"
        )

    def _matches_today(value: Any) -> bool:
        """
        Physical stock is today's physical stock only when updatedAt/createdAt
        belongs to today's IST date.
        """
        if not value:
            return False

        try:
            if isinstance(value, datetime):
                if value.date() == today_date:
                    return True

                # DB datetime may be UTC naive, convert to IST and compare
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

    created_count = 0
    skipped_count = 0
    total_inserted_items = 0
    total_skipped_existing_items = 0
    total_skipped_no_stock_items = 0
    total_not_available_items = 0
    total_pending_items = 0
    total_approved_items = 0
    errors = []
    warehouse_results = []

    for wh in warehouses:
        warehouse_id = wh.get("warehouseId") or wh.get("locationId")
        warehouse_name = wh.get("warehouseName") or wh.get("locationName")

        if not warehouse_id:
            errors.append("Warehouse skipped: missing warehouseId/locationId")
            continue

        try:
            stock_records, existing_snapshot_docs = await asyncio.gather(
                stock_col.find(
                    {
                        "locationId": warehouse_id,
                        "randomId": {"$in": purchase_random_ids},
                    },
                    {
                        "_id": 0,
                        "randomId": 1,
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
                        "locationId": warehouse_id,
                        "date": today,
                        "randomId": {"$in": purchase_random_ids},
                    },
                    {
                        "_id": 0,
                        "randomId": 1,
                    },
                ).to_list(None),
            )

            stock_map = {
                rec["randomId"]: rec for rec in stock_records if rec.get("randomId")
            }

            already_snapshotted_random_ids = {
                doc["randomId"] for doc in existing_snapshot_docs if doc.get("randomId")
            }

            docs = []

            skipped_no_stock_items = 0
            not_available_items = 0
            pending_items = 0
            approved_items = 0

            for item in purchase_items:
                rid = item.get("randomId")

                if not rid:
                    continue

                # Skip only already-created item snapshot.
                # Do not skip full warehouse.
                if rid in already_snapshotted_random_ids:
                    continue

                stock = stock_map.get(rid)

                # Important:
                # If stock doc does not exist, do not create zero snapshot.
                if not stock:
                    skipped_no_stock_items += 1
                    continue

                uom_name = item.get("uom", "")
                precision = uom_map.get(uom_name, 0)

                # System stock = actual inventory stock, no date filter.
                system_stock = round_by_precision(
                    safe_float(stock.get("systemStock", 0.0)),
                    precision,
                )

                has_today_physical = _has_today_physical_stock(stock)

                if has_today_physical:
                    # Physical stock = today's entered stock only.
                    physical_stock = round_by_precision(
                        safe_float(stock.get("physicalStock", 0.0)),
                        precision,
                    )

                    variance = round_by_precision(
                        physical_stock - system_stock,
                        precision,
                    )

                    snapshot_status = (
                        "pending" if safe_float(variance) != 0 else "approved"
                    )

                    if snapshot_status == "pending":
                        pending_items += 1
                    else:
                        approved_items += 1

                else:
                    # No physical entry today.
                    # Do not force 0.
                    physical_stock = None
                    variance = None
                    snapshot_status = "notAvailable"
                    not_available_items += 1

                docs.append(
                    {
                        "locationId": warehouse_id,
                        "locationName": warehouse_name,
                        "locationType": "Warehouse",
                        "randomId": rid,
                        "systemStock": system_stock,
                        "physicalStock": physical_stock,
                        "variance": variance,
                        "status": snapshot_status,
                        "sourceStockUpdatedAt": stock.get("updatedAt"),
                        "sourceStockCreatedAt": stock.get("createdAt"),
                        "date": today,
                        "createdBy": createdBy,
                        "createdAt": now,
                    }
                )

            if docs:
                await inventory_col.insert_many(docs, ordered=False)
                created_count += 1
            else:
                skipped_count += 1

            total_inserted_items += len(docs)
            total_skipped_existing_items += len(already_snapshotted_random_ids)
            total_skipped_no_stock_items += skipped_no_stock_items
            total_not_available_items += not_available_items
            total_pending_items += pending_items
            total_approved_items += approved_items

            warehouse_results.append(
                {
                    "locationId": warehouse_id,
                    "locationName": warehouse_name,
                    "insertedItems": len(docs),
                    "skippedExistingItems": len(already_snapshotted_random_ids),
                    "skippedNoStockItems": skipped_no_stock_items,
                    "notAvailableItems": not_available_items,
                    "pendingItems": pending_items,
                    "approvedItems": approved_items,
                }
            )

        except Exception as e:
            errors.append(f"{warehouse_id}: {str(e)}")

    response = {
        "message": "Daily RM snapshot created for all warehouses",
        "date": today,
        "totalWarehouses": len(warehouses),
        "createdWarehouses": created_count,
        "skippedWarehouses": skipped_count,
        "totalPurchaseItems": len(purchase_random_ids),
        "totalInsertedItems": total_inserted_items,
        "totalSkippedExistingItems": total_skipped_existing_items,
        "totalSkippedNoStockItems": total_skipped_no_stock_items,
        "totalNotAvailableItems": total_not_available_items,
        "totalPendingItems": total_pending_items,
        "totalApprovedItems": total_approved_items,
        "errors": errors,
        "warehouses": warehouse_results,
    }

    return force_float_conversion(response)


@router.get("/items", response_model=List[ItemResponse])
async def get_item_names(
    page: int = Query(1, ge=1),
    limit: int = Query(10, le=50),
    search: str | None = None,
):
    collection = purchaseitem_collection()

    query = mongo_token_query(search, ["itemName", "itemgroupName"])
    cursor = (
        collection.find(
            query,
            {
                "_id": 0,
                "randomId": 1,
                "itemName": 1,
                "itemgroupName": 1,
            },
        )
        .skip((page - 1) * limit)
        .limit(limit)
    )

    items = []
    async for doc in cursor:
        item_name = doc.get("itemName") or ""
        group_name = doc.get("itemgroupName") or ""
        variance_name = format_display_name(item_name, group_name)

        items.append(
            {
                "randomId": doc.get("randomId", ""),
                "itemName": item_name,
                "varianceName": variance_name,
            }
        )

    return items


@router.get("/stock-ledger")
async def stock_ledger_daily(
    from_date: str = Query(...),
    to_date: str = Query(...),
    itemRandomId: Optional[str] = Query(None),
    locationName: Optional[str] = Query(None),
):
    try:
        start_date = datetime.strptime(from_date, "%Y-%m-%d")
        end_date = datetime.strptime(to_date, "%Y-%m-%d")

        if start_date > end_date:
            raise HTTPException(400, "Invalid date range")

        if not itemRandomId or not locationName:
            raise HTTPException(400, "itemRandomId and locationName are required")

        inventory_col = closingstocks_rm_collection()
        grn_col = grn_collection()
        store_col = storeDispatch_collection()
        item_col = purchaseitem_collection()

        random_ids = [r.strip() for r in itemRandomId.split(",")]
        warehouse_id = locationName.strip()

        prev_day = start_date - timedelta(days=1)

        items = await item_col.find(
            {"randomId": {"$in": random_ids}},
            {"_id": 0, "randomId": 1, "itemName": 1, "uom": 1},
        ).to_list(None)

        item_map = {
            i["randomId"]: {"itemName": i.get("itemName", ""), "uom": i.get("uom", "")}
            for i in items
        }
        uom_precision_map = await get_uom_precision_map()

        opening_stocks = {rid: 0.0 for rid in random_ids}
        prev_docs = await inventory_col.find(
            {
                "date": prev_day.strftime("%Y-%m-%d"),
                "locationId": warehouse_id,
                "randomId": {"$in": random_ids},
            }
        ).to_list(None)

        for doc in prev_docs:
            rid = doc["randomId"]
            precision = uom_precision_map.get(item_map.get(rid, {}).get("uom", ""), 0)
            opening_stocks[rid] = round_by_precision(
                float(doc.get("systemStock", 0)), precision
            )

        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date, datetime.max.time())

        grn_pipeline = [
            {
                "$match": {
                    "grnDate": {"$gte": start_dt, "$lte": end_dt},
                    "locationId": warehouse_id,
                }
            },
            {"$unwind": "$itemDetails"},
            {"$match": {"itemDetails.item_rand": {"$in": random_ids}}},
            {
                "$group": {
                    "_id": {
                        "date": {
                            "$dateToString": {"format": "%Y-%m-%d", "date": "$grnDate"}
                        },
                        "item": "$itemDetails.item_rand",
                    },
                    "received": {"$sum": "$itemDetails.receivedQuantity"},
                    "returned": {
                        "$sum": {"$ifNull": ["$itemDetails.returnedQuantity", 0]}
                    },
                    "vendors": {"$addToSet": "$vendorName"},
                }
            },
        ]
        grn_data = await grn_col.aggregate(grn_pipeline).to_list(None)
        grn_map = {(g["_id"]["date"], g["_id"]["item"]): g for g in grn_data}

        dispatch_pipeline = [
            {
                "$match": {
                    "type": "store",
                    "warehouseId": warehouse_id,
                    "date": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()},
                }
            },
            {"$unwind": {"path": "$randomId", "includeArrayIndex": "idx"}},
            {"$match": {"randomId": {"$in": random_ids}}},
            {
                "$project": {
                    "date": "$date",
                    "randomId": "$randomId",
                    "branchName": "$branchName",
                    "weight": {"$arrayElemAt": ["$weight", "$idx"]},
                    "qty": {"$arrayElemAt": ["$qty", "$idx"]},
                    "uom": {"$arrayElemAt": ["$uom", "$idx"]},
                }
            },
            {
                "$group": {
                    "_id": {"date": {"$substr": ["$date", 0, 10]}, "item": "$randomId"},
                    "totalOut": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$in": [
                                        {"$toLower": "$uom"},
                                        ["kg", "kgs", "ltr", "ltrs"],
                                    ]
                                },
                                "$weight",
                                "$qty",
                            ]
                        }
                    },
                    "branches": {"$addToSet": "$branchName"},
                }
            },
        ]
        dispatch_data = await store_col.aggregate(dispatch_pipeline).to_list(None)
        dispatch_map = {(d["_id"]["date"], d["_id"]["item"]): d for d in dispatch_data}

        ledgers = {
            rid: {
                "randomId": rid,
                "itemDetails": item_map.get(rid, ""),
                "openingReference": {
                    "date": prev_day.strftime("%Y-%m-%d"),
                    "closingStock": opening_stocks[rid],
                },
                "transactions": [],
            }
            for rid in random_ids
        }

        cur = start_date

        while cur <= end_date:
            cur_str = cur.strftime("%Y-%m-%d")

            snapshot_docs = await inventory_col.find(
                {
                    "date": cur_str,
                    "locationId": warehouse_id,
                    "randomId": {"$in": random_ids},
                }
            ).to_list(None)

            balance_from_db = {}
            for d in snapshot_docs:
                rid = d["randomId"]
                precision = uom_precision_map.get(
                    item_map.get(rid, {}).get("uom", ""), 0
                )
                balance_from_db[rid] = round_by_precision(
                    float(d.get("systemStock", 0)), precision
                )

            for rid in random_ids:
                precision = uom_precision_map.get(
                    item_map.get(rid, {}).get("uom", ""), 0
                )
                key = (cur_str, rid)

                grn_entry = grn_map.get(key, {})
                received = round_by_precision(
                    float(grn_entry.get("received", 0)), precision
                )
                returned = round_by_precision(
                    float(grn_entry.get("returned", 0)), precision
                )
                vendors = ", ".join(grn_entry.get("vendors", []))

                disp_entry = dispatch_map.get(key, {})
                out_stock = round_by_precision(
                    float(disp_entry.get("totalOut", 0)), precision
                )
                branch = ", ".join(disp_entry.get("branches", []))

                current_balance = balance_from_db.get(rid, 0.0)

                ledgers[rid]["transactions"].append(
                    {
                        "date": cur_str,
                        "grnVendorName": vendors,
                        "dispatchBranch": branch,
                        "returnedToVendor": "",
                        "inStock": received,
                        "outStock": out_stock,
                        "returnedStock": returned,
                        "balanceStock": current_balance,
                    }
                )

            cur += timedelta(days=1)

        for rid in random_ids:
            last_trans = (
                ledgers[rid]["transactions"][-1] if ledgers[rid]["transactions"] else {}
            )
            ledgers[rid]["closingSummary"] = {
                "date": end_date.strftime("%Y-%m-%d"),
                "closingStock": last_trans.get("balanceStock", 0.0),
            }

        return list(ledgers.values())

    except Exception as e:
        raise HTTPException(500, f"Ledger error: {str(e)}")


@router.get("/stock-ledger/excel")
async def stock_ledger_daily_excel(
    from_date: str = Query(...),
    to_date: str = Query(...),
    itemRandomId: Optional[str] = Query(None),
    locationName: Optional[str] = Query(None),
):
    try:
        if not itemRandomId or not locationName:
            raise HTTPException(400, "itemRandomId and locationName are required")

        start_date = datetime.strptime(from_date, "%Y-%m-%d")
        end_date = datetime.strptime(to_date, "%Y-%m-%d")

        if start_date > end_date:
            raise HTTPException(400, "Invalid date range")

        inventory_col = closingstocks_rm_collection()
        grn_col = grn_collection()
        store_col = storeDispatch_collection()
        item_col = purchaseitem_collection()

        random_ids = [r.strip() for r in itemRandomId.split(",")]
        warehouse_id = locationName.strip()

        prev_day = start_date - timedelta(days=1)

        items = await item_col.find(
            {"randomId": {"$in": random_ids}},
            {"_id": 0, "randomId": 1, "itemName": 1, "uom": 1},
        ).to_list(None)

        item_map = {
            i["randomId"]: {"itemName": i.get("itemName", ""), "uom": i.get("uom", "")}
            for i in items
        }
        uom_precision_map = await get_uom_precision_map()

        opening_stocks = {rid: 0.0 for rid in random_ids}
        prev_docs = await inventory_col.find(
            {
                "date": prev_day.strftime("%Y-%m-%d"),
                "locationId": warehouse_id,
                "randomId": {"$in": random_ids},
            }
        ).to_list(None)

        for doc in prev_docs:
            rid = doc["randomId"]
            precision = uom_precision_map.get(item_map.get(rid, {}).get("uom", ""), 0)
            opening_stocks[rid] = round_by_precision(
                float(doc.get("systemStock", 0)), precision
            )

        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date, datetime.max.time())

        grn_pipeline = [
            {
                "$match": {
                    "grnDate": {"$gte": start_dt, "$lte": end_dt},
                    "locationId": warehouse_id,
                }
            },
            {"$unwind": "$itemDetails"},
            {"$match": {"itemDetails.item_rand": {"$in": random_ids}}},
            {
                "$group": {
                    "_id": {
                        "date": {
                            "$dateToString": {"format": "%Y-%m-%d", "date": "$grnDate"}
                        },
                        "item": "$itemDetails.item_rand",
                    },
                    "received": {"$sum": "$itemDetails.receivedQuantity"},
                    "returned": {
                        "$sum": {"$ifNull": ["$itemDetails.returnedQuantity", 0]}
                    },
                    "vendors": {"$addToSet": "$vendorName"},
                }
            },
        ]
        grn_data = await grn_col.aggregate(grn_pipeline).to_list(None)
        grn_map = {(g["_id"]["date"], g["_id"]["item"]): g for g in grn_data}

        dispatch_pipeline = [
            {
                "$match": {
                    "type": "store",
                    "warehouseId": warehouse_id,
                    "date": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()},
                }
            },
            {"$unwind": {"path": "$randomId", "includeArrayIndex": "idx"}},
            {"$match": {"randomId": {"$in": random_ids}}},
            {
                "$project": {
                    "date": "$date",
                    "randomId": "$randomId",
                    "branchName": "$branchName",
                    "weight": {"$arrayElemAt": ["$weight", "$idx"]},
                    "qty": {"$arrayElemAt": ["$qty", "$idx"]},
                    "uom": {"$arrayElemAt": ["$uom", "$idx"]},
                }
            },
            {
                "$group": {
                    "_id": {"date": {"$substr": ["$date", 0, 10]}, "item": "$randomId"},
                    "totalOut": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$in": [
                                        {"$toLower": "$uom"},
                                        ["kg", "kgs", "ltr", "ltrs"],
                                    ]
                                },
                                "$weight",
                                "$qty",
                            ]
                        }
                    },
                    "branches": {"$addToSet": "$branchName"},
                }
            },
        ]
        dispatch_data = await store_col.aggregate(dispatch_pipeline).to_list(None)
        dispatch_map = {(d["_id"]["date"], d["_id"]["item"]): d for d in dispatch_data}

        ledgers = {
            rid: {
                "randomId": rid,
                "itemDetails": item_map.get(rid, ""),
                "openingReference": {
                    "date": prev_day.strftime("%Y-%m-%d"),
                    "closingStock": opening_stocks[rid],
                },
                "transactions": [],
            }
            for rid in random_ids
        }

        cur = start_date
        while cur <= end_date:
            cur_str = cur.strftime("%Y-%m-%d")

            snapshot_docs = await inventory_col.find(
                {
                    "date": cur_str,
                    "locationId": warehouse_id,
                    "randomId": {"$in": random_ids},
                }
            ).to_list(None)

            balance_from_db = {}
            for d in snapshot_docs:
                rid = d["randomId"]
                precision = uom_precision_map.get(
                    item_map.get(rid, {}).get("uom", ""), 0
                )
                balance_from_db[rid] = round_by_precision(
                    float(d.get("systemStock", 0)), precision
                )

            for rid in random_ids:
                precision = uom_precision_map.get(
                    item_map.get(rid, {}).get("uom", ""), 0
                )
                key = (cur_str, rid)

                grn_entry = grn_map.get(key, {})
                received = round_by_precision(
                    float(grn_entry.get("received", 0)), precision
                )
                returned = round_by_precision(
                    float(grn_entry.get("returned", 0)), precision
                )
                vendors = ", ".join(grn_entry.get("vendors", []))

                disp_entry = dispatch_map.get(key, {})
                out_stock = round_by_precision(
                    float(disp_entry.get("totalOut", 0)), precision
                )
                branch = ", ".join(disp_entry.get("branches", []))

                current_balance = balance_from_db.get(rid, 0.0)

                ledgers[rid]["transactions"].append(
                    {
                        "date": cur_str,
                        "grnVendorName": vendors,
                        "dispatchBranch": branch,
                        "returnedToVendor": "",
                        "inStock": received,
                        "outStock": out_stock,
                        "returnedStock": returned,
                        "balanceStock": current_balance,
                    }
                )

            cur += timedelta(days=1)

        for rid in random_ids:
            last_trans = (
                ledgers[rid]["transactions"][-1] if ledgers[rid]["transactions"] else {}
            )
            ledgers[rid]["closingSummary"] = {
                "date": end_date.strftime("%Y-%m-%d"),
                "closingStock": last_trans.get("balanceStock", 0.0),
            }

        # ---------------------------------------------------------
        # GENERATE EXCEL FILE
        # ---------------------------------------------------------
        wb = Workbook()
        ws = wb.active
        ws.title = "Stock Ledger"

        headers = [
            "Item Random ID",
            "Item Name",
            "Date",
            "GRN Vendor",
            "Dispatch Branch",
            "In Stock",
            "Out Stock",
            "Returned Stock",
            "Balance Stock",
        ]
        ws.append(headers)

        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="4F81BD", end_color="4F81BD", fill_type="solid")
        for col_num, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_num)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for rid in random_ids:
            ledger = ledgers.get(rid, {})
            item_name = ledger.get("itemDetails", {}).get("itemName", "")
            for trans in ledger.get("transactions", []):
                ws.append([
                    rid,
                    item_name,
                    trans.get("date", ""),
                    trans.get("grnVendorName", ""),
                    trans.get("dispatchBranch", ""),
                    trans.get("inStock", 0),
                    trans.get("outStock", 0),
                    trans.get("returnedStock", 0),
                    trans.get("balanceStock", 0),
                ])

            # Append closing summary row
            closing = ledger.get("closingSummary", {})
            ws.append([
                rid,
                item_name,
                closing.get("date", ""),
                "",
                "",
                "",
                "",
                "",
                f"Closing: {closing.get('closingStock', 0.0)}"
            ])

        # Auto-adjust column widths
        for column in ws.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = (max_length + 2)
            ws.column_dimensions[column_letter].width = adjusted_width

        # Save to BytesIO buffer
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        headers_download = {
            "Content-Disposition": f"attachment; filename=stock_ledger_{from_date}_to_{to_date}.xlsx"
        }

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers_download,
        )

    except Exception as e:
        raise HTTPException(500, f"Ledger Excel error: {str(e)}")