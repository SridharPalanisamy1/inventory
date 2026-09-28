import csv
from datetime import datetime
import io
import json
import math
from typing import Optional, List, Dict, Any
from core.search import mongo_token_query
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, File, UploadFile
from fastapi.responses import StreamingResponse
from pymongo import UpdateOne

from OutletInventory.funtions import ist_now
from db.collections import (
    purchaseitem_collection,
    get_stock_updates_collection,
    inventory_stock_collection,
    warehouse_collection,
    purchase_uom_collection,
)
from WarehouseInventory.funtions import get_filter_options
from WarehouseInventoryVariance.funtions import round3
from core.lookups import parse_display_name
from .models import (
    RawMaterialResponse,
    SearchResponse,
    StockBulkUpdateModel,
    StockResponseModel,
    StockUpdateModel,
    WarehouseResponse,
)

router = APIRouter()


# ==================== UOM PRECISION HELPER ====================


async def get_uom_precision_map() -> Dict[str, int]:
    cursor = purchase_uom_collection().find({}, {"uom": 1, "precisionValue": 1})
    docs = await cursor.to_list(None)

    uom_map: Dict[str, int] = {}

    for doc in docs:
        uom_name = doc.get("uom")
        prec_val = doc.get("precisionValue", "1")

        precision_int = 0

        if isinstance(prec_val, (int, float)):
            if prec_val == 0:
                precision_int = 0
            else:
                precision_int = int(round(-math.log10(abs(prec_val))))

        elif isinstance(prec_val, str):
            try:
                float_val = float(prec_val)
                if float_val == 0:
                    precision_int = 0
                else:
                    precision_int = int(round(-math.log10(abs(float_val))))
            except Exception:
                if "." in prec_val:
                    precision_int = len(prec_val.split(".")[1])
                else:
                    precision_int = 0

        if uom_name:
            uom_map[str(uom_name)] = precision_int

    return uom_map


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return float(default)

        if isinstance(value, str):
            value = value.replace(",", "").strip()
            if value == "":
                return float(default)

        num = float(value)

        if math.isnan(num) or math.isinf(num):
            return float(default)

        return num
    except Exception:
        return float(default)


def parse_import_stock_value(value: Any, row_label: str = "") -> float:
 
    if value is None:
        raise ValueError(f"{row_label} PhysicalStock is required".strip())

    raw = str(value).replace(",", "").strip()

    if raw == "":
        raise ValueError(f"{row_label} PhysicalStock is empty".strip())

    try:
        num = float(raw)
    except Exception:
        raise ValueError(f"{row_label} PhysicalStock must be numeric".strip())

    if math.isnan(num) or math.isinf(num):
        raise ValueError(f"{row_label} PhysicalStock must be a valid number".strip())

    if num < 0:
        raise ValueError(f"{row_label} PhysicalStock cannot be negative".strip())

    return num


def round_by_precision(value: Any, precision: int) -> float:
    try:
        return round(safe_float(value), precision)
    except Exception:
        return 0.0


def calculate_variance(system_stock: float, physical_stock: float) -> float:
    """
    Main inventory variance.
    Always means physicalStock - systemStock.
    """
    return round3(safe_float(physical_stock) - safe_float(system_stock))


def calculate_history_variance(
    before_stock: float, after_stock: float, precision: int
) -> float:
  
    return round_by_precision(
        safe_float(after_stock) - safe_float(before_stock), precision
    )

def is_duplicate_stock(doc: Optional[dict], incoming: float) -> bool:
    if not doc:
        return False

    current = safe_float(doc.get("systemStock", 0))
    return current == safe_float(incoming)

def inventory_variance_for_equal_stock(stock: float, precision: int) -> float:
    stock = round_by_precision(stock, precision)
    return round_by_precision(calculate_variance(stock, stock), precision)


def compute_inventory_stock_update(
    existing_stock: Optional[Dict[str, Any]],
    new_stock: float,
    precision: int,
) -> Dict[str, Any]:

    normalized_new_stock = round_by_precision(new_stock, precision)
    has_existing_stock = bool(existing_stock)

    if has_existing_stock:
        old_stock = round_by_precision(existing_stock.get("systemStock", 0), precision)

        previous_system_stock = old_stock
        history_before_stock = old_stock
        history_after_stock = normalized_new_stock
        history_variance = calculate_history_variance(
            old_stock, normalized_new_stock, precision
        )
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
        "inventoryVariance": inventory_variance_for_equal_stock(
            normalized_new_stock, precision
        ),
        "historyBeforeStock": history_before_stock,
        "historyAfterStock": history_after_stock,
        "historyVariance": history_variance,
        "adjustmentQty": adjustment_qty,
        "isInitialStock": is_initial_stock,
    }


def to_list(value: Optional[str]) -> List[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]




