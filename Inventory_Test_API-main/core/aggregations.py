from __future__ import annotations

import asyncio
import traceback
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from db.collections import (
    dispatch_collection,
    get_salesreturn_collection,
    invoices_collection,
    stock_transfer_collection,
    warehouse_return_collection,
    wastage_entry_collection,
    closingstocks_collection,
)
from core.compute import KG_UOM_LIST, safe_float


def _get_utc_bounds_ist(target_date: date):

    local_midnight = datetime(target_date.year, target_date.month, target_date.day)
    utc_start = local_midnight - timedelta(hours=5, minutes=30)
    utc_end = utc_start + timedelta(days=1)
    return utc_start, utc_end


def _get_utc_range_bounds_ist(from_date: date, to_date: date):
    start_utc, _ = _get_utc_bounds_ist(from_date)
    _, end_utc = _get_utc_bounds_ist(to_date)
    return start_utc, end_utc


def _to_double(expr: Any) -> Dict[str, Any]:
    return {
        "$convert": {
            "input": expr,
            "to": "double",
            "onError": 0,
            "onNull": 0,
        }
    }


def _date_strs(from_date: date, to_date: date) -> List[str]:
    total_days = (to_date - from_date).days
    return [(from_date + timedelta(days=i)).isoformat() for i in range(total_days + 1)]



async def get_dispatch_map(
    branch: str,
    query_date: Optional[date] = None,
) -> Dict[str, Dict]:
    try:
        match_query: Dict[str, Any] = {"locationId": branch}

        if query_date:
            start, end = _get_utc_bounds_ist(query_date)
            match_query["date"] = {"$gte": start, "$lt": end}

        pipeline = [
            {"$match": match_query},
            {
                "$project": {
                    "date": 1,
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$varianceName", []]},
                                {"$ifNull": ["$receivedQty", []]},
                                {"$ifNull": ["$receivedWeight", []]},
                                {"$ifNull": ["$uom", []]},
                                {"$ifNull": ["$itemCode", []]},
                            ]
                        }
                    },
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "date": 1,
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 4]}, ""]
                                }
                            }
                        }
                    },
                    "rec_qty": {"$arrayElemAt": ["$items", 1]},
                    "rec_wgt": {"$arrayElemAt": ["$items", 2]},
                    "uom": {
                        "$toLower": {
                            "$ifNull": [{"$arrayElemAt": ["$items", 3]}, ""]
                        }
                    },
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$addFields": {
                    "finalQty": {
                        "$cond": [
                            {"$in": ["$uom", KG_UOM_LIST]},
                            _to_double("$rec_wgt"),
                            _to_double("$rec_qty"),
                        ]
                    }
                }
            },
            {"$match": {"finalQty": {"$ne": 0}}},
            {
                "$group": {
                    "_id": "$itemCode",
                    "dispatchedQty": {"$sum": "$finalQty"},
                    "lastUpdate": {"$max": "$date"},
                }
            },
        ]

        docs = await dispatch_collection().aggregate(pipeline).to_list(None)
        return {
            doc["_id"]: {
                "dispatchedQty": float(doc.get("dispatchedQty", 0.0)),
                "lastUpdate": doc.get("lastUpdate"),
            }
            for doc in docs
            if doc.get("_id")
        }
    except Exception:
        traceback.print_exc()
        return {}





