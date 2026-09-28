from datetime import datetime, timedelta, timezone, date
from bson import ObjectId
from typing import Optional
from bson.regex import Regex
from typing import Dict, Any, List, Tuple
import asyncio
import re
import math
from core.search import and_queries, mongo_token_query
from fastapi import HTTPException

from core.compute import ist_now
from core.lookups import format_display_name, parse_display_name
from db.collections import (
    approvedstocks_rm_collection,
    closingstocks_rm_collection,
    warehouse_physical_stock_closing_collection,
    grn_collection,
    inventory_stock_collection,
    purchaseitem_collection,
    storeDispatch_collection,
    warehouse_return_collection,
    purchase_uom_collection,  
)
from WarehouseInventoryVariance.models import PurchaseItem



async def get_uom_precision_map() -> Dict[str, int]:

    cursor = purchase_uom_collection().find({}, {"uom": 1, "precisionValue": 1})
    docs = await cursor.to_list(None)

    uom_map = {}
    for doc in docs:
        uom_name = doc.get("uom")
        prec_val = doc.get("precisionValue", "1")  # Default to "1" (Integer)

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
            except:
                if "." in prec_val:
                    precision_int = len(prec_val.split(".")[1])
                else:
                    precision_int = 0

        if uom_name:
            uom_map[uom_name] = precision_int

    return uom_map


def round_by_precision(value: float, precision: int) -> float:
    """Rounds value to specific decimal places."""
    if value is None:
        return 0.0
    return round(float(value), precision)


def create_search_pattern(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"\s+", ".*", text.strip())
    return f".*{cleaned}.*"


def round3(value) -> float:
    try:
        return float(round(float(value), 3))
    except:
        return 0.0


def clean(value: Optional[str]) -> Optional[str]:
    return " ".join(value.strip().split()) if value else None


def convert_object_ids(data):
    """Recursively convert ObjectId to string for JSON responses."""
    if isinstance(data, list):
        return [convert_object_ids(i) for i in data]
    if isinstance(data, dict):
        return {k: convert_object_ids(v) for k, v in data.items()}
    if isinstance(data, ObjectId):
        return str(data)
    return data


def make_regex_list(values: Optional[str]):
    if not values:
        return None
    raw_items = [v.strip() for v in values.split(",") if v.strip()]
    items = [clean(v) for v in raw_items if clean(v)]
    return [Regex(create_search_pattern(v), "i") for v in items]


def safe_float(value, default=0.0) -> float:
    try:
        if value is None or str(value).strip() == "":
            return float(default)
        val_str = str(value).strip()
        if val_str.startswith("."):
            val_str = "0" + val_str
        return float(val_str)
    except (ValueError, TypeError):
        return float(default)


# NEW: Calculate variance between system and physical stock
def calculate_variance(system_stock: float, physical_stock: float) -> float:
    return float(physical_stock) - float(system_stock)


def should_show_approve_button(inventory_doc: Dict[str, Any]) -> bool:

    if not inventory_doc:
        return False  # Not Available case

    status = (inventory_doc.get("status") or "").lower()
    variance = safe_float(inventory_doc.get("variance", 0))

    # Removed variance == 0 check to allow auditing daily physical closures even if variance is 0

    # If approved → no approve button
    if status == "approved":
        return False

    # If pending and variance exists → show button
    if status == "pending":
        return True

    return False


def get_inventory_display_values(
    inventory_doc: Dict[str, Any], query_date: Optional[datetime] = None
) -> Dict[str, Any]:

    # Default return when no inventory doc exists
    if not inventory_doc:
        return {
            "system_stock": 0.0,
            "physical_stock": "-",
            "variance_display": "-",
            "status_display": "Not Available",
            "show_approve_button": False,
            "last_updated": "-",
            "is_updated_today": False,
        }

    system_stock = safe_float(inventory_doc.get("systemStock", 0))
    physical_stock = inventory_doc.get("physicalStock")
    stored_variance = inventory_doc.get("variance")
    status = inventory_doc.get("status")
    updated_at = inventory_doc.get("updatedAt")

    # Status display
    status_display = status.capitalize() if status else "Not Available"

    # -----------------------------
    # Check Updated Today
    # -----------------------------
    is_updated_today = False
    last_updated = "-"

    if updated_at:
        try:
            if isinstance(updated_at, datetime):
                updated_date = updated_at.date()
                last_updated = updated_at.strftime("%Y-%m-%d %H:%M:%S")
            elif isinstance(updated_at, str):
                updated_date = datetime.fromisoformat(
                    updated_at.replace("Z", "+00:00")
                ).date()
                last_updated = updated_at
            else:
                updated_date = None

            if query_date and updated_date:
                is_updated_today = updated_date == query_date.date()
        except:
            pass

    # -----------------------------
    # Display Logic
    # -----------------------------
    # if not is_updated_today or physical_stock is None:
    #     physical_stock_display = "-"
    #     variance_display = "-"
    #     status_display = "Not Available"
    # else:
    #     physical_stock_display = safe_float(physical_stock)
    #     variance_display = safe_float(stored_variance)
    # replace part 31 7 1
    if physical_stock is None:
        physical_stock_display = "-"
        variance_display = "-"
        status_display = "Not Available"
    else:
        # physical_stock_display = safe_float(physical_stock)
        # variance_display = safe_float(stored_variance)

        # if status:
        #     status_display = status.capitalize()
        # replace the part 6 8 2
        physical_stock_display = safe_float(physical_stock)

        # Always calculate variance from current values
        variance_display = calculate_variance(
            system_stock,
            physical_stock_display,
        )

        if status:
            status_display = status.capitalize()

    # -----------------------------
    # Approve Button
    # -----------------------------
    show_approve_button = should_show_approve_button(inventory_doc)

    return {
        "system_stock": system_stock,
        "physical_stock": physical_stock_display,
        "variance_display": variance_display,
        "status_display": status_display,
        "show_approve_button": show_approve_button,
        "last_updated": last_updated,
        "is_updated_today": is_updated_today,
    }