@router.post("/inventory", response_model=StockResponseModel)
async def create_inventory_stock(
    payload: StockUpdateModel,
    updated_by: str = Query("System"),
    description: str = Query(""),
    status: str = Query("pending", description="Stock status - default: pending"),
):
    purchase = purchaseitem_collection()
    inventory = inventory_stock_collection()
    history = get_stock_updates_collection()

    item = await purchase.find_one({"randomId": payload.randomId})
    if not item:
        raise HTTPException(404, "Item not found in purchase")

    uom_map = await get_uom_precision_map()
    precision = uom_map.get(item.get("uom", ""), 0)

    now = ist_now()
    incoming_stock = round_by_precision(payload.physicalStock, precision)

    doc = await inventory.find_one(
        {
            "randomId": payload.randomId,
            "locationId": payload.warehouseId,
        }
    )

    if is_duplicate_stock(doc, incoming_stock):
        raise HTTPException(409, "Same stock already exists")

    computed = compute_inventory_stock_update(doc, incoming_stock, precision)

    if doc:
        update_data = {
            "previousSystemStock": computed["previousSystemStock"],
            "systemStock": computed["systemStock"],
            "physicalStock": computed["physicalStock"],
            "variance": computed["inventoryVariance"],
            "adjustmentQty": computed["adjustmentQty"],
            "isInitialStock": computed["isInitialStock"],
            "status": status,
            "updatedAt": now,
            "lastUpdatedBy": updated_by,
            "tenantId": payload.tenant_id or "",
            "idempotencyKey": payload.idempotency_key or "",
        }

        await inventory.update_one(
            {"_id": doc["_id"]},
            {"$set": update_data},
        )

        response_doc = {
            **doc,
            **update_data,
            "randomId": payload.randomId,
            "locationId": payload.warehouseId,
        }

        action = "MANUAL_UPDATE"

    else:
        response_doc = {
            "randomId": payload.randomId,
            "locationId": payload.warehouseId,
            "itemType": item.get("itemType", ""),
            "systemStock": computed["systemStock"],
            "physicalStock": computed["physicalStock"],
            "systemStockSo": 0,
            "physicalStockSo": 0,
            "previousSystemStock": computed["previousSystemStock"],
            "variance": computed["inventoryVariance"],
            "adjustmentQty": computed["adjustmentQty"],
            "isInitialStock": computed["isInitialStock"],
            "status": status,
            "createdAt": now,
            "updatedAt": now,
            "createdBy": updated_by,
            "lastUpdatedBy": updated_by,
            "tenantId": payload.tenant_id or "",
            "idempotencyKey": payload.idempotency_key or "",
        }

        await inventory.insert_one(response_doc.copy())
        action = "POST_CREATE"

    await history.insert_one(
        {
            "randomId": payload.randomId,
            "locationId": payload.warehouseId,
            "itemType": item.get("itemType", ""),
            "beforeStock": computed["historyBeforeStock"],
            "afterStock": computed["historyAfterStock"],
            "variance": computed["historyVariance"],
            "adjustmentQty": computed["adjustmentQty"],
            "isInitialStock": computed["isInitialStock"],
            "status": status,
            "updatedAt": now,
            "action": action,
            "updatedBy": updated_by,
            "description": description,
            "tenantId": payload.tenant_id or "",
            "idempotencyKey": payload.idempotency_key or "",
        }
    )

    response_doc.pop("_id", None)
    return StockResponseModel(**response_doc)


# ==================== WAREHOUSE DROPDOWN ====================


@router.get("/warehouses", response_model=List[WarehouseResponse])
async def get_item_names(
    page: int = Query(1, ge=1),
    limit: int = Query(30, le=50),
    search: Optional[str] = None,
):
    collection = warehouse_collection()

    query = {"status": 1,"type": {"$in": ["Main", "main"]}}
    if search and search.strip():
        query.update(mongo_token_query(search, ["warehouseName"]))

    cursor = (
        collection.find(
            query,
            {
                "_id": 0,
                "aliasName": 1,
                "warehouseName": 1,
                "warehouseId": 1,
                "locationName": 1,
                "locationId": 1,
            },
        )
        .sort("warehouseId", 1)
        .skip((page - 1) * limit)
        .limit(limit)
    )

    items = []
    async for doc in cursor:
        items.append(
            {
                "aliasName": doc.get("aliasName", ""),
                "locationName": doc.get("warehouseName") or doc.get("locationName", ""),
                "locationId": doc.get("warehouseId") or doc.get("locationId", ""),
            }
        )

    return items


# ==================== SEARCH RAW MATERIALS ====================