async def get_sales_map(
    branch: str,
    query_date: Optional[date] = None,
) -> Dict[str, Dict]:
    try:
        match_query: Dict[str, Any] = {"locationId": branch}

        if query_date:
            start, end = _get_utc_bounds_ist(query_date)
            match_query["invoiceDateTime"] = {"$gte": start, "$lt": end}

        pipeline = [
            {"$match": match_query},
            {
                "$project": {
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$varianceitemCode", []]},
                                {"$ifNull": ["$varianceName", []]},
                                {"$ifNull": ["$qty", []]},
                                {"$ifNull": ["$weight", []]},
                                {"$ifNull": ["$uom", []]},
                            ]
                        }
                    }
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "varianceName": {"$arrayElemAt": ["$items", 1]},
                    "qty": {"$arrayElemAt": ["$items", 2]},
                    "weight": {"$arrayElemAt": ["$items", 3]},
                    "uom": {
                        "$toLower": {
                            "$ifNull": [{"$arrayElemAt": ["$items", 4]}, ""]
                        }
                    },
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$addFields": {
                    "finalQty": {
                        "$cond": [
                            {"$in": ["$uom", KG_UOM_LIST]},
                            _to_double("$weight"),
                            _to_double("$qty"),
                        ]
                    }
                }
            },
            {"$match": {"finalQty": {"$ne": 0}}},
            {
                "$group": {
                    "_id": "$itemCode",
                    "salesQty": {"$sum": "$finalQty"},
                    "varianceName": {"$first": "$varianceName"},
                }
            },
        ]

        docs = await invoices_collection().aggregate(pipeline).to_list(None)
        return {
            doc["_id"]: {
                "salesQty": float(doc.get("salesQty", 0.0)),
                "varianceName": doc.get("varianceName"),
            }
            for doc in docs
            if doc.get("_id")
        }
    except Exception:
        traceback.print_exc()
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Sales Return
# ─────────────────────────────────────────────────────────────────────────────


async def get_sales_return_map(
    branch: str,
    query_date: Optional[date] = None,
) -> Dict[str, Dict]:
    try:
        match_query: Dict[str, Any] = {
            "locationId": branch,
            "salesType": "salesReturn",
        }

        if query_date:
            # returnDateTime appears to be string in your old logic.
            # Keep string-date matching safely.
            match_query["returnDateTime"] = {"$regex": f"^{query_date.isoformat()}"}

        pipeline = [
            {"$match": match_query},
            {
                "$project": {
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$varianceitemCode", []]},
                                {"$ifNull": ["$itemName", []]},
                                {"$ifNull": ["$varianceName", []]},
                                {"$ifNull": ["$price", []]},
                                {"$ifNull": ["$weight", []]},
                                {"$ifNull": ["$qty", []]},
                                {"$ifNull": ["$uom", []]},
                            ]
                        }
                    }
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "varianceName": {"$arrayElemAt": ["$items", 2]},
                    "weight": _to_double({"$arrayElemAt": ["$items", 4]}),
                    "qty": _to_double({"$arrayElemAt": ["$items", 5]}),
                    "uom": {
                        "$toLower": {
                            "$ifNull": [{"$arrayElemAt": ["$items", 6]}, ""]
                        }
                    },
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$addFields": {
                    "finalQty": {
                        "$cond": [
                            {"$in": ["$uom", KG_UOM_LIST]},
                            "$weight",
                            "$qty",
                        ]
                    }
                }
            },
            {"$match": {"finalQty": {"$ne": 0}}},
            {
                "$group": {
                    "_id": "$itemCode",
                    "returnQty": {"$sum": "$finalQty"},
                    "originalVarianceName": {"$first": "$varianceName"},
                }
            },
        ]

        docs = await get_salesreturn_collection().aggregate(pipeline).to_list(None)
        return {
            doc["_id"].upper(): {
                "returnQty": float(doc.get("returnQty", 0.0)),
                "originalVarianceName": doc.get("originalVarianceName"),
            }
            for doc in docs
            if doc.get("_id")
        }
    except Exception:
        traceback.print_exc()
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Warehouse Return
# ─────────────────────────────────────────────────────────────────────────────


