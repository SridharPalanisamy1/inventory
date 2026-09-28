from __future__ import annotations
import asyncio
import csv
import io
import re
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pymongo import UpdateOne
logger = logging.getLogger(__name__)
from OutletInventory.funtions import _get_all_active_locations
from OutletInventory.models import (
    BranchStockBulkUpdateModel,
    GetItemsResponseModel,
    StockResponseModel,
    StockUpdateModel,
    branchResponse,
    locationResponse,
)
from db.collections import (
    inventorytest_stock_collection,
    item_master_collection,
    location_collection,
    stock_history_collection,
    warehouse_collection,
)
from core.compute import calculate_variance, ist_now, safe_float
from core.lookups import (
    get_all_filter_options,
    get_category_map,
    get_subcategory_map,
    get_uom_map,
    _build_filter_query,
)
from funtions import format_stock_for_response, normalize_stock
from core.search import mongo_token_query
router = APIRouter()


def _master():
    return item_master_collection()


def _compute_stock_update_values(
    existing_stock: Optional[Dict[str, Any]],
    new_stock: float,
) -> Dict[str, Any]:

    normalized_new_stock = safe_float(new_stock)
    has_existing_stock = bool(existing_stock)

    if has_existing_stock:
        old_stock = safe_float((existing_stock or {}).get("systemStock", 0))
        previous_system_stock = old_stock
        history_before_stock = old_stock
        history_after_stock = normalized_new_stock
        history_variance = calculate_variance(old_stock, normalized_new_stock)
        adjustment_qty = history_variance
        is_initial_stock = False
    else:
        previous_system_stock = normalized_new_stock
        history_before_stock = normalized_new_stock
        history_after_stock = normalized_new_stock
        history_variance = 0
        adjustment_qty = 0
        is_initial_stock = True

    return {
        "systemStock": normalized_new_stock,
        "physicalStock": normalized_new_stock,
        "previousSystemStock": previous_system_stock,
        "currentVariance": 0,
        "historyBeforeStock": history_before_stock,
        "historyAfterStock": history_after_stock,
        "historyVariance": history_variance,
        "adjustmentQty": adjustment_qty,
        "isInitialStock": is_initial_stock,
    }


def _current_display_variance(stock_doc: Dict[str, Any]) -> float:
    system_stock = safe_float(stock_doc.get("systemStock", 0))
    physical_stock = safe_float(stock_doc.get("physicalStock", 0))
    return calculate_variance(system_stock, physical_stock)


@router.post("/stock", response_model=StockResponseModel)
async def post_stock(
    stock: StockUpdateModel,
    status: str = Query("approved"),
    updated_by: str = Query("System"),
    description: str = Query(""),
):
    now = ist_now()

    item, existing_stock = await asyncio.gather(
        _master().find_one({"itemCode": stock.itemCode}),
        inventorytest_stock_collection().find_one(
            {"itemCode": stock.itemCode, "locationId": stock.locationId}
        ),
    )

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item_type = item.get("itemType", "")
    prev_so = safe_float((existing_stock or {}).get("systemStockSo", 0))
    prev_physical_so = safe_float((existing_stock or {}).get("physicalStockSo", 0))

    after_stock = await normalize_stock(item, stock.physicalStock)
    computed = _compute_stock_update_values(existing_stock, after_stock)

    await asyncio.gather(
        inventorytest_stock_collection().update_one(
            {"itemCode": stock.itemCode, "locationId": stock.locationId},
            {
                "$set": {
                    "itemType": item_type,
                    "systemStock": computed["systemStock"],
                    "physicalStock": computed["physicalStock"],
                    "previousSystemStock": computed["previousSystemStock"],
                    "systemStockSo": prev_so,
                    "physicalStockSo": prev_physical_so,
                    "variance": computed["currentVariance"],
                    "adjustmentQty": computed["adjustmentQty"],
                    "isInitialStock": computed["isInitialStock"],
                    "status": status,
                    "updatedAt": now,
                    "lastUpdatedBy": updated_by,
                    "tenantId": stock.tenant_id,
                    "idempotencyKey": stock.idempotency_key,
                },
                "$setOnInsert": {
                    "createdAt": now,
                    "itemCode": stock.itemCode,
                    "locationId": stock.locationId,
                    "createdBy": updated_by,
                },
            },
            upsert=True,
        ),
        stock_history_collection().insert_one(
            {
                "itemCode": stock.itemCode,
                "locationId": stock.locationId,
                "itemType": item_type,
                "beforeStock": computed["historyBeforeStock"],
                "afterStock": computed["historyAfterStock"],
                "variance": computed["historyVariance"],
                "adjustmentQty": computed["adjustmentQty"],
                "isInitialStock": computed["isInitialStock"],
                "status": status,
                "action": "POST_CREATE",
                "updatedBy": updated_by,
                "description": description,
                "updatedAt": now,
                "tenantId": stock.tenant_id,
                "idempotencyKey": stock.idempotency_key,
            }
        ),
    )

    return {
        "itemCode": stock.itemCode,
        "locationId": stock.locationId,
        "itemType": item_type,
        "systemStock": computed["systemStock"],
        "physicalStock": computed["physicalStock"],
        "systemStockSo": prev_so,
        "physicalStockSo": prev_physical_so,
        "previousSystemStock": computed["previousSystemStock"],
        "variance": computed["currentVariance"],
        "adjustmentQty": computed["adjustmentQty"],
        "isInitialStock": computed["isInitialStock"],
        "status": status,
        "createdAt": (existing_stock or {}).get("createdAt", now),
        "updatedAt": now,
    }



