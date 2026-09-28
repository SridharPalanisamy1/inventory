"""
Run this ONCE to set up all required MongoDB indexes for the stock approval system.
Safe to re-run — createIndex is idempotent.

Usage:
    cd "d:\\YEN ERP - INVENTORY\\YEN -IN BM\\Inventory api"
    python create_indexes.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db.connection import MongoDB
from db.collections import (
    approvedstocks_fg_collection,
    stockclosing_collection,
    inventorytest_stock_collection,
)


async def main():
    MongoDB.connect()

    print("Creating indexes for stock approval system...")

    # ── approvedstocksOutlet (idempotency — most important) ──────────────────
    approved_col = approvedstocks_fg_collection()

    await approved_col.create_index(
        [("locationId", 1), ("closingDocId", 1), ("itemCode", 1)],
        unique=True,
        background=True,
        name="idx_approval_idempotency_unique",
    )
    print("  [OK] approvedstocksOutlet: unique idempotency index")

    await approved_col.create_index(
        [("closingDate", -1), ("status", 1)],
        background=True,
        name="idx_approval_date_status",
    )
    print("  [OK] approvedstocksOutlet: closingDate + status")

    await approved_col.create_index(
        [("locationId", 1), ("approvedAt", -1)],
        background=True,
        name="idx_approval_location_date",
    )
    print("  [OK] approvedstocksOutlet: locationId + approvedAt")

    # ── stockclosing ─────────────────────────────────────────────────────────
    closing_col = stockclosing_collection()

    await closing_col.create_index(
        [("locationId", 1), ("date", -1)],
        background=True,
        name="idx_closing_location_date",
    )
    print("  [OK] stockclosing: locationId + date")

    await closing_col.create_index(
        [("branch", 1), ("date", -1)],
        background=True,
        name="idx_closing_branch_date",
    )
    print("  [OK] stockclosing: branch + date")

    # ── inventoryStock ───────────────────────────────────────────────────────
    inv_col = inventorytest_stock_collection()

    try:
        await inv_col.create_index(
            [("locationId", 1), ("itemCode", 1)],
            unique=True,
            background=True,
            name="idx_inventory_location_item_unique",
        )
        print("  [OK] inventoryStock: locationId + itemCode (unique)")
    except Exception as e:
        if "duplicate" in str(e).lower() or "11000" in str(e):
            await inv_col.create_index(
                [("locationId", 1), ("itemCode", 1)],
                background=True,
                name="idx_inventory_location_item",
            )
            print("  [WARN] inventoryStock: non-unique fallback (duplicate data exists)")
        else:
            raise

    print("\nAll indexes created. Re-run anytime — createIndex is idempotent.")


if __name__ == "__main__":
    asyncio.run(main())
