from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from core.models import TenantAuditMixin

class IdNameModel(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None


class StockUpdateModel(TenantAuditMixin):
    itemCode: str
    locationId: str
    physicalStock: float


class StockResponseModel(BaseModel):
    itemCode: str
    locationId: str
    itemType: str
    systemStock: float
    physicalStock: float
    systemStockSo: float
    physicalStockSo: float 
    previousSystemStock: float
    variance: Optional[float] = None
    status: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime


class ItemModel(BaseModel):
    id: str
    itemCode: str
    category: Optional[IdNameModel] = None
    subCategory: Optional[IdNameModel] = None
    itemName: Optional[IdNameModel] = None
    varianceName: Optional[IdNameModel] = None
    uom: Optional[IdNameModel] = None
    systemStock: float = 0
    systemStockSo: float = 0
    physicalStock: float = 0
    previousSystemStock: float = 0
    variance: Optional[float] = None
    status: Optional[str] = None
    updatedAt: Optional[datetime] = None


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


class FilteredItemsModel(BaseModel):
    total: int
    page: int
    limit: int
    count: int
    items: List[ItemModel]
    message: str


class GetItemsResponseModel(BaseModel):
    filteredItems: Optional[FilteredItemsModel] = None
    filterOptions: Optional[FilterOptionsModel] = None


class CSVImportResponseModel(BaseModel):
    message: str
    locationId: str
    file: str
    updated_items: int
    csv_rows: int
    processed_at: str


class branchResponse(BaseModel):
    locationId: str
    locationName: str
    aliasName: str


class locationResponse(BaseModel):
    locationId: str
    locationName: str
    aliasName: str


class BranchStockUpdateItem(BaseModel):
    itemCode: str
    locationId: str
    physical_stock: float


class BranchStockBulkUpdateModel(TenantAuditMixin):
    updates: List[BranchStockUpdateItem]


class LocationItem(BaseModel):
    aliasName: str
    locationName: str
    locationId: str


class LocationResponse(BaseModel):
    location: List[LocationItem]