def build_filter(
    varianceName: Optional[str],
    category: Optional[str],
    subcategory: Optional[str],
    itemName: Optional[str],
):
    and_conditions = []

    # ------- VarianceName → EXACT MATCH on itemName -------
    if varianceName:
        parsed_vals = []
        for v in varianceName.split(","):
            if not v.strip():
                continue
            cleaned = clean(v)
            parsed_vals.append(parse_display_name(cleaned))
        
        if parsed_vals:
            and_conditions.append(
                {"itemName": {"$in": [Regex(f"^{re.escape(v)}$", "i") for v in parsed_vals]}}
            )

    # ------- ItemName → EXACT MATCH on itemgroupName -------
    if itemName:
        raw_vals = [clean(v) for v in itemName.split(",") if v.strip()]
        if raw_vals:
            and_conditions.append(
                {"itemgroupName": {"$in": [Regex(f"^{re.escape(v)}$", "i") for v in raw_vals]}}
            )

    # ------- Category → EXACT MATCH -------
    if category:
        raw_vals = [clean(v) for v in category.split(",") if v.strip()]
        if raw_vals:
            and_conditions.append(
                {
                    "purchasecategoryName": {
                        "$in": [Regex(f"^{re.escape(v)}$", "i") for v in raw_vals]
                    }
                }
            )

    # ------- Subcategory → EXACT MATCH + null logic -------
    if subcategory:
        raw_items = [clean(v) for v in subcategory.split(",") if v.strip()]
        has_null = any(v.lower() == "null" for v in raw_items)
        non_null_items = [v for v in raw_items if v.lower() != "null"]

        exact_regex = [Regex(f"^{re.escape(v)}$", "i") for v in non_null_items]

        null_conditions = [
            {"purchasesubcategoryName": None},
            {"purchasesubcategoryName": ""},
            {"purchasesubcategoryName": {"$regex": "^null$", "$options": "i"}},
        ]

        if non_null_items and has_null:
            and_conditions.append(
                {
                    "$or": [
                        {"purchasesubcategoryName": {"$in": exact_regex}},
                        *null_conditions,
                    ]
                }
            )
        elif non_null_items:
            and_conditions.append({"purchasesubcategoryName": {"$in": exact_regex}})
        elif has_null:
            and_conditions.append({"$or": null_conditions})

    if not and_conditions:
        return {}
    if len(and_conditions) == 1:
        return and_conditions[0]
    return {"$and": and_conditions}


# ==================== MAP OPENING STOCK FROM YESTERDAY CLOSING DATA ====================
async def fetch_opening_stock_for_day(locationName: str, date_obj):
    closing_col = closingstocks_rm_collection()

    prev_date = (date_obj - timedelta(days=1)).strftime("%Y-%m-%d")

    query = {"date": prev_date}
    if locationName:
        query["locationId"] = locationName

    cursor = closing_col.find(query)

    opening_stock_map = {}
    async for doc in cursor:
        opening_stock_map[str(doc["randomId"]).strip().lower()] = {
            "openingSystem": doc.get("systemStock", 0),
            "openingPhysical": doc.get("physicalStock", 0),
        }

    return opening_stock_map


