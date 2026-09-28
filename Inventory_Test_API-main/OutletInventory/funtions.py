import asyncio
import re
from typing import Any, List, Optional, Dict
from datetime import datetime, timedelta
from db.collections import category_collection, location_collection, subcategory_collection,uom_collection, warehouse_collection, uom_collection
from core.lookups import format_display_name
from core.search import matches_search, mongo_token_query

def build_mongo_filter_from_params(
    category: Optional[str] = None,
    subCategory: Optional[str] = None,
    itemName: Optional[str] = None,
    varianceName: Optional[str] = None,
    exclude_field: Optional[str] = None,
) -> Dict:
    filters = {}

    def add_filter(field: str, value: Optional[str]):
        if not value:
            return

        vals = [v.strip() for v in value.split(",") if v.strip()]
        if not vals:
            return

        # 🎯 varianceName → itemCode
        if field == "varianceName":
            filters["itemCode"] = {"$in": vals}

        # 🎯 itemName → subCategory
        elif field == "itemName":
            filters["subCategory"] = {"$in": vals}

        else:
            filters[field] = {"$in": vals}

    if exclude_field != "category":
        add_filter("category", category)

    if exclude_field != "subCategory":
        add_filter("subCategory", subCategory)

    if exclude_field != "itemName":
        add_filter("itemName", itemName)

    if exclude_field != "varianceName":
        add_filter("varianceName", varianceName)

    return filters


async def get_filter_field_options(
    collection,
    field: str,
    page: int,
    limit: int,
    category: Optional[str] = None,
    subCategory: Optional[str] = None,
    itemName: Optional[str] = None,
    varianceName: Optional[str] = None,
    search_filter: Optional[str] = None,
    category_map: Optional[Dict[str, str]] = None,
    subcategory_map: Optional[Dict[str, str]] = None,
) -> Dict:
    filter_query = build_mongo_filter_from_params(
        category=category,
        subCategory=subCategory,
        itemName=itemName,
        varianceName=varianceName,
        exclude_field=field,
    )

    values = []

    category_map = category_map or {}
    subcategory_map = subcategory_map or {}

    # 🔹 CATEGORY
    if field == "category":
        raw = await collection.distinct("category", filter=filter_query)
        for v in raw:
            if v:
                values.append(
                    {
                        "id": v,
                        "name": category_map.get(v),
                    }
                )

    # 🔹 SUBCATEGORY
    elif field == "subCategory":
        raw = await collection.distinct("subCategory", filter=filter_query)
        for v in raw:
            if v:
                values.append(
                    {
                        "id": v,
                        "name": subcategory_map.get(v),
                    }
                )

    # 🔹 ITEM NAME (COPY OF SUBCATEGORY)
    elif field == "itemName":
        raw = await collection.distinct("subCategory", filter=filter_query)
        for v in raw:
            if v:
                values.append(
                    {
                        "id": v,
                        "name": subcategory_map.get(v),
                    }
                )

    # 🔹 VARIANCE NAME
    elif field == "varianceName":
        cursor = collection.find(filter_query, {"itemCode": 1, "varianceName": 1, "itemName": 1})
        seen = set()
        async for doc in cursor:
            item_code = doc.get("itemCode")
            variance_name = doc.get("varianceName")
            item_name = doc.get("itemName")
            if (item_code, variance_name) in seen:
                continue
            seen.add((item_code, variance_name))

            if item_code and variance_name:
                display_name = format_display_name(variance_name, item_name)
                values.append(
                    {
                        "id": item_code,
                        "name": display_name,  # varianceName (itemName)
                    }
                )

    # 🔍 SEARCH ON NAME
    if search_filter and search_filter.strip():
        values = [
            v for v in values if matches_search(search_filter, v.get("name"), v.get("id"))
        ]

    total = len(values)
    start = (page - 1) * limit
    paginated = values[start : start + limit]

    return {
        "values": paginated,
        "total": total,
        "page": page,
        "limit": limit,
        "count": len(paginated),
        "searchFilter": search_filter,
        "hasMore": total > start + limit,
    }


