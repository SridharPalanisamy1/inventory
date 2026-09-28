from typing import Optional
from fastapi import APIRouter, Query
from .models import (
    EditPendingOutletPhysicalClosingRequest,
    SubmitOutletPhysicalClosingRequest,
    
)
from .service import (
    edit_pending_outlet_physical_closing,
    list_pending_outlet_physical_closings,
    list_pending_outlet_physical_closing_ids,
    submit_outlet_physical_closing,
)


router = APIRouter()


@router.post("/submit")
async def submit(request: SubmitOutletPhysicalClosingRequest):
    return await submit_outlet_physical_closing(request)


@router.get("/pending")
async def get_pending(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    locationId: Optional[str] = Query(None),
    closingMonth: Optional[str] = Query(None, description="YYYY-MM"),
):
    return await list_pending_outlet_physical_closings(
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
    return await edit_pending_outlet_physical_closing(
        closing_id=closing_id,
        item_code=item_code,
        request=request,
    )

@router.get("/pending-ids")
async def get_pending_ids(locationId: Optional[str] = Query(None)):
    return await list_pending_outlet_physical_closing_ids(location_id=locationId)