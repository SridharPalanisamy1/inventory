from typing import Optional
from fastapi import APIRouter, Query
from .models import (
    EditPendingPhysicalClosingRequest,
    SubmitWarehousePhysicalClosingRequest,  
)
from .service import (
    edit_pending_physical_closing,
    list_pending_physical_closings,
    submit_physical_closing,
)

router = APIRouter()

@router.post("/submit")
async def submit(request: SubmitWarehousePhysicalClosingRequest):
    return await submit_physical_closing(request)

@router.get("/pending")
async def get_pending(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    locationId: Optional[str] = Query(None),
    closingMonth: Optional[str] = Query(None, description="YYYY-MM"),
):
    return await list_pending_physical_closings(
        page=page,
        limit=limit,
        location_id=locationId,
        closing_month=closingMonth,
    )

@router.patch("/pending/{closing_id}/items/{random_id}")
async def edit_pending(
    closing_id: str,
    random_id: str,
    request: EditPendingPhysicalClosingRequest,
):
    return await edit_pending_physical_closing(
        closing_id=closing_id,
        random_id=random_id,
        request=request,
    )

@router.get("/pending-ids")
async def get_pending_ids(
    locationId: Optional[str] = Query(None),
):
    from .service import list_pending_physical_closing_ids
    return await list_pending_physical_closing_ids(location_id=locationId)