EXCLUDED_FIELDS = {
    "systemStock",
    "physicalStock",
    "systemStockSo",
    "physicalStockSo",
    "previousSystemStock",
    "variance",
}

def round_all_numbers(data, parent_key=None):
    """
    Recursively rounds numeric values except excluded stock fields.
    """

    if isinstance(data, dict):
        return {
            key: round_all_numbers(value, key)
            for key, value in data.items()
        }

    elif isinstance(data, list):
        return [round_all_numbers(item, parent_key) for item in data]

    elif isinstance(data, float):
        if parent_key in EXCLUDED_FIELDS:
            return data  # keep full precision
        return round(data, 2)

    elif isinstance(data, int):
        return data  # keep as int (or return float(data) if desired)

    return data


#ALL floats everywhere automatically,

def force_float_conversion(data):
    if isinstance(data, dict):
        return {k: force_float_conversion(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [force_float_conversion(i) for i in data]
    elif isinstance(data, int):
        return float(data)
    return data




from typing import Dict
from fastapi import HTTPException
from db.collections import uom_collection

# Cache to avoid DB hit every time
_uom_precision_cache: Dict[str, int] = {}


async def get_uom_precision(uom_id: str) -> int:
    """
    Fetch precision for UOM.
    Uses in-memory cache to reduce DB calls.
    """
    if not uom_id:
        return 2

    if uom_id in _uom_precision_cache:
        return _uom_precision_cache[uom_id]

    uom = await uom_collection().find_one({"uomId": uom_id})
    if not uom:
        precision = 2
    else:
        precision = uom.get("precision", 2)

    _uom_precision_cache[uom_id] = precision
    return precision


def apply_precision(value: float, precision: int) -> float:
    """
    Round value based on precision
    """
    return round(float(value), precision)


def validate_precision(value: float, precision: int, item_code: str):
    """
    Optional validation for decimal restriction
    """
    if precision == 0 and not float(value).is_integer():
        raise HTTPException(
            status_code=400,
            detail=f"{item_code} does not allow decimal stock (Precision 0)"
        )


async def normalize_stock(item: dict, stock_value: float, validate: bool = False) -> float:
    """
    Master reusable function for stock normalization.
    Fetches UOM → gets precision → rounds stock.
    """

    uom_id = item.get("item_Uom") or item.get("variance_Uom")
    precision = await get_uom_precision(uom_id)

    if validate:
        validate_precision(stock_value, precision, item.get("itemCode"))

    return apply_precision(stock_value, precision)




async def format_stock_for_response(item: dict, stock_value: float) -> float:
    """
    Format stock value based on UOM precision (for GET responses)
    """
    uom_id = item.get("item_Uom") or item.get("variance_Uom")
    precision = await get_uom_precision(uom_id)

    return round(float(stock_value or 0), precision)