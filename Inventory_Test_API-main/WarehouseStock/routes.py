import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from db.collections import (
    purchaseitem_collection,
    inventory_stock_collection,
)
from WarehouseInventory.routes import get_uom_precision_map, round_by_precision, to_list

router = APIRouter()

@router.get("")
async def get_warehouse_stock(
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
            return []

        random_ids = [d["randomId"] for d in pur_docs if d.get("randomId")]

        inv_docs = await inventory.find(
            {
                "locationId": locationId,
                "randomId": {"$in": random_ids},
            },
            {
                "randomId": 1,
                "systemStock": 1,
            },
        ).to_list(length=None)

        inv_map = {d["randomId"]: d for d in inv_docs}
        
        results = []

        for p in pur_docs:
            rid = p.get("randomId", "")
            inv = inv_map.get(rid, {})

            precision = uom_map.get(p.get("uom", ""), 0)
            stock = round_by_precision(inv.get("systemStock", 0), precision)

            results.append({
                "itemCode": p.get("itemCode", ""),
                "category": p.get("purchasecategoryName", ""),
                "subcategory": p.get("purchasesubcategoryName", ""),
                "itemName": p.get("itemgroupName", ""),
                "varianceName": p.get("itemName", ""),
                "currentStock": stock,
            })

        return results

    except Exception as e:
        raise HTTPException(500, str(e))

@router.get("/export")
async def export_warehouse_stock(
    locationId: str = Query(...),
    purchasecategoryName: Optional[str] = None,
    purchasesubcategoryName: Optional[str] = None,
    itemName: Optional[str] = None,
    varianceName: Optional[str] = None,
):
    try:
        results = await get_warehouse_stock(
            locationId=locationId,
            purchasecategoryName=purchasecategoryName,
            purchasesubcategoryName=purchasesubcategoryName,
            itemName=itemName,
            varianceName=varianceName,
        )

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            "Item Code",
            "Category",
            "Subcategory",
            "Item Name",
            "Variance Name",
            "Current Stock"
        ])

        for r in results:
            writer.writerow([
                r["itemCode"],
                r["category"],
                r["subcategory"],
                r["itemName"],
                r["varianceName"],
                r["currentStock"],
            ])

        output.seek(0)
        filename = f"warehouse_stock_{locationId}_{datetime.utcnow():%Y%m%d_%H%M%S}.csv"

        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(500, str(e))
