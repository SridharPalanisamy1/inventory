from db.connection import MongoDB

def item_master_collection():
    return MongoDB.live_client["MasterAdmin_DB"]["ItemMaster"]

def location_collection():
    return MongoDB.live_client["MasterAdmin_DB"]["Location"]

def uom_collection():
    return MongoDB.live_client["MasterAdmin_DB"]["Uom"]

def warehouse_collection():
    return MongoDB.live_client["MasterAdmin_DB"]["Warehouse"]

def category_collection():
    return MongoDB.live_client["MasterAdmin_DB"]["ItemCategory"]

def subcategory_collection():
    return MongoDB.live_client["MasterAdmin_DB"]["ItemSubCategory"]

def dispatch_collection():
    return MongoDB.live_client["YENERP_LIVE_DB"]["dispatch"]

def invoices_collection():
    return MongoDB.live_client["YENERP_LIVE_DB"]["invoices"]

def get_salesreturn_collection():
    return MongoDB.live_client["YENERP_LIVE_DB"]["salesreturn"]

def stock_transfer_collection():
    return MongoDB.live_client["YENERP_LIVE_DB"]["itemtransfer"]

def wastage_entry_collection():
    return MongoDB.live_client["YENERP_LIVE_DB"]["wastageEntry"]

def warehouse_return_collection():
    return MongoDB.live_client["YENERP_LIVE_DB"]["warehouseReturn"]

def stockclosing_collection():
    return MongoDB.live_client["YENERP_LIVE_DB"]["stockclosing"]


def purchaseitem_collection():
    return MongoDB.live_client["purchase"]["rawMaterials"]

def grn_collection():
    return MongoDB.live_client["purchase"]["grn"]

def storeDispatch_collection():
    return MongoDB.live_client["reactfluttertest"]["storeDispatch2"]

def purchase_uom_collection():
    return MongoDB.live_client["purchase"]["purchaseuom"]

def inventory_stock_collection():
    return MongoDB.live_client["yen_inventorytest"]["inventoryStock"]

def inventorytest_stock_collection():
    return MongoDB.live_client["yen_inventorytest"]["outletinventoryStock"]

def stock_history_collection():
    return MongoDB.live_client["yen_inventorytest"]["stockOutHist"]

def get_stock_updates_collection():
    return MongoDB.live_client["yen_inventorytest"]["stockWhHist"]

def approvedstocks_fg_collection():
    return MongoDB.live_client["yen_inventorytest"]["approvedstocksOutlet"]

def approvedstocks_rm_collection():
    return MongoDB.live_client["yen_inventorytest"]["approvedstocksWarehouse"]

def closingstocks_collection():
    return MongoDB.live_client["yen_inventorytest"]["closingstocksOutlet"]

def closingstocks_rm_collection():
    return MongoDB.live_client["yen_inventorytest"]["closingstocksWarehouse"]

def warehouse_physical_stock_closing_collection():
    return MongoDB.live_client["yen_inventorytest"]["warehousephysicalstockclosing"]

def outlet_physical_stock_closing_collection():
    return MongoDB.live_client["yen_inventorytest"]["outletphysicalstockclosing"]


# Outlet RAW-MATERIAL (RM) stock: Branch_wise_stock, documents with itemType == "RM" only
def outlet_rm_stock_collection():
    return MongoDB.live_client["yen_inventorytest"]["Branch_wise_stock"]

def outlet_rm_stock_history_collection():
    return MongoDB.live_client["yen_inventorytest"]["outletRMStockHist"]




def outlet_rm_physical_stock_closing_collection():
    return MongoDB.live_client["yen_inventorytest"]["outletrmphysicalstockclosing"]

def approvedstocks_outlet_rm_collection():
    return MongoDB.live_client["yen_inventorytest"]["approvedstocksOutletRM"]


