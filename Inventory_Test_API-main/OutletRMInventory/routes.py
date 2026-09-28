# OutletRMInventory/routes.py
# ─────────────────────────────────────────────────────────────────────────────
# Outlet RAW-MATERIAL (RM) physical stock modification.
#
# Same API contract as OutletInventory (FG), so the outlet screens reuse the
# same slice/components. Same idea as FG too:
#
#   FG :  ItemMaster rows        + outletinventoryStock   (OutletInventory/routes.py)
#   RM :  purchase.rawMaterials  + Branch_wise_stock      (this file)
#
#   * ROWS   come from purchase.rawMaterials (purchaseitem_collection) - every
#            raw material is listed for the selected outlet.
#   * STOCK  comes from yen_inventorytest.Branch_wise_stock, only documents with
#            itemType == "RM", locationId == selected outlet, matched on itemCode.
#            Items with no stock row show 0 (same as FG).
#   * Saving a physical stock updates the existing Branch_wise_stock row, or
#     creates the row (itemType "RM") when the outlet has none yet.
#   * RM has no variance: varianceName options are empty / row value is blank.
#
# FG code is not touched by this module.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pymongo import InsertOne, UpdateOne

from OutletInventory.funtions import _get_all_active_locations
from OutletInventory.models import (
    BranchStockBulkUpdateModel,
    GetItemsResponseModel,
    locationResponse,
)
from OutletInventory.routes import _compute_stock_update_values
from core.compute import calculate_variance, ist_now, safe_float
from core.search import matches_search
from db.collections import (
    location_collection,
    outlet_rm_stock_collection,
    outlet_rm_stock_history_collection,
    purchaseitem_collection,
)

logger = logging.getLogger(__name__)
router = APIRouter()

RM_TYPES = ["RM", "rm", "Rm"]
CATEGORY_FIELD = "purchasecategoryName"
SUBCATEGORY_FIELD = "purchasesubcategoryName"


# ─────────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────────
def _csv_list(value: Optional[str]) -> List[str]:
    return [v.strip() for v in (value or "").split(",") if v and v.strip()]


def _qty(value: Any) -> float:
    return round(safe_float(value), 3)


def _blank() -> Dict[str, Any]:
    return {"id": None, "name": None}


def _code_variants(codes: List[str]) -> List[Any]:
    """itemCode is a string in Branch_wise_stock; accept a numeric copy too."""
    out: List[Any] = []
    for c in codes:
        out.append(c)
        if isinstance(c, str) and c.isdigit():
            out.append(int(c))
    return out


def _stock_filter(branch: str, item_codes: Optional[List[str]] = None) -> Dict[str, Any]:
    query: Dict[str, Any] = {
        "itemType": {"$in": RM_TYPES},
        "locationId": branch,
    }
    if item_codes is not None:
        query["itemCode"] = {"$in": _code_variants(item_codes)}
    return query


def _master_filter(
    category: Optional[str],
    sub_category: Optional[str],
    item_codes: Optional[str],
    exclude: Optional[str] = None,
) -> Dict[str, Any]:
    """purchase.rawMaterials filter. `exclude` = leave one filter out (cascade dropdowns)."""
    conds: List[Dict[str, Any]] = [{"itemCode": {"$exists": True, "$nin": [None, ""]}}]

    if exclude != "category" and (cats := _csv_list(category)):
        conds.append({CATEGORY_FIELD: {"$in": cats}})
    if exclude != "subCategory" and (subs := _csv_list(sub_category)):
        conds.append({SUBCATEGORY_FIELD: {"$in": subs}})
    if exclude != "itemName" and (codes := _csv_list(item_codes)):
        conds.append({"itemCode": {"$in": _code_variants(codes)}})

    return {"$and": conds}


def _empty_options(page: int, limit: int) -> Dict[str, Any]:
    return {
        "values": [],
        "total": 0,
        "page": page,
        "limit": limit,
        "count": 0,
        "searchFilter": "",
        "hasMore": False,
    }


def _page_options(
    values: List[Dict[str, str]], page: int, limit: int, search: Optional[str]
) -> Dict[str, Any]:
    search_text = (search or "").strip()
    if search_text:  # search returns the full match list (same as FG dropdowns)
        values = [v for v in values if matches_search(search_text, v["name"], v["id"])]

    values.sort(key=lambda v: v["name"].lower())
    total = len(values)

    if search_text:
        return {
            "values": values,
            "total": total,
            "page": 1,
            "limit": total,
            "count": total,
            "searchFilter": search_text,
            "hasMore": False,
        }

    start = (page - 1) * limit
    paginated = values[start : start + limit]
    return {
        "values": paginated,
        "total": total,
        "page": page,
        "limit": limit,
        "count": len(paginated),
        "searchFilter": "",
        "hasMore": total > start + limit,
    }