# ==================== FETCH INVENTORY WITH STATUS AND VARIANCE ====================
async def fetch_inventory_map_for_day(
    location_id: str, date_obj: datetime
) -> Dict[str, Dict[str, Any]]:

    col = inventory_stock_collection()

    # Ensure date_obj is timezone aware
    if date_obj.tzinfo is None:
        date_obj = date_obj.replace(tzinfo=timezone.utc)

    # Create start and end of day in UTC
    start_date = datetime(
        date_obj.year, date_obj.month, date_obj.day, 0, 0, 0, 0, tzinfo=timezone.utc
    )
    end_date = start_date + timedelta(days=1)

    try:
        # Get ALL latest records for the location
        all_pipeline = [
            {"$match": {"locationId": location_id}},
            {"$sort": {"updatedAt": -1}},
            {
                "$group": {
                    "_id": "$randomId",
                    "systemStock": {"$first": "$systemStock"},
                    "physicalStock": {"$first": "$physicalStock"},
                    "variance": {"$first": "$variance"},
                    "status": {"$first": "$status"},
                    "updatedAt": {"$first": "$updatedAt"},
                    "lastUpdatedBy": {"$first": "$lastUpdatedBy"},
                }
            },
        ]

        all_items = await col.aggregate(all_pipeline).to_list(None)

        # Get items updated TODAY
        today_pipeline = [
            {
                "$match": {
                    "locationId": location_id,
                    "updatedAt": {"$gte": start_date, "$lt": end_date},
                }
            },
            {"$sort": {"updatedAt": -1}},
            {
                "$group": {
                    "_id": "$randomId",
                    "systemStock": {"$first": "$systemStock"},
                    "physicalStock": {"$first": "$physicalStock"},
                    "variance": {"$first": "$variance"},
                    "status": {"$first": "$status"},
                    "updatedAt": {"$first": "$updatedAt"},
                    "lastUpdatedBy": {"$first": "$lastUpdatedBy"},
                }
            },
        ]

        today_items = await col.aggregate(today_pipeline).to_list(None)

        # Create lookup dictionaries
        today_lookup = {}
        for item in today_items:
            random_id = str(item["_id"]).strip().lower()
            today_lookup[random_id] = {
                "systemStock": safe_float(item.get("systemStock", 0)),
                "physicalStock": safe_float(item.get("physicalStock", 0)),
                "variance": safe_float(item.get("variance", 0)),
                "status": item.get("status", "pending"),
                "updatedAt": item.get("updatedAt"),
                "lastUpdatedBy": item.get("lastUpdatedBy", ""),
                "isUpdatedToday": True,
            }

        # Build final inventory map
        inventory_map = {}

        # Process all items
        for item in all_items:
            random_id = str(item["_id"]).strip().lower()

            if random_id in today_lookup:
                # Use today's data if available
                inventory_map[random_id] = today_lookup[random_id]
            else:
           
                inventory_map[random_id] = {
                    "systemStock": safe_float(item.get("systemStock", 0)),
                    "physicalStock": safe_float(item.get("physicalStock", 0)),
                    "variance": safe_float(item.get("variance", 0)),
                    "status": item.get("status"),
                    "updatedAt": item.get("updatedAt"),
                    "lastUpdatedBy": item.get("lastUpdatedBy", ""),
                    "isUpdatedToday": False,
                }

        return inventory_map

    except Exception as e:
        import traceback

        traceback.print_exc()
        return {}


# ==================== MAP PURCHASE DATA ====================
async def map_purchase_data(
    purchase_items,
    grn_data,
    store_map,
    opening_stock_map,
    inventory_map,
    location_name=None,
    warehouse_return_map=None,
    query_date=None,
):

    # Fetch UOM Precision Map
    uom_precision_map = await get_uom_precision_map()

    grn_map = {
        (g.get("_id") or "")
        .strip()
        .lower(): {
            "totalReceivedQuantity": g.get("totalReceivedQuantity", 0),
            "totalReturnedQuantity": g.get("totalReturnedQuantity", 0),
        }
        for g in grn_data
        if g.get("_id")
    }

    formatted_items = []

    for item in purchase_items:
        raw_item_name = (item.get("itemName") or "").strip().upper()
        raw_id_str = str(item.get("randomId") or "").strip().lower()
        variance_key = raw_item_name.lower()



        # Get precision for this item
        uom_name = item.get("uom", "")
        precision = uom_precision_map.get(uom_name, 0)

        grn_info = grn_map.get(variance_key, {})
        received_qty = safe_float(grn_info.get("totalReceivedQuantity", 0))
        returned_qty = safe_float(grn_info.get("totalReturnedQuantity", 0))

        dispatch_qty = safe_float(store_map.get(variance_key, 0))
        warehouse_return = safe_float(warehouse_return_map.get(variance_key, 0))

        opening_stock = safe_float(
            opening_stock_map.get(raw_id_str, {}).get("openingSystem", 0)
        )

        # Calculate current system based on opening stock + transactions
        current_system = (
            opening_stock
            + received_qty
            - returned_qty
            - dispatch_qty
            + warehouse_return
        )

        # Apply precision to calculations
        opening_stock = round_by_precision(opening_stock, precision)
        received_qty = round_by_precision(received_qty, precision)
        returned_qty = round_by_precision(returned_qty, precision)
        dispatch_qty = round_by_precision(dispatch_qty, precision)
        warehouse_return = round_by_precision(warehouse_return, precision)
        current_system = round_by_precision(current_system, precision)

        # Get inventory display values
        inventory_doc = inventory_map.get(raw_id_str, {})
        if not inventory_doc:
            print(
                "NO INVENTORY MATCH:",
                raw_id_str,
                "IN MAP:",
                raw_id_str in inventory_map,
                "MAP SIZE:",
                len(inventory_map),
            )
        display_values = get_inventory_display_values(inventory_doc, query_date)

        # If not updated today, use computed current_system
        updated_current_system = (
            display_values["system_stock"] if inventory_doc else current_system
        )

        # Apply precision to display values if they are floats
        if isinstance(display_values["physical_stock"], (int, float)):
            display_values["physical_stock"] = round_by_precision(
                display_values["physical_stock"], precision
            )
        if isinstance(display_values["variance_display"], (int, float)):
            display_values["variance_display"] = round_by_precision(
                display_values["variance_display"], precision
            )

        formatted_items.append(
            PurchaseItem(
                rawmaterialId=raw_id_str,
                randomId=item.get("randomId") or "",
                itemCode=item.get("itemCode") or "",
                category=(item.get("purchasecategoryName") or "").upper(),
                subcategory=(item.get("purchasesubcategoryName") or "".upper()),
                itemName=raw_item_name,
                varianceName=(item.get("itemgroupName") or "").upper(),
                openingStock=float(opening_stock),
                receivedQty=float(received_qty),
                returnedQty=float(returned_qty),
                dispatchQty=float(dispatch_qty),
                warehouseReturn=float(warehouse_return),
                currentSystem=float(current_system),
                updatedCurrentSystem=float(
                    round_by_precision(updated_current_system, precision)
                ),
                physicalClosing=display_values["physical_stock"],
                variance=display_values["variance_display"],
                approvalStatus=display_values["status_display"],
                approvalButton=display_values["show_approve_button"],
                locationName=location_name or "",
                lastUpdated=display_values["last_updated"],
            )
        )

    return formatted_items


