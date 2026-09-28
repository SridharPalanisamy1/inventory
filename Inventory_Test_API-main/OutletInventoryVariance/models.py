from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime, date, timezone

from core.models import TenantAuditMixin


class BranchwiseItem(BaseModel):
    branchwiseItemId: Optional[str] = None
    branchId: Optional[List[Any]] = None
    branch: Optional[List[Any]] = None
    varianceName: Optional[str] = None
    itemName: Optional[str] = None
    defaultPrice: Optional[int] = None
    varianceItemcode: Optional[str] = None
    uom: Optional[str] = None
    tax: Optional[Any] = None
    hsnCode: Optional[Any] = None
    availableStock: Optional[str] = None
    category: Optional[str] = None
    description: Optional[Any] = None
    status: Optional[str] = None
    orderType: Optional[Any] = None
    itemId: Optional[str] = None
    create_item_Date: Optional[str] = None
    updated_item_Date: Optional[str] = None
    promotional_Offer: Optional[str] = None


class BranchwiseItemPost(TenantAuditMixin):
    branchId: Optional[List[Any]] = None
    branch: Optional[List[Any]] = None
    varianceName: Optional[str] = None
    itemName: Optional[str] = None
    defaultPrice: Optional[int] = None
    varianceItemcode: Optional[str] = None
    uom: Optional[str] = None
    tax: Optional[Any] = None
    hsnCode: Optional[str] = None
    availableStock: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    itemType: Optional[str] = None
    status: Optional[str] = None
    type: Optional[str] = None
    orderType: Optional[Any] = None
    itemId: Optional[str] = None
    create_item_Date: Optional[str] = None
    updated_item_Date: Optional[str] = None
    promotional_Offer: Optional[str] = None


class BranchwiseItemPatch(TenantAuditMixin):

    varianceName: Optional[str] = None
    itemName: Optional[str] = None
    defaultPrice: Optional[float] = None
    varianceItemcode: Optional[str] = None
    uom: Optional[str] = None
    tax: Optional[Any] = None
    hsnCode: Optional[str] = None
    availableStock: Optional[int] = None
    category: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    orderType: Optional[dict] = None
    create_item_Date: Optional[str] = None
    updated_item_Date: Optional[str] = None
    promotional_Offer: Optional[str] = None


class ItemUpdate(TenantAuditMixin):

    updates: Dict[Any, Any]


def convert_objectid_to_str(item):
    if item:
        item["branchwiseItemId"] = str(item.pop("_id"))
    return item


class InventoryStockCreate(TenantAuditMixin):
    branch: str
    date: date
    varianceNames: List[str]
    systemStocks: List[float]
    updatedSystemStocks: List[float]
    createdBy: str


class ItemResponse(BaseModel):
    itemCode: str
    varianceName: str


class branchResponse(BaseModel):
    branchName: str
    aliasName: str


class ApproveItemRequest(TenantAuditMixin):
    approved_by: str = Field(..., description="User who approved the item")
    description: str | None = Field(None, description="Optional approval description")
    adjustmentMode: str = Field("ADJUST_SYSTEM", description="ADJUST_SYSTEM or KEEP_SYSTEM")


class IdNameModel(BaseModel):
    id: str
    name: Optional[str] = None


class ItemModel(BaseModel):
    id: str
    itemCode: str
    category: Optional[IdNameModel] = None
    subCategory: Optional[IdNameModel] = None
    itemName: Optional[IdNameModel] = None
    varianceName: Optional[IdNameModel] = None

    systemStock: float = 0
    systemStockSo: float = 0
    physicalStock: float = 0
    previousSystemStock: float = 0


# ----------------- Filter options models -----------------
class IdNameFilterOptionsResponseModel(BaseModel):
    values: List[IdNameModel]
    total: int
    page: int
    limit: int
    count: int
    searchFilter: Optional[str] = None
    hasMore: bool


class FilterOptionsModel(BaseModel):
    category: IdNameFilterOptionsResponseModel
    subCategory: IdNameFilterOptionsResponseModel
    itemName: IdNameFilterOptionsResponseModel
    varianceName: IdNameFilterOptionsResponseModel


# ----------------- Final response models -----------------
class FilteredItemsModel(BaseModel):
    total: int
    page: int
    limit: int
    count: int
    items: List[ItemModel]
    message: Optional[str] = None


class GetItemsResponseModel(BaseModel):
    filteredItems: Optional[FilteredItemsModel] = None
    filterOptions: Optional[FilterOptionsModel] = None