async def get_warehouse_return_map(
    branch: str,
    query_date: Optional[date] = None,
) -> Dict[str, Dict]:
    try:
        match_query: Dict[str, Any] = {"locationId": branch}

        if query_date:
            start_dt, end_dt = _get_utc_bounds_ist(query_date)
            match_query["date"] = {"$gte": start_dt, "$lt": end_dt}

        pipeline = [
            {"$match": match_query},
            {
                "$project": {
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$itemCode", []]},
                                {"$ifNull": ["$uom", []]},
                                {"$ifNull": ["$receivedqty", []]},
                                {"$ifNull": ["$receivedweight", []]},
                            ]
                        }
                    }
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "uom": {
                        "$toLower": {
                            "$ifNull": [{"$arrayElemAt": ["$items", 1]}, ""]
                        }
                    },
                    "receivedQty": _to_double({"$arrayElemAt": ["$items", 2]}),
                    "receivedWeight": _to_double({"$arrayElemAt": ["$items", 3]}),
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$addFields": {
                    "finalQty": {
                        "$cond": [
                            {"$in": ["$uom", KG_UOM_LIST]},
                            "$receivedWeight",
                            "$receivedQty",
                        ]
                    }
                }
            },
            {"$match": {"finalQty": {"$ne": 0}}},
            {
                "$group": {
                    "_id": "$itemCode",
                    "warehouseReturnQty": {"$sum": "$finalQty"},
                }
            },
        ]

        docs = await warehouse_return_collection().aggregate(pipeline).to_list(None)
        return {
            doc["_id"]: {"warehouseReturnQty": float(doc.get("warehouseReturnQty", 0))}
            for doc in docs
            if doc.get("_id")
        }
    except Exception:
        traceback.print_exc()
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Wastage Return
# ─────────────────────────────────────────────────────────────────────────────


async def get_wastage_return_map(
    branch: str,
    query_date: Optional[date] = None,
) -> Dict[str, Dict]:
    try:
        match_query: Dict[str, Any] = {"locationId": branch}

        if query_date:
            start_dt, end_dt = _get_utc_bounds_ist(query_date)
            match_query["date"] = {"$gte": start_dt, "$lt": end_dt}

        pipeline = [
            {"$match": match_query},
            {
                "$project": {
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$itemCode", []]},
                                {"$ifNull": ["$receivedqty", []]},
                                {"$ifNull": ["$receivedweight", []]},
                                {"$ifNull": ["$uom", []]},
                            ]
                        }
                    }
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "receivedQty": _to_double({"$arrayElemAt": ["$items", 1]}),
                    "receivedWeight": _to_double({"$arrayElemAt": ["$items", 2]}),
                    "uom": {
                        "$toLower": {
                            "$ifNull": [{"$arrayElemAt": ["$items", 3]}, ""]
                        }
                    },
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$addFields": {
                    "finalQty": {
                        "$cond": [
                            {"$in": ["$uom", KG_UOM_LIST]},
                            "$receivedWeight",
                            "$receivedQty",
                        ]
                    }
                }
            },
            {"$match": {"finalQty": {"$ne": 0}}},
            {
                "$group": {
                    "_id": "$itemCode",
                    "wastageReturnQty": {"$sum": "$finalQty"},
                }
            },
        ]

        docs = await wastage_entry_collection().aggregate(pipeline).to_list(None)
        return {
            doc["_id"].upper(): {
                "wastageReturnQty": float(doc.get("wastageReturnQty", 0))
            }
            for doc in docs
            if doc.get("_id")
        }
    except Exception:
        traceback.print_exc()
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Stock Transfer
# ─────────────────────────────────────────────────────────────────────────────


