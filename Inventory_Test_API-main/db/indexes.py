import logging

from db.collections import (
    approvedstocks_fg_collection,
    approvedstocks_rm_collection,
    closingstocks_collection,
    closingstocks_rm_collection,
    dispatch_collection,
    get_salesreturn_collection,
    get_stock_updates_collection,
    grn_collection,
    inventory_stock_collection,
    inventorytest_stock_collection,
    invoices_collection,
    item_master_collection,
    location_collection,
    purchaseitem_collection,
    stock_history_collection,
    stockclosing_collection,
    stock_transfer_collection,
    warehouse_collection,
    warehouse_return_collection,
    wastage_entry_collection,
    warehouse_physical_stock_closing_collection,
    outlet_physical_stock_closing_collection,outlet_rm_stock_collection,
)

logger = logging.getLogger(__name__)


async def _safe_create(collection, keys, unique: bool = False):
    try:
        await collection.create_index(keys, unique=unique)
    except Exception as exc:
        logger.warning(
            "Index creation skipped for %s on %s: %s",
            collection.name,
            keys,
            exc,
        )


async def ensure_indexes() -> None:
    """Create non-unique indexes for hot production inventory paths."""

    index_specs = [
        (
            item_master_collection(),
            [
                ("status", 1),
                ("category", 1),
                ("subCategory", 1),
                ("itemCode", 1),
            ],
        ),
        (
            item_master_collection(),
            [("itemCode", 1)],
        ),
        (
            purchaseitem_collection(),
            [
                ("status", 1),
                ("randomId", 1),
            ],
        ),
        (
            purchaseitem_collection(),
            [
                ("purchasecategoryName", 1),
                ("purchasesubcategoryName", 1),
                ("itemgroupName", 1),
                ("itemName", 1),
            ],
        ),
        (
            inventorytest_stock_collection(),
            [
                ("locationId", 1),
                ("itemCode", 1),
            ],
        ),
        (
            inventory_stock_collection(),
            [
                ("locationId", 1),
                ("randomId", 1),
            ],
        ),
        (
            outlet_rm_stock_collection(),
            [
                ("sectionId", 1),
                ("itemType", 1),
                ("itemCode", 1),
            ],
        ),
        (
            stock_history_collection(),
            [
                ("locationId", 1),
                ("itemCode", 1),
                ("updatedAt", -1),
            ],
        ),
        (
            get_stock_updates_collection(),
            [
                ("locationId", 1),
                ("randomId", 1),
                ("updatedAt", -1),
            ],
        ),
        (
            closingstocks_collection(),
            [
                ("locationId", 1),
                ("date", 1),
                ("itemCode", 1),
            ],
        ),
        (
            closingstocks_rm_collection(),
            [
                ("locationId", 1),
                ("date", 1),
                ("randomId", 1),
            ],
        ),
        (
            approvedstocks_fg_collection(),
            [
                ("status", 1),
                ("approvedAt", -1),
                ("locationId", 1),
            ],
        ),
        (
            approvedstocks_rm_collection(),
            [
                ("status", 1),
                ("approvedAt", -1),
                ("locationId", 1),
            ],
        ),
        (
            location_collection(),
            [
                ("status", 1),
                ("type", 1),
                ("locationId", 1),
            ],
        ),
        (
            warehouse_collection(),
            [
                ("status", 1),
                ("type", 1),
                ("warehouseId", 1),
            ],
        ),
        (
            dispatch_collection(),
            [
                ("locationId", 1),
                ("date", 1),
            ],
        ),
        (
            invoices_collection(),
            [
                ("locationId", 1),
                ("invoiceDateTime", 1),
            ],
        ),
        (
            get_salesreturn_collection(),
            [
                ("locationId", 1),
                ("salesType", 1),
                ("returnDateTime", 1),
            ],
        ),
        (
            warehouse_return_collection(),
            [
                ("locationId", 1),
                ("date", 1),
            ],
        ),
        (
            wastage_entry_collection(),
            [
                ("locationId", 1),
                ("date", 1),
            ],
        ),
        (
            stock_transfer_collection(),
            [
                ("receiveDateTime", 1),
                ("toBranchId", 1),
                ("fromBranchId", 1),
            ],
        ),
        (
            grn_collection(),
            [
                ("locationId", 1),
                ("grnDate", 1),
            ],
        ),

        # Supports _get_closing_doc_for_branch's
        # $or: [{"locationId": ...}, {"branch": ...}]
        # query with:
        # .sort([("createdAt", -1), ("date", -1)]).limit(50)
        (
            stockclosing_collection(),
            [
                ("locationId", 1),
                ("createdAt", -1),
                ("date", -1),
            ],
        ),
        (
            stockclosing_collection(),
            [
                ("branch", 1),
                ("createdAt", -1),
                ("date", -1),
            ],
        ),

        # Warehouse physical stock closing.
        # Used for pending approval list and monthly warehouse filtering.
        (
            warehouse_physical_stock_closing_collection(),
            [
                ("status", 1),
                ("locationId", 1),
                ("closingMonth", 1),
                ("submittedAt", -1),
            ],
        ),
    ]

    for collection, keys in index_specs:
        await _safe_create(collection, keys)

    # Unique idempotency guards for the approval endpoints.
    # A duplicate approve call must fail fast instead of
    # double-applying stock adjustments.
    unique_index_specs = [
        (
            approvedstocks_fg_collection(),
            [
                ("locationId", 1),
                ("closingDocId", 1),
                ("itemCode", 1),
            ],
        ),
        (
            approvedstocks_rm_collection(),
            [
                ("locationId", 1),
                ("closingDocId", 1),
                ("randomId", 1),
            ],
        ),

        # Prevent duplicate warehouse physical-closing records
        # when the same POST request is retried.
        (
            warehouse_physical_stock_closing_collection(),
            [
                ("tenantId", 1),
                ("idempotencyKey", 1),
                ("randomId", 1),
            ],
        ),

        # Prevent the same item from being duplicated inside
        # the same physical-closing submission.
        (
            warehouse_physical_stock_closing_collection(),
            [
                ("closingId", 1),
                ("randomId", 1),
            ],
        ),
    ]

    for collection, keys in unique_index_specs:
        await _safe_create(
            collection,
            keys,
            unique=True,
        )