# ==================== DROPDOWN HELPER ====================
async def get_dropdown_values(
    collection, field, page, limit, search, base_filter: Optional[dict] = None
):
    base_filter = base_filter or {}
    if search and search.strip():
        # itemName dropdown shows "variance (group)", so search both parts
        search_fields = ["itemName", "itemgroupName"] if field == "itemName" else [field]
        filter_query = and_queries(base_filter, mongo_token_query(search, search_fields))
    else:
        filter_query = base_filter

    try:
        # ── varianceName dropdown: show "itemName (itemgroupName)" ──────────
        # In purchaseitem_collection:
        #   itemName      = the variance name  (shown as varianceName in UI)
        #   itemgroupName = the item/group name (shown as itemName in UI)
        if field == "itemName":
            cursor = (
                collection
                .find(filter_query, {"itemName": 1, "itemgroupName": 1})
                .sort("itemName", 1)
            )
            docs = await cursor.to_list(None)
            cleaned_values = []
            seen = set()
            for doc in docs:
                variance_val = clean(doc.get("itemName") or "")
                group_val = clean(doc.get("itemgroupName") or "")
                if not variance_val:
                    continue
                display = format_display_name(variance_val, group_val)
                key = display.lower()
                if key not in seen:
                    seen.add(key)
                    cleaned_values.append(display)
            cleaned_values.sort(key=lambda x: x.lower())
            start = (page - 1) * limit
            paginated = cleaned_values[start : start + limit]
            total = len(cleaned_values)
            return paginated, total

        # ── All other fields: fast distinct() path ──────────────────────────
        raw_values = await collection.distinct(field, filter_query)
        cleaned_values = []
        seen = set()
        for v in raw_values:
            if not v:
                continue
            cleaned = clean(v)
            if cleaned and cleaned.lower() not in seen:
                seen.add(cleaned.lower())
                cleaned_values.append(cleaned)
        cleaned_values.sort(key=lambda x: x.lower())
        start = (page - 1) * limit
        paginated = cleaned_values[start : start + limit]
        total = len(cleaned_values)
        return paginated, total
    except Exception as e:
        return [], 0



# helper to fetch inventory by randomId + warehouse + date
async def fetch_inventory_stock(random_id, warehouse_id, date_obj):
    col = closingstocks_rm_collection()

    start = datetime(date_obj.year, date_obj.month, date_obj.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    doc = await col.find_one(
        {
            "randomId": random_id,
            "locationId": warehouse_id,
            "createdAt": {"$gte": start, "$lt": end},
        },
        sort=[("_id", -1)],
    )

    if not doc:
        return {"systemStock": 0.0, "physicalStock": 0.0}

    return {
        "systemStock": safe_float(doc.get("systemStock", 0)),
        "physicalStock": safe_float(doc.get("physicalStock", 0)),
    }



async def fetch_purchase_items(
    skip: int,
    limit: int,
    varianceName: Optional[str],
    category: Optional[str],
    subcategory: Optional[str],
    itemName: Optional[str],
):
    collection = purchaseitem_collection()
    filter_dict = build_filter(varianceName, category, subcategory, itemName)
    query = filter_dict if filter_dict else {}
    try:
        total = await collection.count_documents(query)
        data = (
            await collection.find(query)
            .sort("_id", 1)
            .skip(skip)
            .limit(limit)
            .to_list(limit)
        )

        return data, total, collection
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch purchase items: {str(e)}"
        )


async def fetch_pending_purchase_items(
    skip: int,
    limit: int,
    varianceName: Optional[str],
    category: Optional[str],
    subcategory: Optional[str],
    itemName: Optional[str],
    locationName: str,
):

    collection = purchaseitem_collection()

    try:
        pending_result = await get_pending_rm_item_codes(
            location_id=locationName,
            query_date=None,
        )

        pending_random_ids = [
            str(rid).strip()
            for rid in pending_result.get("pendingRandomIds", [])
            if rid
        ]

        if not pending_random_ids:
            return [], 0, collection

        base_filter = build_filter(
            varianceName,
            category,
            subcategory,
            itemName,
        )

        query_conditions = [
            {
                "randomId": {
                    "$in": pending_random_ids
                }
            }
        ]

        if base_filter:
            query_conditions.append(base_filter)

        if len(query_conditions) == 1:
            query = query_conditions[0]
        else:
            query = {
                "$and": query_conditions
            }

        total = await collection.count_documents(query)

        data = (
            await collection.find(query)
            .sort("_id", 1)
            .skip(skip)
            .limit(limit)
            .to_list(limit)
        )

        return data, total, collection

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch pending purchase items: {str(e)}",
        )
# ==================== FETCH GRN DATA ====================
async def fetch_grn_data(date_obj=None, next_day=None):
    if date_obj is None:
        date_obj = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    if next_day is None:
        next_day = date_obj + timedelta(days=1)

    grn_col = grn_collection()

    grn_filter = {"grnDate": {"$gte": date_obj, "$lt": next_day}}
    try:
        grn_data = await grn_col.aggregate(
            [
                {"$match": grn_filter},
                {"$unwind": "$itemDetails"},
                {
                    "$group": {
                        "_id": "$itemDetails.itemName",
                        "totalReceivedQuantity": {
                            "$sum": {"$toDouble": "$itemDetails.receivedQuantity"}
                        },
                        "totalReturnedQuantity": {
                            "$sum": {"$toDouble": "$itemDetails.returnedQuantity"}
                        },
                    }
                },
            ]
        ).to_list(None)
        return grn_data
    except Exception:
        return []