async def get_stock_transfer_map(
    branch: str,
    query_date: Optional[date] = None,
) -> Dict[str, Dict]:
    try:
        match_query: Dict[str, Any] = {
            "$or": [
                {"toBranchId": branch},
                {"fromBranchId": branch},
            ]
        }

        if query_date:
            start, end = _get_utc_bounds_ist(query_date)
            match_query["receiveDateTime"] = {"$gte": start, "$lt": end}

        pipeline = [
            {"$match": match_query},
            {
                "$project": {
                    "fromBranchId": 1,
                    "toBranchId": 1,
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$itemCode", []]},
                                {"$ifNull": ["$uom", []]},
                                {"$ifNull": ["$receivedQty", []]},
                                {"$ifNull": ["$sendQty", []]},
                            ]
                        }
                    },
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "receivedNum": _to_double({"$arrayElemAt": ["$items", 2]}),
                    "sendNum": _to_double({"$arrayElemAt": ["$items", 3]}),
                    "fromBranchId": 1,
                    "toBranchId": 1,
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$project": {
                    "itemCode": 1,
                    "transferInQty": {
                        "$cond": [{"$eq": ["$toBranchId", branch]}, "$receivedNum", 0]
                    },
                    "transferOutQty": {
                        "$cond": [{"$eq": ["$fromBranchId", branch]}, "$sendNum", 0]
                    },
                }
            },
            {
                "$group": {
                    "_id": "$itemCode",
                    "transferInQty": {"$sum": "$transferInQty"},
                    "transferOutQty": {"$sum": "$transferOutQty"},
                }
            },
        ]

        docs = await stock_transfer_collection().aggregate(pipeline).to_list(None)
        return {
            doc["_id"]: {
                "transferInQty": float(doc.get("transferInQty", 0)),
                "transferOutQty": float(doc.get("transferOutQty", 0)),
            }
            for doc in docs
            if doc.get("_id")
        }
    except Exception:
        traceback.print_exc()
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Batch functions for stock ledger
# ─────────────────────────────────────────────────────────────────────────────


async def batch_dispatch_map(
    branch: str,
    from_date: date,
    to_date: date,
) -> Dict[str, Dict[str, float]]:
    try:
        start_utc, end_utc = _get_utc_range_bounds_ist(from_date, to_date)

        pipeline = [
            {
                "$match": {
                    "locationId": branch,
                    "date": {"$gte": start_utc, "$lt": end_utc},
                }
            },
            {
                "$project": {
                    "date": 1,
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$itemCode", []]},
                                {"$ifNull": ["$receivedQty", []]},
                                {"$ifNull": ["$receivedWeight", []]},
                                {"$ifNull": ["$uom", []]},
                            ]
                        }
                    },
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "dateStr": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$date",
                            "timezone": "+05:30",
                        }
                    },
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "qty": {"$arrayElemAt": ["$items", 1]},
                    "weight": {"$arrayElemAt": ["$items", 2]},
                    "uom": {
                        "$toLower": {
                            "$ifNull": [{"$arrayElemAt": ["$items", 3]}, ""]
                        }
                    },
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$addFields": {
                    "finalQty": {
                        "$cond": [
                            {"$in": ["$uom", KG_UOM_LIST]},
                            _to_double("$weight"),
                            _to_double("$qty"),
                        ]
                    }
                }
            },
            {"$match": {"finalQty": {"$ne": 0}}},
            {
                "$group": {
                    "_id": {"dateStr": "$dateStr", "itemCode": "$itemCode"},
                    "dispatchedQty": {"$sum": "$finalQty"},
                }
            },
        ]

        docs = await dispatch_collection().aggregate(pipeline).to_list(None)
        result: Dict[str, Dict[str, float]] = {}
        for doc in docs:
            d_str = doc["_id"]["dateStr"]
            item_code = doc["_id"]["itemCode"]
            result.setdefault(d_str, {})[item_code] = float(doc.get("dispatchedQty", 0))
        return result
    except Exception:
        traceback.print_exc()
        return {}


