import importlib
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from apscheduler.triggers.cron import CronTrigger
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# MongoDB connection
from db.connection import MongoDB
from db.indexes import ensure_indexes
from config import settings

# Snapshot functions
from WarehouseInventoryVariance.routes import create_daily_rm_snapshot_all_warehouses
from OutletInventoryVariance.routes import create_inventory_snapshot_all_locations

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI App
app = FastAPI(
    docs_url="/inventorytestapi/doc",
    redoc_url="/inventorytestapi/redoc",
    openapi_url="/inventorytestapi/openapi.json",
)

scheduler = AsyncIOScheduler()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ROUTER LOADING
routes_info = [
    {
        "module": "OutletInventory.routes",
        "prefix": "/inventorytestapi/outletinventory",
        "tags": ["Outlet Inventory"],
    },
    {
        "module": "OutletRMInventory.routes",
        "prefix": "/inventorytestapi/outletrminventory",
        "tags": ["Outlet RM Inventory"],
    },
    {
        "module": "OutletRMInventoryVariance.routes",
        "prefix": "/inventorytestapi/outletrminventoryvariance",
        "tags": ["Outlet RM Inventory Variance"],
    },
    {
        "module": "OutletRMPhysicalStockClosing.routes",
        "prefix": "/inventorytestapi/OutletRMPhysicalStockClosing",
        "tags": ["Outlet RM Physical Stock Closing"],
    },
    {
        "module": "OutletInventoryVariance.routes",
        "prefix": "/inventorytestapi/outletinventoryvariance",
        "tags": ["Outlet Inventory Variance"],
    },
    {
        "module": "WarehouseInventory.routes",
        "prefix": "/inventorytestapi/warehouseinventory",
        "tags": ["Warehouse Inventory"],
    },
    {
        "module": "WarehouseInventoryVariance.routes",
        "prefix": "/inventorytestapi/warehouseinventoryvariance",
        "tags": ["Warehouse Inventory Variance"],
    },

    {
        "module": "Warehousephysicalstockclosing.routes",
        "prefix": "/inventorytestapi/warehousephysicalstockclosing",
        "tags": ["Warehouse Physical Stock Closing"],
    },
    {
        "module": "OutletPhysicalStockClosing.routes",
        "prefix": "/inventorytestapi/OutletPhysicalStockClosing",
        "tags": ["Outlet Physical Stock Closing"],
    },

]


def safe_include_router(route_info: dict):
    try:
        module = importlib.import_module(route_info["module"])
        router = getattr(module, "router")
        app.include_router(router, prefix=route_info["prefix"], tags=route_info["tags"])
    except Exception as e:
        logger.error(f"Failed to include {route_info['module']}: {e}")


for r in routes_info:
    safe_include_router(r)


@app.get("/")
def read_root():
    return {"msg": "YEN ERP - Inventory (OpenAPI at /inventorytestapi/doc)"}


@app.get("/inventorytestapi/health")
def health():
    return {"status": "ok"}


@app.get("/inventorytestapi/readiness")
async def readiness():
    try:
        await MongoDB.live_client.admin.command("ping")
        await MongoDB.test_client.admin.command("ping")
        return {"status": "ready"}
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return JSONResponse(status_code=503, content={"status": "not_ready"})


# COMBINED DAILY SNAPSHOT JOB (RM + FG)
async def run_daily_all_snapshots():
    try:
        await create_daily_rm_snapshot_all_warehouses(createdBy="Inventory-admin")
    except Exception as e:
        logger.error(f"RM FAILED → ALL WAREHOUSES | Error: {e}")

    try:
        await create_inventory_snapshot_all_locations(createdBy="Inventory-admin")
    except Exception as e:
        logger.error(f"FG FAILED → ALL BRANCHES | Error: {e}")

    logger.info("All Snapshots Completed")


# -------------------------
# Startup / Shutdown Events
# -------------------------


@app.on_event("startup")
async def startup_db():
    # Connect to MongoDB once
    MongoDB.connect()
    await ensure_indexes()

    # Start Scheduler
    trigger = CronTrigger(hour=23, minute=59, timezone="Asia/Kolkata")
    scheduler.add_job(
        run_daily_all_snapshots,
        trigger,
        id="daily_stock_job",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.start()


@app.on_event("shutdown")
async def shutdown_db():
    # Close MongoDB connection cleanly
    MongoDB.close()

    # Shutdown scheduler
    scheduler.shutdown()