# ==================== FETCH STORE DISPATCH DATA ====================
async def fetch_store_dispatch_data(date_obj):
    store_col = storeDispatch_collection()
    date_str = date_obj.strftime("%Y-%m-%d")

    match = {
        "status": "dispatched",
        "type": "store",
        "date": {"$regex": f"^{date_str}"},
    }

    pipeline = [
        {"$match": match},
        {
            "$unwind": {
                "path": "$varianceName",
                "includeArrayIndex": "idx",
                "preserveNullAndEmptyArrays": True,
            }
        },
        {
            "$addFields": {
                "uomValue": {"$arrayElemAt": ["$uom", "$idx"]},
                "qtyValue": {"$arrayElemAt": ["$qty", "$idx"]},
                "weightValue": {"$arrayElemAt": ["$weight", "$idx"]},
            }
        },
        {
            "$addFields": {
                "finalQty": {
                    "$cond": [
                        {"$eq": ["$uomValue", "Kgs"]},
                        "$weightValue",
                        "$qtyValue",
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": "$varianceName",
                "totalDispatch": {"$sum": {"$toDouble": "$finalQty"}},
            }
        },
    ]

    try:
        store_data = await store_col.aggregate(pipeline).to_list(None)
        return {
            item["_id"].lower(): item["totalDispatch"]
            for item in store_data
            if item["_id"]
        }
    except Exception:
        return {}


# ==================== FETCH WAREHOUSE RETURN DATA ====================
async def fetch_warehouse_return_data(date_obj=None, warehouse=None):
    warehouse_col = warehouse_return_collection()
    if not date_obj:
        date_obj = datetime.now()
    start = date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    query = {
        "$and": [
            {
                "$or": [
                    {"date": {"$gte": start, "$lt": end}},
                    {"date": {"$regex": f"^{date_obj.strftime('%Y-%m-%d')}"}},
                ]
            },
            {"status": "Received"},
        ]
    }
    if warehouse:
        query["$and"].append(
            {"warehouseName": {"$regex": f"^{re.escape(warehouse)}$", "$options": "i"}}
        )
    try:
        docs = await warehouse_col.find(query).to_list(None)
        warehouse_map = {}
        for doc in docs:
            item_names = doc.get("varianceName") or doc.get("itemName") or []
            received_qtys = doc.get("receivedqty") or doc.get("receivedQty") or []
            for i, name in enumerate(item_names):
                try:
                    qty = float(received_qtys[i])
                except (ValueError, IndexError, TypeError):
                    qty = 0.0
                key = name.strip().lower()
                warehouse_map[key] = warehouse_map.get(key, 0) + qty
        return warehouse_map
    except Exception:
        return {}



def _target_date_parts_rm(created_date: Optional[str]):
 
    if created_date:
        try:
            target_date = datetime.strptime(created_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid createdDate format. Use YYYY-MM-DD.",
            )
    else:
        target_date = ist_now().date()

    target_date_str = target_date.isoformat()
    start_dt = datetime.combine(target_date, datetime.min.time())
    end_dt = start_dt + timedelta(days=1)

    return target_date, target_date_str, start_dt, end_dt


async def _get_rm_closing_row(
    *,
    location_id: str,
    random_id: str,
    created_date: Optional[str],
) -> Optional[Dict[str, Any]]:
 
    _, target_date_str, start_dt, end_dt = _target_date_parts_rm(created_date)

    
    closing_doc = await warehouse_physical_stock_closing_collection().find_one(

        {
            "locationId": location_id,
            "randomId": random_id,
            "status": "pendingapproval",
        },
        sort=[("updatedAt", -1), ("createdAt", -1), ("date", -1)],
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


async def _sync_rm_inventory_stock_from_closing(
    *,
    inventory_col,
    location_id: str,
    random_id: str,
    updated_current_system: float,
    physical_closing: float,
    approved_by: str,
    purchase_doc: Dict[str, Any],
    variance: float,
    adjustment_mode: str,
    now: datetime,
    tenant_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
):

    update_doc = {
        "$set": {
            "previousSystemStock": updated_current_system,

            # Latest approved physical stock
            "physicalStock": physical_closing,

            # Variance cleared after approval
            "variance": 0,
            "status": "approved",

            "updatedAt": now,
            "lastUpdatedBy": approved_by,
            "tenantId": tenant_id or "",
            "idempotencyKey": idempotency_key or "",
        },
        "$unset": {
            "lastApprovedClosingDate": "",
            "lastApprovedClosingDocId": "",
            "lastApprovedSource": "",
        },
        "$setOnInsert": {
            "locationId": location_id,
            "randomId": random_id,
            "adjustmentQty": 0,
            "createdAt": now,
            "createdBy": approved_by,
            "isInitialStock": False,
            "itemType": purchase_doc.get("itemType", ""),
        }
    }

    if adjustment_mode == "ADJUST_SYSTEM":
        update_doc["$inc"] = {
            "systemStock": variance
        }
        # physicalClosing is recorded in the audit log.

    return await inventory_col.update_one(
        {
            "locationId": location_id,
            "randomId": random_id,
        },
        update_doc,
        upsert=True,
    )


async def _prefetch_rm_docs(
    *,
    location_id: str,
    random_ids: List[str],
    created_date: Optional[str],
) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    clean_ids = [r for r in {str(r or "").strip() for r in random_ids} if r]
    if not clean_ids:
        return {}, {}

    _, target_date_str, start_dt, end_dt = _target_date_parts_rm(created_date)

    purchase_docs, closing_docs = await asyncio.gather(
        purchaseitem_collection().find({"randomId": {"$in": clean_ids}}).to_list(None),
        warehouse_physical_stock_closing_collection()
        .find(
            {
                "locationId": location_id,
                "randomId": {"$in": clean_ids},
                "status": "pendingapproval",
            },
            sort=[("updatedAt", -1), ("createdAt", -1), ("date", -1)],
        )
        .to_list(None),
    )

    purchase_map = {
        str(d.get("randomId") or "").strip(): d for d in purchase_docs
    }

    closing_map: Dict[str, Dict[str, Any]] = {}
    for d in closing_docs:
        rid = str(d.get("randomId") or "").strip()
        if rid and rid not in closing_map:
            closing_map[rid] = {
                "closingDocId": str(d.get("_id")),
                "updatedCurrentSystem": d.get("systemStock"),
                "physicalClosing": d.get("physicalStock"),
                "variance": d.get("variance"),
                "closingStatus": d.get("status"),
                "closingDate": d.get("date") or target_date_str,
            }

    return purchase_map, closing_map


from db.collections import (
    approvedstocks_rm_collection,
    closingstocks_rm_collection,
    warehouse_physical_stock_closing_collection,
    grn_collection,
    inventory_stock_collection,
    purchaseitem_collection,
    storeDispatch_collection,
    warehouse_return_collection,
    purchase_uom_collection,
    get_stock_updates_collection, # Ensure this is imported
)

from db.collections import (
    approvedstocks_rm_collection,
    closingstocks_rm_collection,
    warehouse_physical_stock_closing_collection,
    grn_collection,
    inventory_stock_collection,
    purchaseitem_collection,
    storeDispatch_collection,
    warehouse_return_collection,
    purchase_uom_collection,
    get_stock_updates_collection, # Ensure this is imported from db.collections
)

from db.collections import (
    approvedstocks_rm_collection,
    closingstocks_rm_collection,
    warehouse_physical_stock_closing_collection,
    grn_collection,
    inventory_stock_collection,
    purchaseitem_collection,
    storeDispatch_collection,
    warehouse_return_collection,
    purchase_uom_collection,
    get_stock_updates_collection, 
)

async def _approve_one_rm_closing_item(
    *,
    random_id: str,
    location_id: str,
    approved_by: str,
    description: str,
    created_date: Optional[str],
    adjustment_mode: str = "ADJUST_SYSTEM",
    tenant_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    _purchase_doc: Optional[Dict[str, Any]] = None,
    _closing_row: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    
    purchase_col = purchaseitem_collection()
    inventory_col = inventory_stock_collection()
    approved_col = approvedstocks_rm_collection()
    history_col = get_stock_updates_collection()
    closing_col = warehouse_physical_stock_closing_collection()

    clean_random_id = str(random_id or "").strip()
    clean_location_id = str(location_id or "").strip()

    if not clean_random_id:
        return {
            "randomId": clean_random_id,
            "locationId": clean_location_id,
            "success": False,
            "approvalStatus": "invalid",
            "approvalButton": False,
            "message": "Invalid randomId.",
        }

    _, target_date_str, _, _ = _target_date_parts_rm(created_date)

    # 1. Fetch Purchase Item Doc
    purchase_doc = _purchase_doc
    if purchase_doc is None:
        purchase_doc = await purchase_col.find_one({"randomId": clean_random_id})
        
    if not purchase_doc:
        return {
            "randomId": clean_random_id,
            "locationId": clean_location_id,
            "success": False,
            "approvalStatus": "notAvailable",
            "approvalButton": False,
            "message": f"randomId {clean_random_id} not found in purchase item master.",
        }

    # 2. Fetch Pending Closing Row
    if _closing_row is not None:
        closing_row = _closing_row
    else:
        closing_row = await _get_rm_closing_row(
            location_id=clean_location_id,
            random_id=clean_random_id,
            created_date=target_date_str,
        )

    if not closing_row:
        return {
            "randomId": clean_random_id,
            "locationId": clean_location_id,
            "success": False,
            "approvalStatus": "notAvailable",
            "approvalButton": False,
            "message": "No warehouse closing stock found for selected date.",
        }

    # 3. Fetch UOM Precision
    uom_map = await get_uom_precision_map()
    uom_name = purchase_doc.get("uom", "")
    precision = uom_map.get(uom_name, 0)

    # Extract the physical count from the pending closure
    incoming_physical_stock = round_by_precision(safe_float(closing_row.get("physicalClosing")), precision)

    now = ist_now()

    # 4. Check if already approved
    already = await approved_col.find_one(
       {
        "locationId": clean_location_id,
        "randomId": clean_random_id,
        "closingDocId": closing_row.get("closingDocId"),
        "physicalClosing": incoming_physical_stock,
        "status": "approved",
       }
    )

 
    if already:

        closing_doc_id = closing_row.get("closingDocId")
        try:
            closing_object_id = ObjectId(closing_doc_id) if closing_doc_id else None
        except Exception:
            closing_object_id = None

        if closing_object_id:
            await closing_col.update_one(
                {"_id": closing_object_id},
                {"$set": {"status": "approved", "approvedAt": now, "approvedBy": approved_by}}
            )
        else:
            await closing_col.update_one(
                {
                    "randomId": clean_random_id,
                    "locationId": clean_location_id,
                    "status": "pendingapproval",
                },
                {"$set": {"status": "approved", "approvedAt": now, "approvedBy": approved_by}}
            )
        return {
            "randomId": clean_random_id,
            "locationId": clean_location_id,
            "success": True,
            "approvalStatus": "approved",
            "approvalButton": False,
            "message": "Already approved. Warehouse inventory stock synced successfully.",
            "approvalId": str(already.get("_id")),
            "updatedSystemStock": incoming_physical_stock,
            "varianceAfterApproval": 0,
            "inventoryUpdate": {"matchedCount": 0, "modifiedCount": 0, "upsertedId": None},
        }


    doc = await inventory_col.find_one(
        {
            "randomId": clean_random_id,
            "locationId": clean_location_id,
        }
    )

    system_stock_after = incoming_physical_stock
    inventory_update_result = None

    if adjustment_mode == "ADJUST_SYSTEM":
        if doc:
            current_system_stock = round_by_precision(doc.get("systemStock", 0), precision)
            current_physical_stock = round_by_precision(doc.get("physicalStock", 0), precision)
            approval_variance = round_by_precision(safe_float(closing_row.get("variance")), precision)
            adjustment_qty = approval_variance

            system_stock_after = round_by_precision(current_system_stock + approval_variance, precision)
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

            # 6. Save to Stock History Collection (Audit Log)
            await history_col.insert_one({
                "randomId": clean_random_id,
                "locationId": clean_location_id,
                "itemType": purchase_doc.get("itemType", ""),
                "beforeStock": current_physical_stock,
                "afterStock": incoming_physical_stock,
                "variance": approval_variance,
                "adjustmentQty": adjustment_qty,
                "isInitialStock": False,
                "status": "approved",
                "systemStockSo": doc.get("systemStockSo", 0),
                "physicalStockSo": doc.get("physicalStockSo", 0),
                "updatedAt": now,
                "action": "VARIANCE_APPROVAL_ADJUSTMENT",
                "updatedBy": approved_by,
                "description": description or "Stock adjusted based on physical variance approval",
                "tenantId": tenant_id or "",
                "idempotencyKey": idempotency_key or "",
            })
        else:
            # Fallback if inventory document doesn't exist yet
            update_data = {
                "randomId": clean_random_id,
                "locationId": clean_location_id,
                "itemType": purchase_doc.get("itemType", ""),
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
                {"randomId": clean_random_id, "locationId": clean_location_id},
                {"$set": update_data},
                upsert=True,
            )

            await history_col.insert_one({
                "randomId": clean_random_id,
                "locationId": clean_location_id,
                "itemType": purchase_doc.get("itemType", ""),
                "beforeStock": 0,
                "afterStock": incoming_physical_stock,
                "variance": incoming_physical_stock,
                "adjustmentQty": incoming_physical_stock,
                "isInitialStock": True,
                "status": "approved",
                "systemStockSo": 0,
                "physicalStockSo": 0,
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
            {
                "locationId": clean_location_id,
                "randomId": clean_random_id,
            },
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

    # 7. Create Approval Record
    variance_doc = {
        "randomId": clean_random_id,
        "itemName": purchase_doc.get("itemName", ""),
        "locationId": clean_location_id,
        "systemStockBefore": doc.get("systemStock", 0) if doc else incoming_physical_stock,
        "physicalClosing": incoming_physical_stock,
        "actualVariance": incoming_physical_stock - (doc.get("systemStock", 0) if doc else incoming_physical_stock),
        "systemStockAfter": system_stock_after,
        "status": "approved",
        "source": "WAREHOUSE_CLOSING",
        "closingDocId": closing_row.get("closingDocId"),
        "closingDate": target_date_str,
        "closingStatus": closing_row.get("closingStatus"),
        "approvedBy": approved_by,
        "description": description,
        "approvedAt": now,
        "tenantId": tenant_id or "",
        "idempotencyKey": idempotency_key or "",
    }
    insert_result = await approved_col.insert_one(variance_doc.copy())
    variance_doc["_id"] = str(insert_result.inserted_id)


    closing_doc_id = closing_row.get("closingDocId")
    try:
        closing_object_id = ObjectId(closing_doc_id) if closing_doc_id else None
    except Exception:
        closing_object_id = None

    if closing_object_id:
        await closing_col.update_one(
            {"_id": closing_object_id},
            {
                "$set": {
                    "status": "approved",
                    "approvedAt": now,
                    "approvedBy": approved_by,
                }
            }
        )
    else:
        # Fallback for legacy rows that somehow have no closingDocId.
        await closing_col.update_one(
            {
                "randomId": clean_random_id,
                "locationId": clean_location_id,
                "status": "pendingapproval",
            },
            {
                "$set": {
                    "status": "approved",
                    "approvedAt": now,
                    "approvedBy": approved_by,
                }
            }
        )

    final_physical_stock = incoming_physical_stock
    final_variance = 0.0
    final_system_stock = system_stock_after

    return {
        "randomId": clean_random_id,
        "locationId": clean_location_id,
        "success": True,
        "message": "Warehouse stock variance approved successfully",
        "data": {
            **variance_doc,
            "physicalClosing": final_physical_stock,
            "systemStockAfter": final_system_stock,
            "variance": final_variance,
            "actualVariance": variance_doc.get("actualVariance") # Keep the historical variance for the audit log
        },
        "updatedSystemStock": final_system_stock,
        "varianceAfterApproval": final_variance, # Should explicitly be 0 after approval
        "approvalStatus": "approved",
        "approvalButton": False,
        "status": "approved",
        "inventoryUpdate": {
            "matchedCount": inventory_update_result.matched_count if inventory_update_result else 0,
            "modifiedCount": inventory_update_result.modified_count if inventory_update_result else 0,
            "upsertedId": str(inventory_update_result.upserted_id) if inventory_update_result and inventory_update_result.upserted_id else None,
        },
    }


async def get_pending_rm_item_codes(
    location_id: str,
    query_date: Optional[date] = None,
) -> Dict[str, Any]:
    clean_location_id = str(location_id or "").strip()

    _, target_date_str, _, _ = _target_date_parts_rm(
        query_date.isoformat() if query_date else None
    )

    query = {
        "locationId": clean_location_id,
        "status": {"$in": ["pending", "variance", "pendingapproval"]},
    }

    cursor = warehouse_physical_stock_closing_collection().find(query, {"randomId": 1})

    docs = await cursor.to_list(None)

    item_codes = []
    for d in docs:
        rid = d.get("randomId")
        if rid:
            item_codes.append(rid)

    return {
        "locationId": clean_location_id,
        "date": target_date_str,
        "pendingRandomIds": item_codes,
        "count": len(item_codes),
    }


async def approve_all_warehouse_items(
    location_id: str,
    approved_by: str,
    description: str,
    created_date: Optional[str],
    adjustment_mode: str = "ADJUST_SYSTEM",
    tenant_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
):
    clean_location_id = str(location_id or "").strip()
    
    if not clean_location_id:
        raise HTTPException(status_code=400, detail="locationId is required")


    pending_data = await get_pending_rm_item_codes(
        location_id=clean_location_id,

        query_date=datetime.strptime(created_date, "%Y-%m-%d").date() if created_date else None
    )

    random_ids = pending_data.get("pendingRandomIds", [])

    if not random_ids:
        return {
            "message": "No pending items found for approval",
            "locationId": clean_location_id,
            "approvedCount": 0,
            "results": []
        }

    purchase_map, closing_map = await _prefetch_rm_docs(
        location_id=clean_location_id,
        random_ids=random_ids,
        created_date=created_date,
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
                    approved_by=approved_by,
                    description=description,
                    created_date=created_date,
                    adjustment_mode=adjustment_mode,
                    tenant_id=tenant_id,
                    idempotency_key=idempotency_key,
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
        "createdDate": created_date or ist_now().date().isoformat(),
        "totalRequested": len(random_ids),
        "approvedCount": approved_count,
        "noVarianceCount": no_variance_count,
        "notAvailableCount": not_available_count,
        "errorCount": error_count,
        "results": normalized_results,
    }

async def get_rm_closing_edit_history(
    *,
    location_id: str,
    random_id: str,
) -> Dict[str, Any]:
    clean_random_id = str(random_id or "").strip()
    clean_location_id = str(location_id or "").strip()


    closing_col = warehouse_physical_stock_closing_collection()

    docs = await closing_col.find(
        {
            "randomId": clean_random_id,
            "locationId": clean_location_id,
        },
        {
            "_id": 0,
            "randomId": 1,
            "locationId": 1,
            "physicalStock": 1,
            "variance": 1,
            "status": 1,
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

    if not docs:
        return {
            "randomId": clean_random_id,
            "locationId": clean_location_id,
            "physicalStock": None,
            "variance": None,
            "status": None,
            "history": [],
        }

    # Use the latest document as the current stock/status source.
    latest_doc = docs[0]

    # Find the newest matching document that actually contains edit history.
    history_doc = next(
        (
            doc
            for doc in docs
            if isinstance(doc.get("editHistory"), list)
            and len(doc.get("editHistory")) > 0
        ),
        latest_doc,
    )

    raw_history = history_doc.get("editHistory") or []
    history = []

    for h in raw_history:
        if not isinstance(h, dict):
            continue

        edited_at = h.get("editedAt")

        history.append(
            {
                "previousPhysicalStock": safe_float(
                    h.get("previousPhysicalStock", 0)
                ),
                "revisedPhysicalStock": safe_float(
                    h.get("revisedPhysicalStock", 0)
                ),
                "previousVariance": safe_float(
                    h.get("previousVariance", 0)
                ),
                "revisedVariance": safe_float(
                    h.get("revisedVariance", 0)
                ),
                "editedBy": h.get("editedBy") or "",
                "reason": h.get("reason") or "",
                "editedAt": (
                    edited_at.strftime("%Y-%m-%d %H:%M:%S")
                    if isinstance(edited_at, datetime)
                    else str(edited_at or "")
                ),
            }
        )

    return {
        "randomId": clean_random_id,
        "locationId": clean_location_id,
        "physicalStock": safe_float(latest_doc.get("physicalStock", 0)),
        "variance": safe_float(latest_doc.get("variance", 0)),
        "status": latest_doc.get("status"),
        "history": history,
    }