async def batch_sales_map(
    branch: str,
    from_date: date,
    to_date: date,
) -> Dict[str, Dict[str, float]]:
    try:
        start_utc, end_utc = _get_utc_range_bounds_ist(from_date, to_date)

        pipeline = [
            {
                "$match": {
                    "locationId": branch,
                    "invoiceDateTime": {"$gte": start_utc, "$lt": end_utc},
                }
            },
            {
                "$project": {
                    "invoiceDateTime": 1,
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$varianceitemCode", []]},
                                {"$ifNull": ["$qty", []]},
                                {"$ifNull": ["$weight", []]},
                                {"$ifNull": ["$uom", []]},
                            ]
                        }
                    },
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "dateStr": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$invoiceDateTime",
                            "timezone": "+05:30",
                        }
                    },
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "qty": {"$arrayElemAt": ["$items", 1]},
                    "weight": {"$arrayElemAt": ["$items", 2]},
                    "uom": {
                        "$toLower": {
                            "$ifNull": [{"$arrayElemAt": ["$items", 3]}, ""]
                        }
                    },
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$addFields": {
                    "finalQty": {
                        "$cond": [
                            {"$in": ["$uom", KG_UOM_LIST]},
                            _to_double("$weight"),
                            _to_double("$qty"),
                        ]
                    }
                }
            },
            {"$match": {"finalQty": {"$ne": 0}}},
            {
                "$group": {
                    "_id": {"dateStr": "$dateStr", "itemCode": "$itemCode"},
                    "salesQty": {"$sum": "$finalQty"},
                }
            },
        ]

        docs = await invoices_collection().aggregate(pipeline).to_list(None)
        result: Dict[str, Dict[str, float]] = {}
        for doc in docs:
            d_str = doc["_id"]["dateStr"]
            item_code = doc["_id"]["itemCode"]
            result.setdefault(d_str, {})[item_code] = float(doc.get("salesQty", 0))
        return result
    except Exception:
        traceback.print_exc()
        return {}


async def batch_sales_return_map(
    branch: str,
    from_date: date,
    to_date: date,
) -> Dict[str, Dict[str, float]]:
    """
    Returns:
    {
        "2026-04-01": {"ITEM001": 2.0},
        "2026-04-02": {"ITEM001": 1.0},
    }

    returnDateTime is handled as string date based on existing code.
    """
    try:
        from_str = from_date.isoformat()
        to_next_str = (to_date + timedelta(days=1)).isoformat()

        pipeline = [
            {
                "$match": {
                    "locationId": branch,
                    "salesType": "salesReturn",
                    "returnDateTime": {"$gte": from_str, "$lt": to_next_str},
                }
            },
            {
                "$project": {
                    "dateStr": {"$substr": ["$returnDateTime", 0, 10]},
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$varianceitemCode", []]},
                                {"$ifNull": ["$itemName", []]},
                                {"$ifNull": ["$varianceName", []]},
                                {"$ifNull": ["$price", []]},
                                {"$ifNull": ["$weight", []]},
                                {"$ifNull": ["$qty", []]},
                                {"$ifNull": ["$uom", []]},
                            ]
                        }
                    },
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "dateStr": 1,
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "weight": _to_double({"$arrayElemAt": ["$items", 4]}),
                    "qty": _to_double({"$arrayElemAt": ["$items", 5]}),
                    "uom": {
                        "$toLower": {
                            "$ifNull": [{"$arrayElemAt": ["$items", 6]}, ""]
                        }
                    },
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$addFields": {
                    "finalQty": {
                        "$cond": [
                            {"$in": ["$uom", KG_UOM_LIST]},
                            "$weight",
                            "$qty",
                        ]
                    }
                }
            },
            {"$match": {"finalQty": {"$ne": 0}}},
            {
                "$group": {
                    "_id": {"dateStr": "$dateStr", "itemCode": "$itemCode"},
                    "returnQty": {"$sum": "$finalQty"},
                }
            },
        ]

        docs = await get_salesreturn_collection().aggregate(pipeline).to_list(None)
        result: Dict[str, Dict[str, float]] = {}
        for doc in docs:
            d_str = doc["_id"]["dateStr"]
            item_code = doc["_id"]["itemCode"]
            result.setdefault(d_str, {})[item_code] = float(doc.get("returnQty", 0))
        return result
    except Exception:
        traceback.print_exc()
        return {}