def ist_now():
    return datetime.utcnow() + timedelta(hours=5, minutes=30)


def ist_yesterday():
    return ist_now() - timedelta(days=1)


async def build_category_map():
    cursor = category_collection().find({"status": "active"})
    return {
        c["categoryId"]: c["categoryName"] async for c in cursor if c.get("categoryId")
    }


async def build_subcategory_map():
    cursor = subcategory_collection().find({"status": "active"})
    return {
        s["subCategoryId"]: s["subCategoryName"]
        async for s in cursor
        if s.get("subCategoryId")
    }


async def build_uom_map():
    cursor = uom_collection().find({"status": "active"})
    return {
        u["uomId"]: u["uomName"] async for u in cursor if u.get("uomId")
    }


def _location_sort_key(item: Dict[str, Any]):
    location_id = str(item.get("locationId") or "").upper().strip()

    match = re.match(r"^([A-Z]+)(\d+)$", location_id)
    if match:
        prefix = match.group(1)
        number = int(match.group(2))
        return (prefix, number)

    return (location_id, 0)


async def _get_all_active_locations(
    page: Optional[int] = None,
    limit: Optional[int] = None,
    search: Optional[str] = None,
    apply_pagination: bool = False,
    include_warehouses: bool = True,
) -> List[Dict[str, Any]]:
    search_text = (search or "").strip()
    is_search = bool(search_text)

    active_status = {"$in": [1, "1", "active", "Active", "ACTIVE"]}

    branch_query: Dict[str, Any] = {
        "status": active_status,
        "type": {"$in": ["Branch", "branch"]},
    }

    warehouse_query: Dict[str, Any] = {
        "status": active_status,
        "type": {"$in": ["Main", "main"]},
    }

    if is_search:
        branch_query.update(
            mongo_token_query(search_text, ["branchName", "aliasName", "locationId"])
        )

        warehouse_query.update(
            mongo_token_query(
                search_text, ["warehouseName", "aliasName", "warehouseId", "locationId"]
            )
        )

    branches_cursor = location_collection().find(
        branch_query,
        {
            "_id": 0,
            "aliasName": 1,
            "branchName": 1,
            "locationName": 1,
            "locationId": 1,
        },
    )

    if include_warehouses:
        warehouses_cursor = warehouse_collection().find(
            warehouse_query,
            {
                "_id": 0,
                "aliasName": 1,
                "warehouseName": 1,
                "warehouseId": 1,
                "locationName": 1,
                "locationId": 1,
            },
        )

        branches, warehouses = await asyncio.gather(
            branches_cursor.to_list(None),
            warehouses_cursor.to_list(None),
        )
    else:
        branches = await branches_cursor.to_list(None)
        warehouses = []

    items = [
        {
            "aliasName": d.get("aliasName"),
            "locationName": d.get("branchName"),
            "locationId": d.get("locationId"),
            "locationType": "Branch",
        }
        for d in branches
    ] + [
        {
            "aliasName": d.get("aliasName"),
            "locationName": d.get("warehouseName") or d.get("locationName"),
            "locationId": d.get("warehouseId") or d.get("locationId"),
            "locationType": "Warehouse",
        }
        for d in warehouses
    ]

    items = [
        item
        for item in items
        if item.get("locationId") and item.get("locationName")
    ]

    seen_location_ids = set()
    unique_items: List[Dict[str, Any]] = []

    for item in items:
        location_id = str(item.get("locationId") or "").strip()
        if not location_id or location_id in seen_location_ids:
            continue

        seen_location_ids.add(location_id)
        unique_items.append(item)

    unique_items.sort(key=_location_sort_key)

    # Search = full matched result, no pagination.
    # Normal dropdown scroll = page + limit.
    if apply_pagination and not is_search:
        safe_page = page or 1
        safe_limit = limit or 30
        start = (safe_page - 1) * safe_limit
        end = start + safe_limit
        unique_items = unique_items[start:end]

    return unique_items