@router.get("/", response_model=GetItemsResponseModel)
async def get_items(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    branch: str = Query(...),
    category: Optional[str] = Query(None),
    subCategory: Optional[str] = Query(None),
    itemName: Optional[str] = Query(None),
    varianceName: Optional[str] = Query(None),
    include_filter_options: bool = Query(False),
    only_filter_options: bool = Query(False),
    categoryPage: int = Query(1, ge=1),
    categoryLimit: int = Query(20, ge=1, le=100),
    categorySearch: Optional[str] = Query(None),
    subCategoryPage: int = Query(1, ge=1),
    subCategoryLimit: int = Query(20, ge=1, le=100),
    subCategorySearch: Optional[str] = Query(None),
    itemNamePage: int = Query(1, ge=1),
    itemNameLimit: int = Query(20, ge=1, le=100),
    itemNameSearch: Optional[str] = Query(None),
    varianceNamePage: int = Query(1, ge=1),
    varianceNameLimit: int = Query(20, ge=1, le=100),
    varianceNameSearch: Optional[str] = Query(None),
    date: Optional[date] = Query(None),
):
    col = _master()

    category_map, subcategory_map, uom_map = await asyncio.gather(
        get_category_map(),
        get_subcategory_map(),
        get_uom_map(),
    )

    response: Dict[str, Any] = {}

    fetch_items = not only_filter_options and not (include_filter_options and page > 1)

    if fetch_items:
        filters = {
            "status": {"$in": ["active", "Active"]},
            **_build_filter_query(
                category=category,
                sub_category=subCategory,
                item_name=itemName,
                variance_name=varianceName,
            ),
        }

        skip = (page - 1) * limit

        total, raw_items = await asyncio.gather(
            col.count_documents(filters),
            col.find(filters).skip(skip).limit(limit).to_list(length=limit),
        )

        item_codes = [i.get("itemCode") for i in raw_items if i.get("itemCode")]

        stock_docs = await (
            inventorytest_stock_collection()
            .find({"locationId": branch, "itemCode": {"$in": item_codes}})
            .to_list(length=len(item_codes))
        )

        stock_map: Dict[str, Any] = {
            s["itemCode"]: s for s in stock_docs if s.get("itemCode")
        }

        items = []

        for raw in raw_items:
            item_code = raw.get("itemCode")
            if not item_code:
                continue

            stock_doc = stock_map.get(item_code, {})
            category_id = raw.get("category")
            sub_id = raw.get("subCategory")
            uom_id = raw.get("variance_Uom")  

            system_stock_raw = stock_doc.get("systemStock", 0)
            physical_stock_raw = stock_doc.get("physicalStock", 0)

            system_stock = await format_stock_for_response(raw, system_stock_raw)
            physical_stock = await format_stock_for_response(raw, physical_stock_raw)

     
            variance = await format_stock_for_response(
                raw,
                _current_display_variance(stock_doc),
            )

            items.append(
                {
                    "id": str(raw["_id"]),
                    "itemCode": item_code,
                    "category": {
                        "id": category_id,
                        "name": category_map.get(category_id),
                    },
                    "subCategory": {
                        "id": sub_id,
                        "name": subcategory_map.get(sub_id),
                    },
             
                    "itemName": {
                        "id": raw.get("itemId") or raw.get("itemName"),
                        "name": raw.get("itemName"),
                    },
              
                    "varianceName": {
                        "id": item_code,
                        "name": raw.get("varianceName"),
                    },
                    "uom": {
                        "id": uom_id,
                        "name": uom_map.get(uom_id),
                    },
                    "systemStock": system_stock,
                    "systemStockSo": stock_doc.get("systemStockSo", 0),
                    "physicalStock": physical_stock,
                    "previousSystemStock": stock_doc.get("previousSystemStock", 0),
                    "variance": variance,
                    "adjustmentQty": stock_doc.get("adjustmentQty", 0),
                    "isInitialStock": stock_doc.get("isInitialStock", False),
                    "status": stock_doc.get("status", "approved"),
                    "updatedAt": stock_doc.get("updatedAt", datetime.utcnow()),
                }
            )

        response["filteredItems"] = {
            "total": total,
            "page": page,
            "limit": limit,
            "count": len(items),
            "items": items,
            "message": f"Items retrieved for {date or datetime.utcnow().date()}",
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




@router.patch("/{itemCode}/update-stock")
async def update_system_stock(
    itemCode: str,
    locationId: str = Query(...),
    physical_stock: float = Query(..., ge=0),
    status: str = Query("approved"),
    updated_by: Optional[str] = Query("Inventory"),
    description: str = Query(""),
    tenant_id: Optional[str] = Query(None),
    idempotency_key: Optional[str] = Query(None),
):
    now = ist_now()

    item, existing_stock = await asyncio.gather(
        _master().find_one({"itemCode": itemCode}, {"itemType": 1}),
        inventorytest_stock_collection().find_one(
            {"itemCode": itemCode, "locationId": locationId}
        ),
    )

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item_type = item.get("itemType", "")
    prev_so = safe_float((existing_stock or {}).get("systemStockSo", 0))
    prev_physical_so = safe_float((existing_stock or {}).get("physicalStockSo", 0))

    after_stock = safe_float(physical_stock)
    computed = _compute_stock_update_values(existing_stock, after_stock)

    await asyncio.gather(
        inventorytest_stock_collection().update_one(
            {"itemCode": itemCode, "locationId": locationId},
            {
                "$set": {
                    "itemType": item_type,
                    "systemStock": computed["systemStock"],
                    "physicalStock": computed["physicalStock"],
                    "previousSystemStock": computed["previousSystemStock"],
                    "systemStockSo": prev_so,
                    "physicalStockSo": prev_physical_so,
                    "variance": computed["currentVariance"],
                    "adjustmentQty": computed["adjustmentQty"],
                    "isInitialStock": computed["isInitialStock"],
                    "status": status,
                    "updatedAt": now,
                    "lastUpdatedBy": updated_by,
                    "tenantId": tenant_id or "",
                    "idempotencyKey": idempotency_key or "",
                },
                "$setOnInsert": {
                    "createdAt": now,
                    "itemCode": itemCode,
                    "locationId": locationId,
                    "createdBy": updated_by,
                },
            },
            upsert=True,
        ),
        stock_history_collection().insert_one(
            {
                "itemCode": itemCode,
                "locationId": locationId,
                "itemType": item_type,
                "beforeStock": computed["historyBeforeStock"],
                "afterStock": computed["historyAfterStock"],
                "variance": computed["historyVariance"],
                "adjustmentQty": computed["adjustmentQty"],
                "isInitialStock": computed["isInitialStock"],
                "status": status,
                "action": "MANUAL_UPDATE",
                "updatedBy": updated_by,
                "description": description,
                "updatedAt": now,
                "tenantId": tenant_id or "",
                "idempotencyKey": idempotency_key or "",
            }
        ),
    )

    return {
        "message": "Stock updated successfully",
        "itemCode": itemCode,
        "locationId": locationId,
        "previousSystemStock": computed["previousSystemStock"],
        "updatedSystemStock": computed["systemStock"],
        "variance": computed["currentVariance"],
        "adjustmentQty": computed["adjustmentQty"],
        "isInitialStock": computed["isInitialStock"],
        "status": status,
        "updatedAt": now,
    }





@router.patch("/update-stock/bulk")
async def update_branch_stock_bulk(
    payload: BranchStockBulkUpdateModel,
    status: str = Query("approved"),
    updated_by: str = Query("Inventory"),
    description: str = Query(""),
):
    now = ist_now()
    item_codes = [u.itemCode for u in payload.updates]

    items_cursor = _master().find(
        {
            "itemCode": {"$in": item_codes},
            "status": {"$in": ["active", "Active"]},
        },
        {"itemCode": 1, "itemType": 1},
    )

    pair_filters = [
        {"itemCode": u.itemCode, "locationId": u.locationId} for u in payload.updates
    ]
    existing_query: Dict[str, Any] = (
        {"$or": pair_filters} if pair_filters else {"_id": None}
    )

    existing_cursor = inventorytest_stock_collection().find(
        existing_query,
        {
            "itemCode": 1,
            "locationId": 1,
            "systemStock": 1,
            "systemStockSo": 1,
            "physicalStockSo": 1,
        },
    )

    items_list, existing_list = await asyncio.gather(
        items_cursor.to_list(None),
        existing_cursor.to_list(None),
    )

    item_map: Dict[str, Any] = {i["itemCode"]: i for i in items_list}
    existing_map: Dict[tuple, Any] = {
        (e["itemCode"], e["locationId"]): e for e in existing_list
    }

    bulk_updates = []
    history_docs = []
    response_rows = []

    for u in payload.updates:
        item_doc = item_map.get(u.itemCode)
        if not item_doc:
            continue

        item_type = item_doc.get("itemType", "UNKNOWN")
        existing = existing_map.get((u.itemCode, u.locationId))
        prev_so = safe_float((existing or {}).get("systemStockSo", 0))
        prev_physical_so = safe_float((existing or {}).get("physicalStockSo", 0))

        after_stock = await normalize_stock(item_doc, u.physical_stock)
        computed = _compute_stock_update_values(existing, after_stock)

        bulk_updates.append(
            UpdateOne(
                {"itemCode": u.itemCode, "locationId": u.locationId},
                {
                    "$set": {
                        "itemType": item_type,
                        "systemStock": computed["systemStock"],
                        "physicalStock": computed["physicalStock"],
                        "previousSystemStock": computed["previousSystemStock"],
                        "systemStockSo": prev_so,
                        "physicalStockSo": prev_physical_so,
                        "variance": computed["currentVariance"],
                        "adjustmentQty": computed["adjustmentQty"],
                        "isInitialStock": computed["isInitialStock"],
                        "status": status,
                        "updatedAt": now,
                        "lastUpdatedBy": updated_by,
                        "tenantId": payload.tenant_id or "",
                        "idempotencyKey": payload.idempotency_key or "",
                    },
                    "$setOnInsert": {
                        "createdAt": now,
                        "itemCode": u.itemCode,
                        "locationId": u.locationId,
                        "createdBy": updated_by,
                    },
                },
                upsert=True,
            )
        )

        history_docs.append(
            {
                "itemCode": u.itemCode,
                "locationId": u.locationId,
                "itemType": item_type,
                "beforeStock": computed["historyBeforeStock"],
                "afterStock": computed["historyAfterStock"],
                "variance": computed["historyVariance"],
                "adjustmentQty": computed["adjustmentQty"],
                "isInitialStock": computed["isInitialStock"],
                "status": status,
                "action": "MANUAL_UPDATE",
                "updatedBy": updated_by,
                "description": description,
                "updatedAt": now,
                "tenantId": payload.tenant_id or "",
                "idempotencyKey": payload.idempotency_key or "",
            }
        )

        response_rows.append(
            {
                "itemCode": u.itemCode,
                "locationId": u.locationId,
                "previousSystemStock": computed["previousSystemStock"],
                "updatedSystemStock": computed["systemStock"],
                "variance": computed["currentVariance"],
                "adjustmentQty": computed["adjustmentQty"],
                "isInitialStock": computed["isInitialStock"],
                "status": status,
                "updatedAt": now,
            }
        )

    await asyncio.gather(
        (
            inventorytest_stock_collection().bulk_write(bulk_updates, ordered=False)
            if bulk_updates
            else asyncio.sleep(0)
        ),
        (
            stock_history_collection().insert_many(history_docs, ordered=False)
            if history_docs
            else asyncio.sleep(0)
        ),
    )

    return {
        "updated": len(bulk_updates),
        "data": response_rows,
    }




@router.get("/exportstock-csv")
async def export_items_csv(
    branch: str = Query(...),
    category: Optional[str] = Query(None),
    subCategory: Optional[str] = Query(None),
    itemName: Optional[str] = Query(None),
    varianceName: Optional[str] = Query(None),
):
    try:
        filters = {
            "status": {"$in": ["active", "Active"]},
            **_build_filter_query(
                category=category,
                sub_category=subCategory,
                item_name=itemName,
                variance_name=varianceName,
            ),
        }

        category_map, subcategory_map, stock_docs = await asyncio.gather(
            get_category_map(),
            get_subcategory_map(),
            inventorytest_stock_collection()
            .find(
                {"locationId": branch},
                {
                    "itemCode": 1,
                    "systemStock": 1,
                    "physicalStock": 1,
                    "variance": 1,
                    "status": 1,
                    "updatedAt": 1,
                },
            )
            .to_list(None),
        )

        stock_map = {s["itemCode"]: s for s in stock_docs if s.get("itemCode")}
        raw_items = await _master().find(filters).to_list(None)

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(
            [
                "S.No",
                "ItemCode",
                "Category",
                "SubCategory",
                "ItemName",
                "VarianceName",
                "SystemStock",
                "PhysicalStock",
            ]
        )

        for idx, raw in enumerate(raw_items, 1):
            item_code = raw.get("itemCode")
            stock = stock_map.get(item_code, {})
            system_raw = stock.get("systemStock", 0)
            system_stk = await format_stock_for_response(raw, system_raw)

            writer.writerow(
                [
                    idx,
                    item_code,
                    category_map.get(raw.get("category"), ""),
                    subcategory_map.get(raw.get("subCategory"), ""),
                    raw.get("itemName", ""),
                    raw.get("varianceName", ""),
                    system_stk,
                    system_stk,
                ]
            )

        output.seek(0)

        filename = f"{branch}_OutletStock_{datetime.utcnow():%d-%m-%Y}.csv"

        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV export failed: {e}")





@router.post("/importstock")
async def import_stock_file(
    locationId: str,
    file: UploadFile,
    status: str = Query("approved"),
    updated_by: Optional[str] = Query("Inventory"),
    description: str = Query(""),
):
    try:
        content = await file.read()
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
        rows = list(reader)

        if not rows:
            raise HTTPException(status_code=400, detail="Empty or invalid CSV file")

        now = ist_now()

        csv_map: Dict[str, float] = {}
        duplicate_items: set = set()

        for idx, row in enumerate(rows, 1):
            norm = {str(k).strip().lower(): v for k, v in row.items() if k is not None}
            ic = str(norm.get("itemcode", "")).strip()

            if not ic:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing itemCode in row {idx}",
                )

            if ic in csv_map:
                duplicate_items.add(ic)

            try:
                stock_val = float(norm.get("physicalstock", 0))
                if stock_val < 0:
                    raise ValueError(f"Negative stock: {stock_val}")

                csv_map[ic] = stock_val

            except (ValueError, TypeError) as e:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Invalid physicalStock '{norm.get('physicalstock')}' "
                        f"in row {idx}: {e}"
                    ),
                )

        if duplicate_items:
            logger.warning(f"Warning: Duplicate itemCodes in CSV: {duplicate_items}")

        item_codes = list(csv_map.keys())

        master_docs, existing_docs = await asyncio.gather(
            _master()
            .find(
                {
                    "itemCode": {"$in": item_codes},
                    "status": {"$in": ["active", "Active"]},
                },
            )
            .to_list(None),
            inventorytest_stock_collection()
            .find(
                {"locationId": locationId, "itemCode": {"$in": item_codes}},
                {
                    "itemCode": 1,
                    "systemStock": 1,
                    "systemStockSo": 1,
                    "physicalStockSo": 1,
                },
            )
            .to_list(None),
        )

        master_map: Dict[str, Any] = {d["itemCode"]: d for d in master_docs}
        existing_map: Dict[str, Any] = {d["itemCode"]: d for d in existing_docs}

        missing = set(item_codes) - set(master_map.keys())

        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"ItemCodes not found in master: {sorted(missing)}",
            )

        bulk_updates = []
        history_docs = []
        processed_items = set()

        for ic, raw_stock in csv_map.items():
            if ic in processed_items:
                continue

            processed_items.add(ic)

            item_doc = master_map[ic]
            item_type = item_doc.get("itemType", "UNKNOWN")
            existing = existing_map.get(ic)

            sys_stock_so = safe_float((existing or {}).get("systemStockSo", 0))
            phys_stock_so = safe_float((existing or {}).get("physicalStockSo", 0))

            after_stock = await normalize_stock(item_doc, raw_stock)
            computed = _compute_stock_update_values(existing, after_stock)

            bulk_updates.append(
                UpdateOne(
                    {"itemCode": ic, "locationId": locationId},
                    {
                        "$set": {
                            "itemType": item_type,
                            "systemStock": computed["systemStock"],
                            "physicalStock": computed["physicalStock"],
                            "previousSystemStock": computed["previousSystemStock"],
                            "systemStockSo": sys_stock_so,
                            "physicalStockSo": phys_stock_so,
                            "variance": computed["currentVariance"],
                            "adjustmentQty": computed["adjustmentQty"],
                            "isInitialStock": computed["isInitialStock"],
                            "status": status,
                            "updatedAt": now,
                            "lastUpdatedBy": updated_by,
                        },
                        "$setOnInsert": {
                            "createdAt": now,
                            "itemCode": ic,
                            "locationId": locationId,
                            "createdBy": updated_by,
                        },
                    },
                    upsert=True,
                )
            )

            history_docs.append(
                {
                    "itemCode": ic,
                    "locationId": locationId,
                    "itemType": item_type,
                    "beforeStock": computed["historyBeforeStock"],
                    "afterStock": computed["historyAfterStock"],
                    "variance": computed["historyVariance"],
                    "adjustmentQty": computed["adjustmentQty"],
                    "isInitialStock": computed["isInitialStock"],
                    "status": status,
                    "action": "CSV_IMPORT",
                    "updatedBy": updated_by,
                    "description": f"CSV Import ({file.filename}) - {description}",
                    "importedAt": now,
                    "updatedAt": now,
                }
            )

        await asyncio.gather(
            (
                inventorytest_stock_collection().bulk_write(bulk_updates, ordered=False)
                if bulk_updates
                else asyncio.sleep(0)
            ),
            (
                stock_history_collection().insert_many(history_docs, ordered=False)
                if history_docs
                else asyncio.sleep(0)
            ),
        )

        return {
            "message": "Stock import completed",
            "locationId": locationId,
            "file": file.filename,
            "total_rows_in_csv": len(rows),
            "unique_items_processed": len(processed_items),
            "duplicates_found_in_csv": len(duplicate_items),
            "updated_items": len(bulk_updates),
            "imported_at": now.isoformat(),
            "warnings": (
                [f"Duplicate itemCodes ignored: {sorted(duplicate_items)}"]
                if duplicate_items
                else None
            ),
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk import failed: {e}")



@router.get("/locations", response_model=List[branchResponse])
async def get_locations(
    page: int = Query(1, ge=1),
    limit: int = Query(30, le=50),
    search: Optional[str] = None,
):
    query = {
        "status": {"$in": ["active", "Active"]},
        "type": "Branch",
    }

    if search and search.strip():
        query.update(mongo_token_query(search, ["branchName"]))

        cursor = (
            location_collection()
            .find(
                query,
                {
                    "_id": 0,
                    "aliasName": 1,
                    "branchName": 1,
                    "locationName": 1,
                    "locationId": 1,
                },
            )
            .sort("warehouseId", 1)
        )
    else:
        cursor = (
            location_collection()
            .find(
                query,
                {
                    "_id": 0,
                    "aliasName": 1,
                    "branchName": 1,
                    "locationName": 1,
                    "locationId": 1,
                },
            )
            .sort("warehouseId", 1)
            .skip((page - 1) * limit)
            .limit(limit)
        )

    return [
        {
            "aliasName": d.get("aliasName"),
            "locationName": d.get("branchName") or d.get("locationName"),
            "locationId": d.get("locationId"),
        }
        async for d in cursor
    ]


@router.get("/locations/all", response_model=List[locationResponse])
async def get_locations_all(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=50),
    search: Optional[str] = None,
):
    locations = await _get_all_active_locations(
        page=page,
        limit=limit,
        search=search,
        apply_pagination=True,
        include_warehouses=True,
    )

    return [
        {
            "aliasName": loc.get("aliasName"),
            "locationName": loc.get("locationName"),
            "locationId": loc.get("locationId"),
        }
        for loc in locations
    ]



@router.get("/export/sample")
async def export_sample_onhand():
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["ItemCode", "PhysicalStock"])
    writer.writerow(["BMFG0001", "50"])

    output.seek(0)

    filename = f"sample_outletstock_{datetime.utcnow():%Y%m%d_%H%M%S}.csv"

    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )