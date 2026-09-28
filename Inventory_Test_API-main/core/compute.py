"""
core/compute.py
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterator, Optional, Tuple

# ── UOM constants ─────────────────────────────────────────────────────────────
_KG_UOMS: frozenset[str] = frozenset({"kg", "kgs", "kilogram", "kilograms"})
KG_UOM_LIST = list(_KG_UOMS)


def is_kg_uom(uom: Any) -> bool:
    if not uom:
        return False
    return str(uom).strip().lower() in _KG_UOMS


# ── Numeric helpers ───────────────────────────────────────────────────────────
def safe_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, float):
        return value
    if isinstance(value, int):
        return float(value)
    if value is None:
        return default
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return default
        try:
            return float(s)
        except ValueError:
            return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def round_qty(value: Any, precision: int) -> float:
    if value is None:
        return 0.0
    return round(safe_float(value), precision)


def calculate_variance(system_stock: float, physical_stock: float) -> float:
    return round(physical_stock - system_stock, 10)


# ── String / key helpers ──────────────────────────────────────────────────────
def normalize_key(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, dict):
        value = value.get("name", "")
    if isinstance(value, str):
        return value.strip().upper()
    s = str(value).strip()
    return s.upper() if s else ""


# ── Date helpers ──────────────────────────────────────────────────────────────
def daterange(start: date, end: date) -> Iterator[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def day_bounds_naive(d: date) -> Tuple[datetime, datetime]:
    return (
        datetime(d.year, d.month, d.day, 0, 0, 0),
        datetime(d.year, d.month, d.day, 23, 59, 59, 999000),
    )


def day_bounds_utc(d: date) -> Tuple[datetime, datetime]:
    return (
        datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=timezone.utc),
        datetime(d.year, d.month, d.day, 23, 59, 59, 999000, tzinfo=timezone.utc),
    )


def ist_now() -> datetime:
    return datetime.utcnow() + timedelta(hours=5, minutes=30)


def ist_yesterday() -> datetime:
    return ist_now() - timedelta(days=1)


# ── Qty selector (KG-aware) ───────────────────────────────────────────────────
def pick_qty(qty: Any, weight: Any, uom: Any) -> float:
    return safe_float(weight) if is_kg_uom(uom) else safe_float(qty)


# ── Stock movement formula ────────────────────────────────────────────────────
def compute_system_closing(
    opening: float,
    received: float,
    transfer_in: float,
    transfer_out: float,
    sales: float,
    sales_return: float,
    wastage_received: float,
    wastage_return: float,
) -> float:
    return (
        opening
        + received
        + transfer_in
        - transfer_out
        - sales
        + sales_return
        - wastage_received
        - wastage_return
    )


# ── Result builder ────────────────────────────────────────────────────────────
_QTY_FIELDS: Tuple[str, ...] = (
    "openingStockQty",
    "receivedQty",
    "stockTransferInQty",
    "stockTransferOutQty",
    "salesQty",
    "salesReturnQty",
    "wastageReceivedQty",
    "wastageReturnQty",
    "closingStockQty",
    "updatedCurrentSystemQty",
)


def apply_precision(result: Dict[str, Any], precision: int) -> None:
    for f in _QTY_FIELDS:
        v = result.get(f)
        if isinstance(v, (int, float)):
            result[f] = round_qty(v, precision)


def build_item_skeleton(
    raw: Dict[str, Any],
    category_map: Dict[str, str],
    subcategory_map: Dict[str, str],
    precision: int,
    opening_stock: float,
) -> Dict[str, Any]:
    item_code = raw.get("itemCode")
    variance_name = raw.get("varianceName")
    category_id = raw.get("category")
    subcategory_id = raw.get("subCategory")

    return {
        "id": str(raw["_id"]),
        "itemCode": item_code,
        "uomPrecision": precision,
        "category": {"id": category_id, "name": category_map.get(category_id)},
        "subCategory": {
            "id": subcategory_id,
            "name": subcategory_map.get(subcategory_id),
        },
        "itemName": {"id": subcategory_id, "name": subcategory_map.get(subcategory_id)},
        "varianceName": {"id": item_code, "name": variance_name},
        "openingStockQty": round_qty(opening_stock, precision),
        "receivedQty": 0.0,
        "stockTransferInQty": 0.0,
        "stockTransferOutQty": 0.0,
        "salesQty": 0.0,
        "salesReturnQty": 0.0,
        "wastageReceivedQty": 0.0,
        "wastageReturnQty": 0.0,
        "closingStockQty": 0.0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# UPDATED apply_movements
# ─────────────────────────────────────────────────────────────────────────────
def apply_movements(
    result: Dict[str, Any],
    dispatch_map: Optional[Dict[str, Any]],  # Changed: Now accepts Optional Dict
    sales_map: Optional[Dict[str, Any]],
    sr_map: Optional[Dict[str, Any]],
    warehouse_map: Optional[Dict[str, Any]],
    wastage_map: Optional[Dict[str, Any]],
    transfer_map: Optional[Dict[str, Any]],
) -> None:

    # ── Received (dispatch) ──────────────────────────────────────────────────
    # dispatch_map is now the VALUE (dict) or None
    if dispatch_map and isinstance(dispatch_map, dict):
        result["receivedQty"] = safe_float(dispatch_map.get("dispatchedQty"))
    else:
        result["receivedQty"] = 0.0

    # ── Sales ────────────────────────────────────────────────────────────────
    if sales_map and isinstance(sales_map, dict):
        result["salesQty"] = safe_float(sales_map.get("salesQty"))
    else:
        result["salesQty"] = 0.0

    # ── Sales Return ─────────────────────────────────────────────────────────
    # sr_map is the specific dict or None
    if sr_map and isinstance(sr_map, dict):
        result["salesReturnQty"] = safe_float(sr_map.get("returnQty"))
    else:
        result["salesReturnQty"] = 0.0

    # ── Warehouse return ─────────────────────────────────────────────────────
    # FIX: Removed .strip().upper() logic that caused crash on NoneType
    if warehouse_map and isinstance(warehouse_map, dict):
        result["wastageReceivedQty"] = safe_float(
            warehouse_map.get("warehouseReturnQty")
        )
    else:
        result["wastageReceivedQty"] = 0.0

    # ── Wastage return ───────────────────────────────────────────────────────
    if wastage_map and isinstance(wastage_map, dict):
        result["wastageReturnQty"] = safe_float(wastage_map.get("wastageReturnQty"))
    else:
        result["wastageReturnQty"] = 0.0

    # ── Stock transfer ───────────────────────────────────────────────────────
    if transfer_map and isinstance(transfer_map, dict):
        result["stockTransferInQty"] = safe_float(transfer_map.get("transferInQty"))
        result["stockTransferOutQty"] = safe_float(transfer_map.get("transferOutQty"))
    else:
        result["stockTransferInQty"] = 0.0
        result["stockTransferOutQty"] = 0.0

    # ── Closing (calculated) ─────────────────────────────────────────────────
    result["closingStockQty"] = compute_system_closing(
        opening=result["openingStockQty"],
        received=result["receivedQty"],
        transfer_in=result["stockTransferInQty"],
        transfer_out=result["stockTransferOutQty"],
        sales=result["salesQty"],
        sales_return=result["salesReturnQty"],
        wastage_received=result["wastageReceivedQty"],
        wastage_return=result["wastageReturnQty"],
    )


def apply_inventory_doc(
    result: Dict[str, Any],
    inv_doc: Optional[Dict[str, Any]],
    precision: int,
    query_date: Optional[date],
) -> None:

    if not inv_doc:
        result.update(
            {
                "updatedCurrentSystemQty": 0.0,
                "physicalClosingQty": "-",
                "stockVariance": "-",
                "approvalStatus": "Not Available",
                "approveButton": False,
                "lastUpdated": "-",
            }
        )
        return

    system_stock = safe_float(inv_doc.get("systemStock", 0))
    physical_stock = safe_float(inv_doc.get("physicalStock", 0))
    variance_val = safe_float(inv_doc.get("variance", 0))
    status = inv_doc.get("status", "pending") or "pending"
    updated_at = inv_doc.get("updatedAt")

    # ── Always set system stock (NO DATE CHECK)
    result["updatedCurrentSystemQty"] = round_qty(system_stock, precision)

    # ── Handle date logic for rest
    updated_today = False
    last_updated = "-"

    if updated_at:
        if isinstance(updated_at, datetime):
            last_updated = updated_at.strftime("%Y-%m-%d %H:%M:%S")
            updated_today = (updated_at.date() == query_date) if query_date else True
        elif isinstance(updated_at, str):
            try:
                dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                last_updated = dt.strftime("%Y-%m-%d %H:%M:%S")
                updated_today = (dt.date() == query_date) if query_date else True
            except ValueError:
                pass

    if not updated_today:
        result.update(
            {
                "physicalClosingQty": "-",
                "stockVariance": "-",
                "approvalStatus": "Not Available",
                "approveButton": False,
                "lastUpdated": last_updated,
            }
        )
        return

    # ── If same date → show full data
    result.update(
        {
            "physicalClosingQty": round_qty(physical_stock, precision),
            "stockVariance": round_qty(variance_val, precision),
            "approvalStatus": status.capitalize(),
            "approveButton": variance_val != 0 and status.lower() != "approved",
            "lastUpdated": last_updated,
        }
    )
