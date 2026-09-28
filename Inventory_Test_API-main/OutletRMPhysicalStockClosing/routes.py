# OutletRMPhysicalStockClosing/routes.py
# Same contract as OutletPhysicalStockClosing (FG) - the audit / monitoring app
# only has to change the URL for RM items:
#
#   FG : POST /inventorytestapi/OutletPhysicalStockClosing/submit
#   RM : POST /inventorytestapi/OutletRMPhysicalStockClosing/submit
#
# Body (identical): {"locationId": "LOC003", "createdBy": "...", "items": [{"itemCode": "885", "physicalStock": 12}]}

from typing import Optional

from fastapi import APIRouter, Query

from OutletPhysicalStockClosing.models import (
    EditPendingOutletPhysicalClosingRequest,
    SubmitOutletPhysicalClosingRequest,
)

from .service import (
    edit_pending_rm_physical_closing,
    list_pending_rm_physical_closing_ids,
    list_pending_rm_physical_closings,
    submit_rm_physical_closing,
)

router = APIRouter()


@router.post("/submit")
async def submit(request: SubmitOutletPhysicalClosingRequest):
    return await submit_rm_physical_closing(request)


@router.get("/pending")
async def get_pending(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    locationId: Optional[str] = Query(None),
    closingMonth: Optional[str] = Query(None, description="YYYY-MM"),
):
    return await list_pending_rm_physical_closings(
        page=page,
        limit=limit,
        location_id=locationId,
        closing_month=closingMonth,
    )


@router.patch("/pending/{closing_id}/items/{item_code}")
async def edit_pending(
    closing_id: str,
    item_code: str,
    request: EditPendingOutletPhysicalClosingRequest,
):
    return await edit_pending_rm_physical_closing(
        closing_id=closing_id,
        item_code=item_code,
        request=request,
    )


@router.get("/pending-ids")
async def get_pending_ids(locationId: Optional[str] = Query(None)):
    return await list_pending_rm_physical_closing_ids(location_id=locationId)