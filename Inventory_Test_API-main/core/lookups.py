# core/lookups.py
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio as _asyncio
import re
import traceback
import unicodedata
from datetime import date, timedelta
from typing import Any, Dict, Optional
from core.search import matches_search, search_rank
from db.collections import (
    category_collection,
    subcategory_collection,
    uom_collection,
    closingstocks_collection,
    item_master_collection,
)
from core.cache import ProcessCache
from core.compute import safe_float


# ─────────────────────────────────────────────────────────────────────────────
# Display-name helpers ("Name (Group)" composite label)
# ─────────────────────────────────────────────────────────────────────────────

def format_display_name(name: Optional[str], group: Optional[str]) -> str:
    """Composite dropdown label: 'Butter Jam (Mix Jam)', or just the name if no group."""
    name = str(name or "")
    group = str(group or "").strip()
    return f"{name} ({group})" if group else name


def parse_display_name(value: Optional[str]) -> str:
    """Inverse of format_display_name: strips a trailing ' (Group)' suffix back to the raw name."""
    v = str(value or "")
    if " (" in v and v.endswith(")"):
        return v[: v.rfind(" (")].strip()
    return v


# ─────────────────────────────────────────────────────────────────────────────
# Search helpers
# ─────────────────────────────────────────────────────────────────────────────

def _clean_search_text(value: Optional[str]) -> str:
    """
    Clean user search input.

    Handles:
    - leading/trailing spaces
    - repeated spaces
    - special characters
    - mixed case
    """
    text = str(value or "")
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[^\w\s.\-/&()]", "", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _normalize_search_text(value: Any) -> str:
    """
    Normalize for search compare.

    Examples:
    - "Sub Blen"   -> "subblen"
    - "sub-blen"   -> "subblen"
    - "SUB   BLEN" -> "subblen"
    - "F.O Cake"   -> "focake"
    """
    text = str(value or "")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]", "", text)
    return text


def _split_selected_values(value: Optional[str]) -> list[str]:
    if not value:
        return []

    return [v.strip() for v in str(value).split(",") if v and v.strip()]


def _matches_prefix_search(
    option: Dict[str, Any],
    search_text: str,
) -> bool:
    # Name kept for existing callers - it is now "every word contained" search
    # (see core/search.py): trailing spaces ignored, any word order, matches
    # anywhere inside the name/id ("masala" -> "Chicken Masala").
    return matches_search(search_text, option.get("name"), option.get("id"))




def _sort_search_results(values: list[Dict[str, Any]], search_text: str) -> list[Dict[str, Any]]:

    cleaned = _clean_search_text(search_text)
    if not _normalize_search_text(cleaned):
        return sorted(values, key=lambda x: str(x.get("name") or "").lower())

    return sorted(
        values,
        key=lambda v: (
            search_rank(cleaned, v.get("name", ""), v.get("id", "")),
            _normalize_search_text(v.get("name", "")),
            _normalize_search_text(v.get("id", "")),
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Category map  {categoryId: categoryName}
# ─────────────────────────────────────────────────────────────────────────────

async def _load_category_map() -> Dict[str, str]:
    cursor = category_collection().find(
        {"status": "active"},
        {"categoryId": 1, "categoryName": 1},
    )
    docs = await cursor.to_list(None)

    return {
        str(d["categoryId"]): str(d.get("categoryName") or d["categoryId"])
        for d in docs
        if d.get("categoryId")
    }


async def get_category_map() -> Dict[str, str]:
    return await ProcessCache.get_or_set("category_map", _load_category_map)


async def invalidate_category_cache() -> None:
    await ProcessCache.invalidate("category_map")


# ─────────────────────────────────────────────────────────────────────────────
# Subcategory map  {subCategoryId: subCategoryName}
# ─────────────────────────────────────────────────────────────────────────────

async def _load_subcategory_map() -> Dict[str, str]:
    cursor = subcategory_collection().find(
        {"status": "active"},
        {"subCategoryId": 1, "subCategoryName": 1},
    )
    docs = await cursor.to_list(None)

    return {
        str(d["subCategoryId"]): str(d.get("subCategoryName") or d["subCategoryId"])
        for d in docs
        if d.get("subCategoryId")
    }


async def get_subcategory_map() -> Dict[str, str]:
    return await ProcessCache.get_or_set("subcategory_map", _load_subcategory_map)


async def invalidate_subcategory_cache() -> None:
    await ProcessCache.invalidate("subcategory_map")


# ─────────────────────────────────────────────────────────────────────────────
# UOM name map  {uomId: uomName}
# ─────────────────────────────────────────────────────────────────────────────

async def _load_uom_map() -> Dict[str, str]:
    cursor = uom_collection().find({}, {"uomId": 1, "uom": 1})
    docs = await cursor.to_list(None)

    return {
        str(d["uomId"]): str(d.get("uom") or d["uomId"])
        for d in docs
        if d.get("uomId")
    }

async def get_uom_map() -> Dict[str, str]:
    return await ProcessCache.get_or_set("uom_map", _load_uom_map)


async def invalidate_uom_cache() -> None:
    await ProcessCache.invalidate("uom_map")


# ─────────────────────────────────────────────────────────────────────────────
# UOM precision map  {uomId: precision}
# ─────────────────────────────────────────────────────────────────────────────

async def _load_uom_precision_map() -> Dict[str, int]:
    cursor = uom_collection().find({}, {"uomId": 1, "precision": 1})
    docs = await cursor.to_list(None)

    return {
        str(d["uomId"]): int(d.get("precision") or 0)
        for d in docs
        if d.get("uomId")
    }


async def get_uom_precision_map() -> Dict[str, int]:
    return await ProcessCache.get_or_set("uom_precision", _load_uom_precision_map)


# ─────────────────────────────────────────────────────────────────────────────
# Opening stock snapshot  {itemCode: systemStock}
# NOT cached globally — date-specific, fetched per-request
# ─────────────────────────────────────────────────────────────────────────────

async def get_opening_stock_map(
    location_id: str,
    query_date: Optional[date] = None,
) -> Dict[str, float]:
    """
    Opening stock is date-specific.

    Important:
    - If query_date is None, return empty opening map.
    - Do NOT default to today here.
    - Otherwise inventory GET without date will mix:
      opening = yesterday snapshot
      movements = all-time movements
      and that gives wrong stock.
    """
    try:
        if not query_date:
            return {}

        snapshot_str = (query_date - timedelta(days=1)).strftime("%Y-%m-%d")

        cursor = closingstocks_collection().find(
            {
                "locationId": location_id,
                "date": snapshot_str,
            },
            {
                "itemCode": 1,
                "systemStock": 1,
            },
        )
        docs = await cursor.to_list(None)

        return {
            str(d["itemCode"]): safe_float(d.get("systemStock", 0))
            for d in docs
            if d.get("itemCode")
        }

    except Exception:
        traceback.print_exc()
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Filter query
# ─────────────────────────────────────────────────────────────────────────────

def _build_filter_query(
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    item_name: Optional[str] = None,
    variance_name: Optional[str] = None,
    exclude_field: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Builds filter query for ItemMaster based list/export.

    Current dropdown contract:
    - category.id      = categoryId      -> ItemMaster.category
    - subCategory.id   = subCategoryId   -> ItemMaster.subCategory
    - itemName.id      = itemId          -> ItemMaster.itemId
    - varianceName.id  = itemCode        -> ItemMaster.itemCode
    """

    filters: Dict[str, Any] = {}

    def _add(field: str, value: Optional[str], mongo_field: str) -> None:
        if field == exclude_field:
            return

        vals = _split_selected_values(value)

        if vals:
            filters[mongo_field] = {"$in": vals}

    _add("category", category, "category")
    _add("subCategory", sub_category, "subCategory")
    _add("itemName", item_name, "itemId")
    _add("varianceName", variance_name, "itemCode")

    return filters


def _build_itemmaster_filter_query(
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    item_name: Optional[str] = None,
    variance_name: Optional[str] = None,
    exclude_field: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Builds filter query for ItemMaster dropdown source.

    Current dropdown contract:
    - itemName selected id = itemId
    - varianceName selected id = itemCode
    """

    filters: Dict[str, Any] = {
        "status": {"$in": ["active", "Active"]},
        "varianceStatus": {"$in": ["active", "Active"]},
    }

    def _add(field: str, value: Optional[str], mongo_field: str) -> None:
        if field == exclude_field:
            return

        vals = _split_selected_values(value)

        if vals:
            filters[mongo_field] = {"$in": vals}

    _add("category", category, "category")
    _add("subCategory", sub_category, "subCategory")
    _add("itemName", item_name, "itemId")
    _add("varianceName", variance_name, "itemCode")

    return filters


# ─────────────────────────────────────────────────────────────────────────────
# Filter options
# category / subCategory / itemName / varianceName
# ─────────────────────────────────────────────────────────────────────────────

async def get_filter_options(
    collection,
    field: str,
    page: int,
    limit: int,
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    item_name: Optional[str] = None,
    variance_name: Optional[str] = None,
    search: Optional[str] = None,
    category_map: Optional[Dict[str, str]] = None,
    subcategory_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Paginated, searchable filter options for a given field.

    Rules:
    - category comes from ItemMaster.category.
    - subCategory comes from ItemMaster.subCategory.
    - itemName comes from ItemMaster.itemName.
    - itemName id = ItemMaster.itemId.
    - itemName dropdown removes duplicates by itemId/itemName.
    - varianceName comes from ItemMaster.varianceName.
    - varianceName id = ItemMaster.itemCode.
    - Search returns full matching results without pagination.
    - Normal dropdown scroll uses page/limit pagination.
    - Search is prefix-only and normalized.
    """

    try:
        page = max(int(page or 1), 1)
        limit = max(int(limit or 20), 1)
    except Exception:
        page = 1
        limit = 20

    category_map = category_map or {}
    subcategory_map = subcategory_map or {}

    search_text = _clean_search_text(search)
    values: list[Dict[str, Any]] = []

    # ─────────────────────────────────────────────────────────────────────────
    # category
    # ─────────────────────────────────────────────────────────────────────────
    if field == "category":
        filter_query = _build_filter_query(
            category=category,
            sub_category=sub_category,
            item_name=item_name,
            variance_name=variance_name,
            exclude_field=field,
        )

        raw = await collection.distinct("category", filter=filter_query)

        values = [
            {
                "id": str(v),
                "name": category_map.get(str(v), str(v)),
            }
            for v in raw
            if v
        ]

        values.sort(key=lambda x: str(x.get("name") or "").lower())

    # ─────────────────────────────────────────────────────────────────────────
    # subCategory
    # ─────────────────────────────────────────────────────────────────────────
    elif field == "subCategory":
        filter_query = _build_filter_query(
            category=category,
            sub_category=sub_category,
            item_name=item_name,
            variance_name=variance_name,
            exclude_field=field,
        )

        raw = await collection.distinct("subCategory", filter=filter_query)

        values = [
            {
                "id": str(v),
                "name": subcategory_map.get(str(v), str(v)),
            }
            for v in raw
            if v
        ]

        values.sort(key=lambda x: str(x.get("name") or "").lower())

    # ─────────────────────────────────────────────────────────────────────────
    # itemName from ItemMaster
    # id = itemId
    # name = itemName
    # remove duplicate item rows caused by multiple variances
    # ─────────────────────────────────────────────────────────────────────────
    elif field == "itemName":
        master_query = _build_itemmaster_filter_query(
            category=category,
            sub_category=sub_category,
            item_name=item_name,
            variance_name=variance_name,
            exclude_field=field,
        )

        seen: set[tuple[str, str]] = set()

        cursor = (
            item_master_collection()
            .find(
                master_query,
                {
                    "itemId": 1,
                    "itemName": 1,
                },
            )
            .sort("itemName", 1)
        )

        async for doc in cursor:
            item_id = str(doc.get("itemId") or "").strip()
            item_name_value = str(doc.get("itemName") or "").strip()

            if not item_name_value:
                continue

            final_id = item_id or item_name_value

            key = (
                _normalize_search_text(final_id),
                _normalize_search_text(item_name_value),
            )

            if key in seen:
                continue

            seen.add(key)

            values.append(
                {
                    "id": final_id,
                    "name": item_name_value,
                }
            )

    # ─────────────────────────────────────────────────────────────────────────
    # varianceName from ItemMaster
    # id = itemCode
    # name = varianceName (itemName)  — e.g. "Butter Jam (Mix Jam)"
    # ─────────────────────────────────────────────────────────────────────────
    elif field == "varianceName":
        master_query = _build_itemmaster_filter_query(
            category=category,
            sub_category=sub_category,
            item_name=item_name,
            variance_name=variance_name,
            exclude_field=field,
        )

        seen: set[tuple[str, str]] = set()

        cursor = (
            item_master_collection()
            .find(
                master_query,
                {
                    "itemCode": 1,
                    "varianceName": 1,
                    "itemName": 1,
                },
            )
            .sort("varianceName", 1)
        )

        async for doc in cursor:
            item_code = str(doc.get("itemCode") or "").strip()
            variance_name_value = str(doc.get("varianceName") or "").strip()
            item_name_value = str(doc.get("itemName") or "").strip()

            if not item_code or not variance_name_value:
                continue

            key = (
                _normalize_search_text(item_code),
                _normalize_search_text(variance_name_value),
            )

            if key in seen:
                continue

            seen.add(key)

            # Display as "varianceName (itemName)" when itemName is available
            display_name = format_display_name(variance_name_value, item_name_value)

            values.append(
                {
                    "id": item_code,
                    "name": display_name,
                }
            )

    else:
        values = []


    if search_text:
        values = [v for v in values if _matches_prefix_search(v, search_text)]
        values = _sort_search_results(values, search_text)
    else:
        values.sort(key=lambda x: str(x.get("name") or "").lower())

    total = len(values)

    if search_text:
        paginated = values
        page_out = 1
        limit_out = total
        has_more = False
    else:
        start = (page - 1) * limit
        paginated = values[start : start + limit]
        page_out = page
        limit_out = limit
        has_more = total > start + limit

    return {
        "values": paginated,
        "total": total,
        "page": page_out,
        "limit": limit_out,
        "count": len(paginated),
        "searchFilter": search_text,
        "hasMore": has_more,
    }


async def get_all_filter_options(
    collection,
    category_map: Dict[str, str],
    subcategory_map: Dict[str, str],
    category: Optional[str],
    sub_category: Optional[str],
    item_name: Optional[str],
    variance_name: Optional[str],
    category_page: int,
    category_limit: int,
    category_search: Optional[str],
    sub_page: int,
    sub_limit: int,
    sub_search: Optional[str],
    item_name_page: int,
    item_name_limit: int,
    item_name_search: Optional[str],
    variance_page: int,
    variance_limit: int,
    variance_search: Optional[str],
) -> Dict[str, Any]:
    """
    Fetch all 4 filter option sets in a single asyncio.gather call.
    """

    _kwargs = dict(
        collection=collection,
        category=category,
        sub_category=sub_category,
        item_name=item_name,
        variance_name=variance_name,
        category_map=category_map,
        subcategory_map=subcategory_map,
    )

    results = await _asyncio.gather(
        get_filter_options(
            **_kwargs,
            field="category",
            page=category_page,
            limit=category_limit,
            search=category_search,
        ),
        get_filter_options(
            **_kwargs,
            field="subCategory",
            page=sub_page,
            limit=sub_limit,
            search=sub_search,
        ),
        get_filter_options(
            **_kwargs,
            field="itemName",
            page=item_name_page,
            limit=item_name_limit,
            search=item_name_search,
        ),
        get_filter_options(
            **_kwargs,
            field="varianceName",
            page=variance_page,
            limit=variance_limit,
            search=variance_search,
        ),
    )

    return {
        "category": results[0],
        "subCategory": results[1],
        "itemName": results[2],
        "varianceName": results[3],
    }