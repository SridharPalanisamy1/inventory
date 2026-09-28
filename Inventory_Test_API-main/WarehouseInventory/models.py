from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional

from core.models import TenantAuditMixin


class WarehouseResponse(BaseModel):
    locationId: str
    locationName: str
    aliasName: str


class RawMaterialResponse(BaseModel):
    randomId: str

    category: Optional[str]
    subcategory: Optional[str]

    itemName: Optional[str]
    varianceName: Optional[str]
    itemCode: Optional[str]
    uom: Optional[str] = None
    systemStockSo:Optional[float]=None
    stockQuantity: float = Field(0, description="Current system stock")
    physicalStock: float = Field(0, description="Current physical stock")
    previousSystemStock: float = Field(0, description="Previous system stock")
    variance: Optional[float] = None
    status: Optional[str] = None
    updatedAt: Optional[datetime] = None


class FilterOptionsResponse(BaseModel):
    categories: dict
    subcategories: dict
    itemNames: dict
    varianceNames: dict


class SearchResponse(BaseModel):
    results: List[RawMaterialResponse]
    total: int
    page: int
    limit: int
    dropdown_values: Optional[FilterOptionsResponse] = None  # <-- FIXED HERE


class StockUpdateRequest(TenantAuditMixin):
    physicalStock: int = Field(..., ge=0, description="Physical stock counted")

    warehouse: str = Field(..., description="Warehouse ID")
    updatedBy: str = Field(..., description="User name")

    description: Optional[str] = None


class StockUpdateModel(TenantAuditMixin):
    randomId: str
    warehouseId: str
    physicalStock: float


class StockResponseModel(BaseModel):
    randomId: str
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


class InventoryResponse(BaseModel):
    id: str = Field(..., alias="_id")
    warehouseId: str
    itemType: Optional[str] = ""
    systemStock: int
    physicalStock: int
    updatedAt: datetime
    updatedBy: str

    class Config:
        validate_by_name = True


class StockUpdateItem(BaseModel):
    randomId: str
    warehouseId: str
    physicalStock: float


class StockBulkUpdateModel(TenantAuditMixin):
    updates: List[StockUpdateItem]