async def _text_options(
    db_field: str, filter_query: Dict[str, Any], page: int, limit: int, search: Optional[str]
) -> Dict[str, Any]:
    raw = await purchaseitem_collection().distinct(db_field, filter_query)
    seen: set = set()
    values: List[Dict[str, str]] = []
    for v in raw:
        text = " ".join(str(v or "").split())
        if not text or text.lower() == "null" or text.lower() in seen:
            continue
        seen.add(text.lower())
        values.append({"id": str(v).strip(), "name": text})
    return _page_options(values, page, limit, search)


async def _item_options(
    filter_query: Dict[str, Any], page: int, limit: int, search: Optional[str]
) -> Dict[str, Any]:
    docs = await (
        purchaseitem_collection()
        .find(filter_query, {"itemCode": 1, "itemName": 1})
        .to_list(None)
    )
    seen: set = set()
    values: List[Dict[str, str]] = []
    for d in docs:
        code = str(d.get("itemCode") or "").strip()
        name = " ".join(str(d.get("itemName") or "").split())
        if not code or code in seen:
            continue
        seen.add(code)
        values.append({"id": code, "name": name or code})
    return _page_options(values, page, limit, search)


async def _branch_name(location_id: str) -> str:
    loc = await location_collection().find_one(
        {"locationId": location_id}, {"branchName": 1, "aliasName": 1, "locationName": 1}
    )
    loc = loc or {}
    return loc.get("branchName") or loc.get("locationName") or loc.get("aliasName") or ""


def _new_stock_doc(
    item_code: str,
    location_id: str,
    branch_name: str,
    master: Dict[str, Any],
    computed: Dict[str, Any],
    status: str,
    now: datetime,
    updated_by: Optional[str],
    tenant_id: Optional[str],
    idempotency_key: Optional[str],
) -> Dict[str, Any]:
    """Same shape as the Branch_wise_stock RM documents that already exist."""
    return {
        "itemCode": item_code,
        "locationId": location_id,
        "branchName": branch_name,
        "itemName": master.get("itemName") or "",
        "uom": master.get("uom") or "",
        "randomId": "SEC" + uuid.uuid4().hex[:8].upper(),
        "itemType": "RM",
        "systemStock": computed["systemStock"],
        "physicalStock": computed["physicalStock"],
        "previousSystemStock": computed["previousSystemStock"],
        "systemStockSo": 0,
        "physicalStockSo": 0,
        "variance": computed["currentVariance"],
        "adjustmentQty": computed["adjustmentQty"],
        "isInitialStock": computed["isInitialStock"],
        "status": status,
        "createdAt": now,
        "createdBy": updated_by,
        "updatedAt": now,
        "lastUpdatedDate": now,
        "lastUpdatedBy": updated_by,
        "lastUpdateBy": updated_by,
        "tenantId": tenant_id or "",
        "idempotencyKey": idempotency_key or "",
    }


def _stock_set(
    existing: Dict[str, Any],
    computed: Dict[str, Any],
    status: str,
    now: datetime,
    updated_by: Optional[str],
    tenant_id: Optional[str],
    idempotency_key: Optional[str],
) -> Dict[str, Any]:
    return {
        "systemStock": computed["systemStock"],
        "physicalStock": computed["physicalStock"],
        "previousSystemStock": computed["previousSystemStock"],
        "systemStockSo": safe_float(existing.get("systemStockSo", 0)),
        "physicalStockSo": safe_float(existing.get("physicalStockSo", 0)),
        "variance": computed["currentVariance"],
        "adjustmentQty": computed["adjustmentQty"],
        "isInitialStock": computed["isInitialStock"],
        "status": status,
        "updatedAt": now,
        "lastUpdatedDate": now,
        "lastUpdatedBy": updated_by,
        "tenantId": tenant_id or "",
        "idempotencyKey": idempotency_key or "",
    }