async def batch_warehouse_return_map(
    branch: str,
    from_date: date,
    to_date: date,
) -> Dict[str, Dict[str, float]]:
    try:
        start_utc, end_utc = _get_utc_range_bounds_ist(from_date, to_date)

        pipeline = [
            {
                "$match": {
                    "locationId": branch,
                    "date": {"$gte": start_utc, "$lt": end_utc},
                }
            },
            {
                "$project": {
                    "date": 1,
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$itemCode", []]},
                                {"$ifNull": ["$uom", []]},
                                {"$ifNull": ["$receivedqty", []]},
                                {"$ifNull": ["$receivedweight", []]},
                            ]
                        }
                    },
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "dateStr": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$date",
                            "timezone": "+05:30",
                        }
                    },
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "uom": {
                        "$toLower": {
                            "$ifNull": [{"$arrayElemAt": ["$items", 1]}, ""]
                        }
                    },
                    "receivedQty": _to_double({"$arrayElemAt": ["$items", 2]}),
                    "receivedWeight": _to_double({"$arrayElemAt": ["$items", 3]}),
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$addFields": {
                    "finalQty": {
                        "$cond": [
                            {"$in": ["$uom", KG_UOM_LIST]},
                            "$receivedWeight",
                            "$receivedQty",
                        ]
                    }
                }
            },
            {"$match": {"finalQty": {"$ne": 0}}},
            {
                "$group": {
                    "_id": {"dateStr": "$dateStr", "itemCode": "$itemCode"},
                    "warehouseReturnQty": {"$sum": "$finalQty"},
                }
            },
        ]

        docs = await warehouse_return_collection().aggregate(pipeline).to_list(None)
        result: Dict[str, Dict[str, float]] = {}
        for doc in docs:
            d_str = doc["_id"]["dateStr"]
            item_code = doc["_id"]["itemCode"]
            result.setdefault(d_str, {})[item_code] = float(
                doc.get("warehouseReturnQty", 0)
            )
        return result
    except Exception:
        traceback.print_exc()
        return {}


async def batch_wastage_return_map(
    branch: str,
    from_date: date,
    to_date: date,
) -> Dict[str, Dict[str, float]]:
    try:
        start_utc, end_utc = _get_utc_range_bounds_ist(from_date, to_date)

        pipeline = [
            {
                "$match": {
                    "locationId": branch,
                    "date": {"$gte": start_utc, "$lt": end_utc},
                }
            },
            {
                "$project": {
                    "date": 1,
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$itemCode", []]},
                                {"$ifNull": ["$receivedqty", []]},
                                {"$ifNull": ["$receivedweight", []]},
                                {"$ifNull": ["$uom", []]},
                            ]
                        }
                    },
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "dateStr": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$date",
                            "timezone": "+05:30",
                        }
                    },
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "receivedQty": _to_double({"$arrayElemAt": ["$items", 1]}),
                    "receivedWeight": _to_double({"$arrayElemAt": ["$items", 2]}),
                    "uom": {
                        "$toLower": {
                            "$ifNull": [{"$arrayElemAt": ["$items", 3]}, ""]
                        }
                    },
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$addFields": {
                    "finalQty": {
                        "$cond": [
                            {"$in": ["$uom", KG_UOM_LIST]},
                            "$receivedWeight",
                            "$receivedQty",
                        ]
                    }
                }
            },
            {"$match": {"finalQty": {"$ne": 0}}},
            {
                "$group": {
                    "_id": {"dateStr": "$dateStr", "itemCode": "$itemCode"},
                    "wastageReturnQty": {"$sum": "$finalQty"},
                }
            },
        ]

        docs = await wastage_entry_collection().aggregate(pipeline).to_list(None)
        result: Dict[str, Dict[str, float]] = {}
        for doc in docs:
            d_str = doc["_id"]["dateStr"]
            item_code = doc["_id"]["itemCode"]
            result.setdefault(d_str, {})[item_code] = float(
                doc.get("wastageReturnQty", 0)
            )
        return result
    except Exception:
        traceback.print_exc()
        return {}