@router.get("/", response_model=SearchResponse)
async def search_raw_materials(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    locationId: str = Query(...),
    purchasecategoryName: Optional[str] = None,
    purchasesubcategoryName: Optional[str] = None,
    itemName: Optional[str] = None,
    varianceName: Optional[str] = None,
    category_page: int = Query(1, alias="categoryPage"),
    category_limit: int = Query(10, alias="categoryLimit"),
    category_search: Optional[str] = Query(None, alias="categorySearch"),
    subcategory_page: int = Query(1, alias="subCategoryPage"),
    subcategory_limit: int = Query(10, alias="subCategoryLimit"),
    subcategory_search: Optional[str] = Query(None, alias="subCategorySearch"),
    item_page: int = Query(1, alias="itemNamePage"),
    item_limit: int = Query(10, alias="itemNameLimit"),
    item_search: Optional[str] = Query(None, alias="itemNameSearch"),
    variance_page: int = Query(1, alias="varianceNamePage"),
    variance_limit: int = Query(10, alias="varianceNameLimit"),
    variance_search: Optional[str] = Query(None, alias="varianceNameSearch"),
    includeDropdowns: bool = Query(True),
):  
    
    purchase = purchaseitem_collection()
    inventory = inventory_stock_collection()

    try:
        uom_precision_map = await get_uom_precision_map()

        and_conditions = []

        if cats := to_list(purchasecategoryName):
            and_conditions.append({"purchasecategoryName": {"$in": cats}})

        if subs := to_list(purchasesubcategoryName):
            and_conditions.append({"purchasesubcategoryName": {"$in": subs}})

        if items := to_list(itemName):
            and_conditions.append({"itemgroupName": {"$in": items}})

        if vars_ := to_list(varianceName):
            parsed_vars = [parse_display_name(v) for v in vars_]
            and_conditions.append({"itemName": {"$in": parsed_vars}})

        grid_query = {"$and": and_conditions} if and_conditions else {}

        total = await purchase.count_documents(grid_query)

        paginated = (
            await purchase.find(
                grid_query,
                {
                    "_id": 1,
                    "randomId": 1,
                    "purchasecategoryName": 1,
                    "purchasesubcategoryName": 1,
                    "itemgroupName": 1,
                    "itemName": 1,
                    "itemCode": 1,
                    "itemType": 1,
                    "uom": 1,
                },
            )
            .sort("_id", 1)
            .skip((page - 1) * limit)
            .limit(limit)
            .to_list(length=limit)
        )

        random_ids = [d["randomId"] for d in paginated if d.get("randomId")]

        inv_docs = await (
            inventory.find(
                {
                    "locationId": locationId,
                    "randomId": {"$in": random_ids},
                },
                {
                    "randomId": 1,
                    "systemStock": 1,
                    "previousSystemStock": 1,
                    "physicalStock": 1,
                    "systemStockSo": 1,
                    "variance": 1,
                    "adjustmentQty": 1,
                    "isInitialStock": 1,
                    "status": 1,
                    "updatedAt": 1,
                },
            )
            .sort([("updatedAt", -1), ("_id", -1)])
            .to_list(length=None)
        )

        inv_map = {}

        for doc in inv_docs:
            rid = doc.get("randomId")

            if rid not in inv_map:
                inv_map[rid] = doc

        results = []

        for d in paginated:
            rid = d.get("randomId")
            inv = inv_map.get(rid)

            uom_name = d.get("uom", "")
            precision = uom_precision_map.get(uom_name, 0)

            system_stock = (
                round_by_precision(inv.get("systemStock", 0), precision) if inv else 0.0
            )
            physical_stock = (
                round_by_precision(inv.get("physicalStock", 0), precision)
                if inv
                else 0.0
            )

            # Display variance must always be physicalStock - systemStock.
            # Do not trust old stored movement variance.
            variance = round_by_precision(
                calculate_variance(system_stock, physical_stock),
                precision,
            )

            system_stock_so = (
                round_by_precision(inv.get("systemStockSo", 0), precision)
                if inv
                else 0.0
            )
            previous_stock = (
                round_by_precision(inv.get("previousSystemStock", 0), precision)
                if inv
                else 0.0
            )
            status_value = inv.get("status", "pending") if inv else "pending"
            updated_at = (
                inv.get("updatedAt", datetime.utcnow()) if inv else datetime.utcnow()
            )

            results.append(
                RawMaterialResponse(
                    randomId=d.get("randomId"),
                    category=(d.get("purchasecategoryName") or "").upper(),
                    subcategory=(d.get("purchasesubcategoryName") or "").upper(),
                    itemName=(d.get("itemgroupName") or "").upper(),
                    varianceName=(d.get("itemName") or "").upper(),
                    itemCode=d.get("itemCode"),
                    uom=d.get("uom") or "-",
                    systemStockSo=system_stock_so,
                    stockQuantity=system_stock,
                    physicalStock=physical_stock,
                    previousSystemStock=previous_stock,
                    variance=variance,
                    status=status_value,
                    updatedAt=updated_at,
                )
            )

        dropdowns = None

        if includeDropdowns:
            active = {
                "purchasecategoryName": purchasecategoryName or "",
                "purchasesubcategoryName": purchasesubcategoryName or "",
                "itemgroupName": itemName or "",
                "itemName": varianceName or "",
            }   

            dropdowns = {
                "categories": await get_filter_options(
                    purchase,
                    "purchasecategoryName",
                    category_page,
                    category_limit,
                    category_search,
                    purchasecategoryName,
                    active,
                ),
                "subcategories": await get_filter_options(
                    purchase,
                    "purchasesubcategoryName",
                    subcategory_page,
                    subcategory_limit,
                    subcategory_search,
                    purchasesubcategoryName,
                    active,
                ),
                "itemNames": await get_filter_options(
                    purchase,
                    "itemgroupName",
                    item_page,
                    item_limit,
                    item_search,
                    itemName,
                    active,
                ),
                "varianceNames": await get_filter_options(
                    purchase,
                    "itemName",
                    variance_page,
                    variance_limit,
                    variance_search,
                    varianceName,
                    active,
                ),
            }

        return SearchResponse(
            results=results,
            total=total,
            page=page,
            limit=limit,
            dropdown_values=dropdowns,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/inventory", response_model=StockResponseModel)
async def update_inventory_stock(
    payload: StockUpdateModel,
    updated_by: str = Query(""),
    description: str = Query(""),
    status: str = Query("pending", description="Stock status - default: pending"),
):
    purchase = purchaseitem_collection()
    inventory = inventory_stock_collection()
    history = get_stock_updates_collection()

    item = await purchase.find_one({"randomId": payload.randomId})
    if not item:
        raise HTTPException(404, "Item not found in purchase")

    uom_map = await get_uom_precision_map()
    precision = uom_map.get(item.get("uom", ""), 0)

    now = ist_now()
    incoming_stock = round_by_precision(payload.physicalStock, precision)

    # Indentation fix applied here
    doc = await inventory.find_one(
        {
            "randomId": payload.randomId,
            "locationId": payload.warehouseId,
        }
    )

    if not doc:
        raise HTTPException(404, "Inventory stock not found")

    # Removed the is_duplicate_stock 409 error check 
    # so submitting the same value works correctly.

    computed = compute_inventory_stock_update(doc, incoming_stock, precision)

    update_data = {
        "previousSystemStock": computed["previousSystemStock"],
        "systemStock": computed["systemStock"],
        "physicalStock": computed["physicalStock"],
        "variance": computed["inventoryVariance"],
        "adjustmentQty": computed["adjustmentQty"],
        "isInitialStock": computed["isInitialStock"],
        "status": status,
        "updatedAt": now,
        "lastUpdatedBy": updated_by,
        "tenantId": payload.tenant_id or "",
        "idempotencyKey": payload.idempotency_key or "",
    }

    await inventory.update_one(
        {"_id": doc["_id"]},
        {"$set": update_data},
    )

    response_doc = {
        **doc,
        **update_data,
        "randomId": payload.randomId,
        "locationId": payload.warehouseId,
    }

    await history.insert_one(
        {
            "randomId": payload.randomId,
            "locationId": payload.warehouseId,
            "itemType": item.get("itemType", ""),
            "beforeStock": computed["historyBeforeStock"],
            "afterStock": computed["historyAfterStock"],
            "variance": computed["historyVariance"],
            "adjustmentQty": computed["adjustmentQty"],
            "isInitialStock": computed["isInitialStock"],
            "status": status,
            "systemStockSo": doc.get("systemStockSo", 0),
            "physicalStockSo": doc.get("physicalStockSo", 0),
            "updatedAt": now,
            "action": "MANUAL_UPDATE",
            "updatedBy": updated_by,
            "description": description,
            "tenantId": payload.tenant_id or "",
            "idempotencyKey": payload.idempotency_key or "",
        }
    )

    response_doc.pop("_id", None)
    return StockResponseModel(**response_doc)


# ==================== PATCH BULK INVENTORY ====================


@router.patch("/inventory/bulk")
async def update_inventory_stock_bulk(
    payload: StockBulkUpdateModel,
    updated_by: str = Query(""),
    description: str = Query(""),
    status: str = Query("pending", description="Stock status - default: pending"),
):
    inventory = inventory_stock_collection()
    history = get_stock_updates_collection()
    purchase = purchaseitem_collection()

    uom_map = await get_uom_precision_map()
    now = ist_now()

    skipped = 0
    updated = 0
    created = 0

    random_ids = [u.randomId for u in payload.updates]
    warehouse_ids = list({u.warehouseId for u in payload.updates})

    purchase_items = await purchase.find(
        {"randomId": {"$in": random_ids}},
        {"randomId": 1, "uom": 1, "itemType": 1},
    ).to_list(None)

    purchase_map = {p["randomId"]: p for p in purchase_items}

    existing_docs = await inventory.find(
        {
            "randomId": {"$in": random_ids},
            "locationId": {"$in": warehouse_ids},
        }
    ).to_list(None)

    existing_map = {(d.get("randomId"), d.get("locationId")): d for d in existing_docs}

    updates: List[UpdateOne] = []
    history_docs: List[Dict[str, Any]] = []

    for u in payload.updates:
        purchase_item = purchase_map.get(u.randomId)
        if not purchase_item:
            skipped += 1
            continue

        precision = uom_map.get(purchase_item.get("uom", ""), 0)
        incoming = round_by_precision(u.physicalStock, precision)

        # doc = existing_map.get((u.randomId, u.warehouseId))

        # if doc and is_duplicate_stock(doc, incoming):
        #     skipped += 1
        #     continue

        # computed = compute_inventory_stock_update(doc, incoming, precision)
        # replace the part 1 8 1
        doc = existing_map.get((u.randomId, u.warehouseId))

        # Removed the is_duplicate_stock check so same-value 
        # updates are processed normally without being skipped.

        computed = compute_inventory_stock_update(doc, incoming, precision)

        if doc:
            updates.append(
                UpdateOne(
                    {"_id": doc["_id"]},
                    {
                        "$set": {
                            "previousSystemStock": computed["previousSystemStock"],
                            "systemStock": computed["systemStock"],
                            "physicalStock": computed["physicalStock"],
                            "variance": computed["inventoryVariance"],
                            "adjustmentQty": computed["adjustmentQty"],
                            "isInitialStock": computed["isInitialStock"],
                            "status": status,
                            "updatedAt": now,
                            "lastUpdatedBy": updated_by,
                            "tenantId": payload.tenant_id or "",
                            "idempotencyKey": payload.idempotency_key or "",
                        }
                    },
                )
            )

            updated += 1
            action = "MANUAL_UPDATE"

        else:
            updates.append(
                UpdateOne(
                    {"randomId": u.randomId, "locationId": u.warehouseId},
                    {
                        "$set": {
                            "randomId": u.randomId,
                            "locationId": u.warehouseId,
                            "itemType": purchase_item.get("itemType", ""),
                            "systemStock": computed["systemStock"],
                            "physicalStock": computed["physicalStock"],
                            "systemStockSo": 0,
                            "physicalStockSo": 0,
                            "previousSystemStock": computed["previousSystemStock"],
                            "variance": computed["inventoryVariance"],
                            "adjustmentQty": computed["adjustmentQty"],
                            "isInitialStock": computed["isInitialStock"],
                            "status": status,
                            "createdAt": now,
                            "updatedAt": now,
                            "createdBy": updated_by,
                            "lastUpdatedBy": updated_by,
                            "tenantId": payload.tenant_id or "",
                            "idempotencyKey": payload.idempotency_key or "",
                        }
                    },
                    upsert=True,
                )
            )

            created += 1
            action = "PATCH_CREATE"

        history_docs.append(
            {
                "randomId": u.randomId,
                "locationId": u.warehouseId,
                "itemType": purchase_item.get("itemType", ""),
                "beforeStock": computed["historyBeforeStock"],
                "afterStock": computed["historyAfterStock"],
                "variance": computed["historyVariance"],
                "adjustmentQty": computed["adjustmentQty"],
                "isInitialStock": computed["isInitialStock"],
                "status": status,
                "updatedAt": now,
                "action": action,
                "updatedBy": updated_by,
                "description": description,
                "tenantId": payload.tenant_id or "",
                "idempotencyKey": payload.idempotency_key or "",
            }
        )

    if updates:
        await inventory.bulk_write(updates, ordered=False)

    if history_docs:
        await history.insert_many(history_docs)

    return {
        "updated": updated,
        "created": created,
        "skipped": skipped,
    }


# ==================== EXPORT CSV ====================


@router.get("/export")
async def export_all_items_with_inventory_stock(
    locationId: str = Query(...),
    purchasecategoryName: Optional[str] = None,
    purchasesubcategoryName: Optional[str] = None,
    itemName: Optional[str] = None,
    varianceName: Optional[str] = None,
):
    purchase = purchaseitem_collection()
    inventory = inventory_stock_collection()

    try:
        uom_map = await get_uom_precision_map()

        pur_query = {"status": "active"}

        if categories := to_list(purchasecategoryName):
            pur_query["purchasecategoryName"] = {"$in": categories}

        if subcategories := to_list(purchasesubcategoryName):
            pur_query["purchasesubcategoryName"] = {"$in": subcategories}

        if item_names := to_list(itemName):
            pur_query["itemgroupName"] = {"$in": item_names}

        if variance_names := to_list(varianceName):
            pur_query["itemName"] = {"$in": variance_names}

        pur_docs = await purchase.find(
            pur_query,
            {
                "randomId": 1,
                "itemCode": 1,
                "purchasecategoryName": 1,
                "purchasesubcategoryName": 1,
                "itemgroupName": 1,
                "itemName": 1,
                "uom": 1,
            },
        ).to_list(length=None)

        if not pur_docs:
            raise HTTPException(404, "No purchase items found")

        random_ids = [d["randomId"] for d in pur_docs if d.get("randomId")]

        inv_docs = await inventory.find(
            {
                "locationId": locationId,
                "randomId": {"$in": random_ids},
            },
            {
                "randomId": 1,
                "systemStock": 1,
                "physicalStock": 1,
                "variance": 1,
                "status": 1,
                "updatedAt": 1,
            },
        ).to_list(length=None)

        # inv_map = {d["randomId"]: d for d in inv_docs}
        # replace the part 4 8 1
        inv_map = {}

        for doc in sorted(
            inv_docs,
            key=lambda x: (x.get("updatedAt", datetime.min), x.get("_id")),
            reverse=True,
        ):
            rid = doc.get("randomId")

            if rid not in inv_map:
                inv_map[rid] = doc

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(
            [
                "S.No",
                "RandomId",
                "Item Code",
                "Category",
                "Subcategory",
                "Item Group",
                "Item Name",
                "System Stock",
                "PhysicalStock",
            ]
        )

        for idx, p in enumerate(pur_docs, 1):
            rid = p["randomId"]
            inv = inv_map.get(rid, {})

            precision = uom_map.get(p.get("uom", ""), 0)

            system_stock = round_by_precision(inv.get("systemStock", 0), precision)
            physical_stock = round_by_precision(inv.get("physicalStock", 0), precision)

            variance = round_by_precision(
                calculate_variance(system_stock, physical_stock),
                precision,
            )

            writer.writerow(
                [
                    idx,
                    rid,
                    p.get("itemCode", ""),
                    p.get("purchasecategoryName", ""),
                    p.get("purchasesubcategoryName", ""),
                    p.get("itemgroupName", ""),
                    p.get("itemName", ""),
                    system_stock,
                    system_stock,
                ]
            )

        output.seek(0)

        filename = (
            f"inventory_all_items_{locationId}_{datetime.utcnow():%Y%m%d_%H%M%S}.csv"
        )

        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ==================== IMPORT STOCKS ====================


@router.post("/importstocks")
async def import_inventory_onhand(
    file: UploadFile = File(...),
    locationId: str = Query(...),
    updated_by: str = Query(""),
    status: str = Query("pending", description="Stock status - default: pending"),
):
    purchase = purchaseitem_collection()
    inventory = inventory_stock_collection()
    history = get_stock_updates_collection()

    try:
        content = await file.read()

        if not content or content.strip() == b"":
            raise HTTPException(400, "Uploaded file is empty")

        try:
            df = pd.read_csv(io.BytesIO(content))
        except Exception:
            try:
                data = json.loads(content.decode())
                df = pd.DataFrame(data if isinstance(data, list) else [data])
            except Exception:
                raise HTTPException(400, "Invalid file format. Upload CSV or JSON.")

        df.columns = df.columns.str.strip()

        if "RandomId" not in df.columns or "PhysicalStock" not in df.columns:
            raise HTTPException(
                400,
                "File must contain RandomId and PhysicalStock columns",
            )

        df["RandomId"] = df["RandomId"].astype(str).str.strip()
        df = df[df["RandomId"] != ""]

        if df.empty:
            raise HTTPException(400, "No valid RandomId found")

        now = ist_now()
        random_ids = df["RandomId"].unique().tolist()

        purchase_items = await purchase.find(
            {"randomId": {"$in": random_ids}},
            {"randomId": 1, "itemType": 1, "status": 1, "uom": 1},
        ).to_list(length=None)

        purchase_map = {p["randomId"]: p for p in purchase_items}
        uom_map = await get_uom_precision_map()

        inv_docs = await inventory.find(
            {
                "locationId": locationId,
                "randomId": {"$in": random_ids},
            }
        ).to_list(length=None)

        # inv_map = {d["randomId"]: d for d in inv_docs}
        # replace the part 8 4 1 chat
        inv_map = {}

        for doc in sorted(
            inv_docs,
            key=lambda x: (x.get("updatedAt", datetime.min), x.get("_id")),
            reverse=True,
        ):
            rid = doc.get("randomId")

            if rid not in inv_map:
                inv_map[rid] = doc

        updates: List[UpdateOne] = []
        history_docs: List[Dict[str, Any]] = []

        updated = 0
        created = 0
        skipped = 0

        skipped_rows = []
        failed_rows = []

        # Last duplicate RandomId wins, same as outlet style.
        normalized_rows: Dict[str, Any] = {}
        duplicate_random_ids = set()

        for row_no, row in enumerate(df.to_dict(orient="records"), 1):
            random_id = str(row.get("RandomId", "")).strip()

            if not random_id:
                failed_rows.append({"row": row_no, "reason": "RandomId is required"})
                continue

            if random_id in normalized_rows:
                duplicate_random_ids.add(random_id)

            normalized_rows[random_id] = {
                "row": row_no,
                "randomId": random_id,
                "physicalStock": row.get("PhysicalStock"),
            }

        for random_id, row_data in normalized_rows.items():
            row_no = row_data["row"]

            try:
                raw_physical = parse_import_stock_value(
                    row_data.get("physicalStock"),
                    f"Row {row_no}:",
                )
            except ValueError as e:
                failed_rows.append(
                    {"row": row_no, "randomId": random_id, "reason": str(e)}
                )
                continue

            purchase_item = purchase_map.get(random_id)
            doc = inv_map.get(random_id)

            if not purchase_item:
                failed_rows.append(
                    {
                        "row": row_no,
                        "randomId": random_id,
                        "reason": "Item missing in purchase",
                    }
                )
                continue

            if purchase_item.get("status") != "active":
                failed_rows.append(
                    {"row": row_no, "randomId": random_id, "reason": "Item inactive"}
                )
                continue


            precision = uom_map.get(purchase_item.get("uom", ""), 0)
            physical_qty = round_by_precision(raw_physical, precision)

            computed = compute_inventory_stock_update(doc, physical_qty, precision)

            if doc:
                updates.append(
                    UpdateOne(
                        {"randomId": random_id, "locationId": locationId},
                        {
                            "$set": {
                                "systemStock": computed["systemStock"],
                                "physicalStock": computed["physicalStock"],
                                "previousSystemStock": computed["previousSystemStock"],
                                "variance": computed["inventoryVariance"],
                                "adjustmentQty": computed["adjustmentQty"],
                                "isInitialStock": computed["isInitialStock"],
                                "status": status,
                                "updatedAt": now,
                                "lastUpdatedBy": updated_by,
                            }
                        },
                    )
                )

                updated += 1

            else:
                updates.append(
                    UpdateOne(
                        {"randomId": random_id, "locationId": locationId},
                        {
                            "$set": {
                                "randomId": random_id,
                                "locationId": locationId,
                                "itemType": purchase_item.get("itemType", ""),
                                "systemStock": computed["systemStock"],
                                "physicalStock": computed["physicalStock"],
                                "systemStockSo": 0,
                                "physicalStockSo": 0,
                                "variance": computed["inventoryVariance"],
                                "previousSystemStock": computed["previousSystemStock"],
                                "adjustmentQty": computed["adjustmentQty"],
                                "isInitialStock": computed["isInitialStock"],
                                "status": status,
                                "createdAt": now,
                                "updatedAt": now,
                                "createdBy": updated_by,
                                "lastUpdatedBy": updated_by,
                                "tenantId": "",
                                "idempotencyKey": "",
                            }
                        },
                        upsert=True,
                    )
                )

                created += 1

            history_docs.append(
                {
                    "randomId": random_id,
                    "locationId": locationId,
                    "itemType": purchase_item.get("itemType", ""),
                    "beforeStock": computed["historyBeforeStock"],
                    "afterStock": computed["historyAfterStock"],
                    "variance": computed["historyVariance"],
                    "adjustmentQty": computed["adjustmentQty"],
                    "isInitialStock": computed["isInitialStock"],
                    "status": status,
                    "updatedAt": now,
                    "action": "CSV_IMPORT",
                    "updatedBy": updated_by,
                    "description": "",
                }
            )

        if updates:
            await inventory.bulk_write(updates, ordered=False)

        if history_docs:
            await history.insert_many(history_docs)

        return {
            "message": "Inventory import completed successfully",
            "locationId": locationId,
            "totalRows": len(df),
            "updated": updated,
            "created": created,
            "skipped": skipped,
            "duplicatesFound": len(duplicate_random_ids),
            "warnings": (
                [
                    f"Duplicate RandomIds found, last value used: {sorted(duplicate_random_ids)}"
                ]
                if duplicate_random_ids
                else None
            ),
            "skippedRows": skipped_rows,
            "failedRows": failed_rows,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Import failed: {e}")




@router.post("/bulk-inventory")
async def bulk_create_update_stock(
    items: List[StockUpdateModel],
    updated_by: str = Query("System"),
    description: str = Query(""),
    status: str = Query("pending", description="Stock status - default: pending"),
):
    purchase = purchaseitem_collection()
    inventory = inventory_stock_collection()
    history = get_stock_updates_collection()

    if not items:
        raise HTTPException(400, "No items provided")

    now = ist_now()

    updates: List[UpdateOne] = []
    history_docs: List[Dict[str, Any]] = []
    results = []

    random_ids = [item.randomId for item in items]
    location_ids = list({item.warehouseId for item in items})

    purchase_items = await purchase.find(
        {"randomId": {"$in": random_ids}},
        {"randomId": 1, "itemType": 1, "uom": 1},
    ).to_list(length=None)

    purchase_map = {item["randomId"]: item for item in purchase_items}

    uom_map = await get_uom_precision_map()

    inv_docs = await inventory.find(
        {
            "locationId": {"$in": location_ids},
            "randomId": {"$in": random_ids},
        }
    ).to_list(length=None)

    inv_map = {(d.get("randomId"), d.get("locationId")): d for d in inv_docs}

    for item in items:
        random_id = item.randomId
        warehouse_id = item.warehouseId

        purchase_item = purchase_map.get(random_id)

        if not purchase_item:
            results.append(
                {
                    "randomId": random_id,
                    "status": "error",
                    "message": "Item not found in purchase",
                }
            )
            continue

        precision = uom_map.get(purchase_item.get("uom", ""), 0)
        physical_qty = round_by_precision(item.physicalStock, precision)

    
        existing_stock = inv_map.get((random_id, warehouse_id))


        computed = compute_inventory_stock_update(
            existing_stock,
            physical_qty,
            precision,
        )

        item_type = purchase_item.get("itemType", "")

        if existing_stock:
            prev_so = existing_stock.get("systemStockSo", 0)
            prev_phy_so = existing_stock.get("physicalStockSo", 0)

            updates.append(
                UpdateOne(
                    {"_id": existing_stock["_id"]},
                    {
                        "$set": {
                            "systemStock": computed["systemStock"],
                            "physicalStock": computed["physicalStock"],
                            "previousSystemStock": computed["previousSystemStock"],
                            "variance": computed["inventoryVariance"],
                            "adjustmentQty": computed["adjustmentQty"],
                            "isInitialStock": computed["isInitialStock"],
                            "status": status,
                            "updatedAt": now,
                            "lastUpdatedBy": updated_by,
                        }
                    },
                )
            )

            history_docs.append(
                {
                    "randomId": random_id,
                    "locationId": warehouse_id,
                    "itemType": item_type,
                    "systemStock": computed["systemStock"],
                    "physicalStock": computed["physicalStock"],
                    "previousSystemStock": computed["previousSystemStock"],
                    "beforeStock": computed["historyBeforeStock"],
                    "afterStock": computed["historyAfterStock"],
                    "variance": computed["historyVariance"],
                    "adjustmentQty": computed["adjustmentQty"],
                    "isInitialStock": computed["isInitialStock"],
                    "status": status,
                    "systemStockSo": prev_so,
                    "physicalStockSo": prev_phy_so,
                    "updatedAt": now,
                    "action": "MANUAL_UPDATE",
                    "updatedBy": updated_by,
                    "description": description,
                }
            )

            action = "updated"

        else:
            new_doc = {
                "randomId": random_id,
                "locationId": warehouse_id,
                "itemType": item_type,
                "systemStock": computed["systemStock"],
                "physicalStock": computed["physicalStock"],
                "systemStockSo": 0,
                "physicalStockSo": 0,
                "previousSystemStock": computed["previousSystemStock"],
                "variance": computed["inventoryVariance"],
                "adjustmentQty": computed["adjustmentQty"],
                "isInitialStock": computed["isInitialStock"],
                "status": status,
                "createdAt": now,
                "updatedAt": now,
                "createdBy": updated_by,
                "lastUpdatedBy": updated_by,
            }

            updates.append(
                UpdateOne(
                    {"randomId": random_id, "locationId": warehouse_id},
                    {"$set": new_doc},
                    upsert=True,
                )
            )

            history_docs.append(
                {
                    "randomId": random_id,
                    "locationId": warehouse_id,
                    "itemType": item_type,
                    "beforeStock": computed["historyBeforeStock"],
                    "afterStock": computed["historyAfterStock"],
                    "variance": computed["historyVariance"],
                    "adjustmentQty": computed["adjustmentQty"],
                    "isInitialStock": computed["isInitialStock"],
                    "status": status,
                    "updatedAt": now,
                    "action": "BULK_CREATE",
                    "updatedBy": updated_by,
                    "description": description,
                }
            )

            action = "created"

        results.append(
            {
                "randomId": random_id,
                "status": "success",
                "action": action,
                "stock": computed["systemStock"],
                "variance": computed["inventoryVariance"],
                "historyVariance": computed["historyVariance"],
                "adjustmentQty": computed["adjustmentQty"],
                "isInitialStock": computed["isInitialStock"],
            }
        )

    if updates:
        await inventory.bulk_write(updates, ordered=False)

    if history_docs:
        await history.insert_many(history_docs)

    return {
        "message": "Bulk operation completed",
        "results": results,
        "timestamp": now.isoformat(),
    }





@router.get("/export/sample")
async def export_sample_onhand(
    locationId: str = Query(..., description="Warehouse / Location ID"),
    purchasecategoryName: Optional[str] = None,
    purchasesubcategoryName: Optional[str] = None,
    itemName: Optional[str] = None,
    varianceName: Optional[str] = None,
):
    purchase = purchaseitem_collection()
    inventory = inventory_stock_collection()

    try:
        uom_map = await get_uom_precision_map()

        pur_query = {"status": "active"}

        if categories := to_list(purchasecategoryName):
            pur_query["purchasecategoryName"] = {"$in": categories}

        if subcategories := to_list(purchasesubcategoryName):
            pur_query["purchasesubcategoryName"] = {"$in": subcategories}

        if item_names := to_list(itemName):
            pur_query["itemgroupName"] = {"$in": item_names}

        if variance_names := to_list(varianceName):
            parsed_vars = [parse_display_name(v) for v in variance_names]
            pur_query["itemName"] = {"$in": parsed_vars}

        pur_docs = (
            await purchase.find(
                pur_query,
                {
                    "randomId": 1,
                    "itemCode": 1,
                    "purchasecategoryName": 1,
                    "purchasesubcategoryName": 1,
                    "itemgroupName": 1,
                    "itemName": 1,
                    "uom": 1,
                },
            )
            .sort("_id", 1)
            .to_list(length=None)
        )

        if not pur_docs:
            raise HTTPException(404, "No active purchase items found")

        random_ids = [d["randomId"] for d in pur_docs if d.get("randomId")]

        inv_docs = await inventory.find(
            {
                "locationId": locationId,
                "randomId": {"$in": random_ids},
            },
            {
                "randomId": 1,
                "systemStock": 1,
                "physicalStock": 1,
            },
        ).to_list(length=None)

        inv_map = {d["randomId"]: d for d in inv_docs}

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(
            [
                "S.No",
                "RandomId",
                "Item Code",
                "Category",
                "Subcategory",
                "Item Name",
                "Variance Name",
                "System Stock",
                "PhysicalStock",
            ]
        )

        for idx, p in enumerate(pur_docs, 1):
            rid = p.get("randomId", "")
            inv = inv_map.get(rid, {})

            precision = uom_map.get(p.get("uom", ""), 0)

            system_stock = round_by_precision(inv.get("systemStock", 0), precision)
            physical_stock = round_by_precision(
                inv.get("physicalStock", system_stock), precision
            )

            writer.writerow(
                [
                    idx,
                    rid,
                    p.get("itemCode", ""),
                    p.get("purchasecategoryName", ""),
                    p.get("purchasesubcategoryName", ""),
                    p.get("itemgroupName", ""),
                    p.get("itemName", ""),
                    system_stock,
                    physical_stock,
                ]
            )

        output.seek(0)

        filename = f"sample_rmstock_import_format_{locationId}_{datetime.utcnow():%Y%m%d_%H%M%S}.csv"

        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