def _history_doc(
    item_code: str,
    location_id: str,
    computed: Dict[str, Any],
    status: str,
    now: datetime,
    updated_by: Optional[str],
    description: str,
    tenant_id: Optional[str],
    idempotency_key: Optional[str],
) -> Dict[str, Any]:
    return {
        "itemCode": item_code,
        "locationId": location_id,
        "itemType": "RM",
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


# ─────────────────────────────────────────────────────────────────────────────
# list
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/", response_model=GetItemsResponseModel)
async def get_items(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    branch: str = Query(...),
    category: Optional[str] = Query(None),
    subCategory: Optional[str] = Query(None),
    itemName: Optional[str] = Query(None),
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
    query_date: Optional[date] = Query(None, alias="date"),
):
    response: Dict[str, Any] = {}
    master = purchaseitem_collection()

    fetch_items = not only_filter_options and not (include_filter_options and page > 1)

    if fetch_items:
        query = _master_filter(category, subCategory, itemName)
        skip = (page - 1) * limit

        total, raw_items = await asyncio.gather(
            master.count_documents(query),
            master.find(query).sort("_id", 1).skip(skip).limit(limit).to_list(length=limit),
        )

        codes = [str(r.get("itemCode")).strip() for r in raw_items if r.get("itemCode")]
        stock_docs = (
            await outlet_rm_stock_collection()
            .find(_stock_filter(branch, codes))
            .sort([("updatedAt", -1), ("_id", -1)])
            .to_list(None)
            if codes
            else []
        )
        stock_map: Dict[str, Dict[str, Any]] = {}
        for s in stock_docs:  # newest first -> keep the first one per item
            stock_map.setdefault(str(s.get("itemCode")).strip(), s)

        items = []
        for raw in raw_items:
            code = str(raw.get("itemCode") or "").strip()
            if not code:
                continue

            stock = stock_map.get(code, {})
            system_stock = _qty(stock.get("systemStock"))
            physical_stock = _qty(stock.get("physicalStock"))
            uom = raw.get("uom") or stock.get("uom")

            items.append(
                {
                    "id": str(raw["_id"]),
                    "itemCode": code,
                    "category": {
                        "id": raw.get(CATEGORY_FIELD),
                        "name": (raw.get(CATEGORY_FIELD) or "").upper() or None,
                    },
                    "subCategory": {
                        "id": raw.get(SUBCATEGORY_FIELD),
                        "name": (raw.get(SUBCATEGORY_FIELD) or "").upper() or None,
                    },
                    "itemName": {"id": code, "name": raw.get("itemName") or stock.get("itemName")},
                    "varianceName": _blank(),
                    "uom": {"id": uom, "name": uom},
                    "systemStock": system_stock,
                    "systemStockSo": _qty(stock.get("systemStockSo")),
                    "physicalStock": physical_stock,
                    "previousSystemStock": _qty(stock.get("previousSystemStock")),
                    "variance": calculate_variance(system_stock, physical_stock),
                    "status": stock.get("status") or "approved",
                    "updatedAt": stock.get("updatedAt") or datetime.utcnow(),
                }
            )

        response["filteredItems"] = {
            "total": total,
            "page": page,
            "limit": limit,
            "count": len(items),
            "items": items,
            "message": f"RM items retrieved for {query_date or datetime.utcnow().date()}",
        }

    if include_filter_options:
        cat_q = _master_filter(category, subCategory, itemName, exclude="category")
        sub_q = _master_filter(category, subCategory, itemName, exclude="subCategory")
        item_q = _master_filter(category, subCategory, itemName, exclude="itemName")

        categories, sub_categories, item_names = await asyncio.gather(
            _text_options(CATEGORY_FIELD, cat_q, categoryPage, categoryLimit, categorySearch),
            _text_options(
                SUBCATEGORY_FIELD, sub_q, subCategoryPage, subCategoryLimit, subCategorySearch
            ),
            _item_options(item_q, itemNamePage, itemNameLimit, itemNameSearch),
        )
        response["filterOptions"] = {
            "category": categories,
            "subCategory": sub_categories,
            "itemName": item_names,
            "varianceName": _empty_options(1, 20),
        }

    return response


# ─────────────────────────────────────────────────────────────────────────────
# update (single)
# ─────────────────────────────────────────────────────────────────────────────
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
    col = outlet_rm_stock_collection()

    master, existing = await asyncio.gather(
        purchaseitem_collection().find_one(
            {"itemCode": {"$in": _code_variants([itemCode])}}, {"itemName": 1, "uom": 1}
        ),
        col.find_one(
            {
                "itemType": {"$in": RM_TYPES},
                "locationId": locationId,
                "itemCode": {"$in": _code_variants([itemCode])},
            }
        ),
    )
    if not master:
        raise HTTPException(status_code=404, detail="Item not found in raw materials")

    computed = _compute_stock_update_values(existing, _qty(physical_stock))

    if existing:
        write = col.update_one(
            {"_id": existing["_id"]},
            {
                "$set": _stock_set(
                    existing, computed, status, now, updated_by, tenant_id, idempotency_key
                )
            },
        )
    else:  # outlet has no stock row for this raw material yet -> create it
        write = col.insert_one(
            _new_stock_doc(
                itemCode,
                locationId,
                await _branch_name(locationId),
                master,
                computed,
                status,
                now,
                updated_by,
                tenant_id,
                idempotency_key,
            )
        )

    await asyncio.gather(
        write,
        outlet_rm_stock_history_collection().insert_one(
            _history_doc(
                itemCode, locationId, computed, status, now, updated_by,
                description, tenant_id, idempotency_key,
            )
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


# ─────────────────────────────────────────────────────────────────────────────
# update (bulk)
# ─────────────────────────────────────────────────────────────────────────────
@router.patch("/update-stock/bulk")
async def update_branch_stock_bulk(
    payload: BranchStockBulkUpdateModel,
    status: str = Query("approved"),
    updated_by: str = Query("Inventory"),
    description: str = Query(""),
):
    now = ist_now()
    if not payload.updates:
        return {"updated": 0, "skipped": [], "data": []}

    col = outlet_rm_stock_collection()
    codes = list({u.itemCode for u in payload.updates})
    location_ids = list({u.locationId for u in payload.updates})

    pair_filters = [
        {"itemCode": {"$in": _code_variants([u.itemCode])}, "locationId": u.locationId}
        for u in payload.updates
    ]

    masters, existing_list, locations = await asyncio.gather(
        purchaseitem_collection()
        .find({"itemCode": {"$in": _code_variants(codes)}}, {"itemCode": 1, "itemName": 1, "uom": 1})
        .to_list(None),
        col.find({"itemType": {"$in": RM_TYPES}, "$or": pair_filters}).to_list(None),
        location_collection()
        .find({"locationId": {"$in": location_ids}}, {"locationId": 1, "branchName": 1, "locationName": 1, "aliasName": 1})
        .to_list(None),
    )

    master_map = {str(m["itemCode"]).strip(): m for m in masters}
    existing_map = {(str(e["itemCode"]).strip(), e["locationId"]): e for e in existing_list}
    branch_names = {
        loc["locationId"]: loc.get("branchName") or loc.get("locationName") or loc.get("aliasName") or ""
        for loc in locations
    }

    ops: List[Any] = []
    history_docs: List[Dict[str, Any]] = []
    rows: List[Dict[str, Any]] = []
    skipped: List[str] = []

    for u in payload.updates:
        master = master_map.get(str(u.itemCode).strip())
        if not master:
            skipped.append(u.itemCode)
            continue

        existing = existing_map.get((str(u.itemCode).strip(), u.locationId))
        computed = _compute_stock_update_values(existing, _qty(u.physical_stock))

        if existing:
            ops.append(
                UpdateOne(
                    {"_id": existing["_id"]},
                    {
                        "$set": _stock_set(
                            existing, computed, status, now, updated_by,
                            payload.tenant_id, payload.idempotency_key,
                        )
                    },
                )
            )
        else:
            ops.append(
                InsertOne(
                    _new_stock_doc(
                        u.itemCode, u.locationId, branch_names.get(u.locationId, ""),
                        master, computed, status, now, updated_by,
                        payload.tenant_id, payload.idempotency_key,
                    )
                )
            )

        history_docs.append(
            _history_doc(
                u.itemCode, u.locationId, computed, status, now, updated_by,
                description, payload.tenant_id, payload.idempotency_key,
            )
        )
        rows.append(
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

    if ops:
        await asyncio.gather(
            col.bulk_write(ops, ordered=False),
            outlet_rm_stock_history_collection().insert_many(history_docs, ordered=False),
        )

    return {"updated": len(ops), "skipped": skipped, "data": rows}


# ─────────────────────────────────────────────────────────────────────────────
# outlets dropdown (same list as FG)
# ─────────────────────────────────────────────────────────────────────────────
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