import re
from typing import Optional
from bson import Regex

from core.lookups import format_display_name, parse_display_name

from core.search import matches_search
def exact_regex_list(values):
    return [Regex(f"^{re.escape(v)}$", "i") for v in values]


def build_stock_history(
    *,
    randomId,
    locationId,
    itemType,
    before_stock,
    after_stock,
    action,
    updatedBy,
    description,
    now,    
    systemStockSo=0,
    physicalStockSo=0,
):
    return {
        "randomId": randomId,
        "locationId": locationId,
        "itemType": itemType,
        "beforeStock": before_stock,
        "afterStock": after_stock,
        "variance": after_stock - before_stock,
        "systemStockSo": systemStockSo,
        "physicalStockSo": physicalStockSo,
        "action": action,
        "updatedBy": updatedBy,
        "description": description,
        "updatedAt": now,
    }


# BIDIRECTIONAL DROPDOWN HELPER
async def get_filter_options(
    collection,
    target_field: str,
    page: int,
    limit: int,
    search: Optional[str],
    selected: Optional[str],
    active_filters: dict,
) -> dict:

    base_filter = {}

    field_map = {
        "purchasecategoryName": "purchasecategoryName",
        "purchasesubcategoryName": "purchasesubcategoryName",
        "itemgroupName": "itemgroupName",
        "itemName": "itemName",
    }

    for param, db_key in field_map.items():
        if param == target_field:
            continue

        value = active_filters.get(param)
        if not value:
            continue

        raw_items = [v.strip() for v in value.split(",") if v.strip()]

        # ---- Subcategory: exact + NULL logic ----
        if db_key == "purchasesubcategoryName":
            has_null = any(v.lower() == "null" for v in raw_items)
            non_null_items = [v for v in raw_items if v.lower() != "null"]

            exact_regex = exact_regex_list(non_null_items)

            null_conditions = [
                {"purchasesubcategoryName": None},
                {"purchasesubcategoryName": ""},
                {"purchasesubcategoryName": {"$regex": "^null$", "$options": "i"}},
            ]

            if non_null_items and has_null:
                base_filter[db_key] = {
                    "$or": [
                        {db_key: {"$in": exact_regex}},
                        *null_conditions,
                    ]
                }
            elif non_null_items:
                base_filter[db_key] = {"$in": exact_regex}
            elif has_null:
                base_filter[db_key] = {"$or": null_conditions}

        # ---- All other fields: EXACT MATCH ----
        else:
            if db_key == "itemName":
                parsed_items = [parse_display_name(v) for v in raw_items]
                base_filter[db_key] = {"$in": exact_regex_list(parsed_items)}
            else:
                base_filter[db_key] = {"$in": exact_regex_list(raw_items)}

    # Fetch only target field
    if target_field == "itemName":
        cursor = collection.find(base_filter or {}, {"itemName": 1, "itemgroupName": 1})
        raw_values = set()
        async for doc in cursor:
            v_var = str(doc.get("itemName") or "").strip()
            v_grp = str(doc.get("itemgroupName") or "").strip()
            if not v_var:
                continue
            raw_values.add(format_display_name(v_var, v_grp))
    else:
        cursor = collection.find(base_filter or {}, {target_field: 1})
        raw_values = set()
        async for doc in cursor:
            val = doc.get(target_field)
            if val:
                if isinstance(val, str):
                    for v in val.split(","):
                        v_clean = " ".join(v.strip().split())
                        if v_clean:
                            raw_values.add(v_clean)
                else:
                    raw_values.add(str(val).strip())

    # Sort
    options = sorted(raw_values, key=str.lower)

    # Search filter
    if search and search.strip():
        options = [o for o in options if matches_search(search, o)]

    # Pagination
    total = len(options)
    start = (page - 1) * limit
    paginated = options[start : start + limit]

    return {
        "values": paginated,
        "total": total,
        "page": page,
        "limit": limit,
        "count": len(paginated),
        "searchFilter": search or "",
        "hasMore": start + limit < total,
    }
