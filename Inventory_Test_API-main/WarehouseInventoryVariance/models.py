from datetime import datetime
from bson import ObjectId
from pydantic import BaseModel, field_validator
from typing import Dict, List, Optional, Union

from core.models import TenantAuditMixin


class PurchaseItem(BaseModel):
    randomId: str
    itemCode: str
    category: str
    subcategory: str
    itemName: str
    varianceName: str
    openingStock: float
    receivedQty: float
    returnedQty: float
    dispatchQty: float
    warehouseReturn: float
    currentSystem: float
    updatedCurrentSystem: float
    physicalClosing: Optional[Union[float, str]]
    variance: Optional[Union[float, str]]

    approvalStatus: str
    approvalButton: bool
    locationName: str

    @field_validator("physicalClosing", "variance", mode="before")
    def parse_dash(cls, v):
        if v in ("-", "_", None):
            return "-"
        return v

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}


class ApproveItemRequest(TenantAuditMixin):
    approved_by: str = ""
    description: Optional[str] = None
    adjustmentMode: str = "ADJUST_SYSTEM"


class ItemResponse(BaseModel):
    randomId: str
    itemName: str
    varianceName: str


class DropdownModel(BaseModel):
    items: List[str]
    total: int
    page: int
    limit: int


class ListItemsResponse(BaseModel):
    items: List[dict]
    totalItems: int
    currentDate: str
    dropdowns: Optional[Dict[str, DropdownModel]] = None
    message: Optional[str] = None


class ClosingItem(BaseModel):
    randomId: str
    itemName: str
    openingStock: float
    grnQty: float
    dispatchQty: float
    returnQty: float
    closingStock: float


class InventoryClosingStock(TenantAuditMixin):
    locationId: str
    date: str
    systemStock: List[ClosingItem]
    createdAt: datetime
    createdBy: str