async def batch_transfer_map(
    branch: str,
    from_date: date,
    to_date: date,
) -> Dict[str, Dict[str, Dict]]:
    try:
        start_utc, end_utc = _get_utc_range_bounds_ist(from_date, to_date)

        pipeline = [
            {
                "$match": {
                    "receiveDateTime": {"$gte": start_utc, "$lt": end_utc},
                    "$or": [{"toBranchId": branch}, {"fromBranchId": branch}],
                }
            },
            {
                "$project": {
                    "receiveDateTime": 1,
                    "fromBranchId": 1,
                    "toBranchId": 1,
                    "items": {
                        "$zip": {
                            "inputs": [
                                {"$ifNull": ["$itemCode", []]},
                                {"$ifNull": ["$uom", []]},
                                {"$ifNull": ["$receivedQty", []]},
                                {"$ifNull": ["$sendQty", []]},
                            ]
                        }
                    },
                }
            },
            {"$unwind": "$items"},
            {
                "$project": {
                    "dateStr": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$receiveDateTime",
                            "timezone": "+05:30",
                        }
                    },
                    "itemCode": {
                        "$toUpper": {
                            "$trim": {
                                "input": {
                                    "$ifNull": [{"$arrayElemAt": ["$items", 0]}, ""]
                                }
                            }
                        }
                    },
                    "receivedNum": _to_double({"$arrayElemAt": ["$items", 2]}),
                    "sendNum": _to_double({"$arrayElemAt": ["$items", 3]}),
                    "fromBranchId": 1,
                    "toBranchId": 1,
                }
            },
            {"$match": {"itemCode": {"$ne": ""}}},
            {
                "$project": {
                    "dateStr": 1,
                    "itemCode": 1,
                    "transferInQty": {
                        "$cond": [{"$eq": ["$toBranchId", branch]}, "$receivedNum", 0]
                    },
                    "transferOutQty": {
                        "$cond": [{"$eq": ["$fromBranchId", branch]}, "$sendNum", 0]
                    },
                }
            },
            {
                "$group": {
                    "_id": {"dateStr": "$dateStr", "itemCode": "$itemCode"},
                    "transferInQty": {"$sum": "$transferInQty"},
                    "transferOutQty": {"$sum": "$transferOutQty"},
                }
            },
        ]

        docs = await stock_transfer_collection().aggregate(pipeline).to_list(None)
        result: Dict[str, Dict[str, Dict[str, float]]] = {}

        for doc in docs:
            d_str = doc["_id"]["dateStr"]
            item_code = doc["_id"]["itemCode"]
            result.setdefault(d_str, {})[item_code] = {
                "transferInQty": float(doc.get("transferInQty", 0)),
                "transferOutQty": float(doc.get("transferOutQty", 0)),
            }

        return result
    except Exception:
        traceback.print_exc()
        return {}


async def batch_closing_stocks(
    location_id: str,
    item_codes: List[str],
    from_date: date,
    to_date: date,
) -> Dict[str, Dict[str, float]]:
    try:
        date_str_list = _date_strs(from_date, to_date)
        all_codes = set(item_codes + [c.upper() for c in item_codes if c])

        docs = (
            await closingstocks_collection()
            .find(
                {
                    "locationId": location_id,
                    "itemCode": {"$in": list(all_codes)},
                    "date": {"$in": date_str_list},
                },
                {"itemCode": 1, "date": 1, "physicalStock": 1, "systemStock": 1},
            )
            .to_list(None)
        )

        result: Dict[str, Dict[str, float]] = {}

        for doc in docs:
            stock = (
                doc.get("physicalStock")
                if doc.get("physicalStock") is not None
                else doc.get("systemStock", 0)
            )
            code_key = doc["itemCode"].upper() if doc.get("itemCode") else ""
            if not code_key:
                continue
            result.setdefault(doc["date"], {})[code_key] = safe_float(stock)

        return result
    except Exception:
        traceback.print_exc()
        return {}


async def fetch_all_movement_maps(branch: str, query_date: Optional[date]):
    return await asyncio.gather(
        get_dispatch_map(branch, query_date),
        get_sales_map(branch, query_date),
        get_sales_return_map(branch, query_date),
        get_warehouse_return_map(branch, query_date),
        get_wastage_return_map(branch, query_date),
        get_stock_transfer_map(branch, query_date),
    )