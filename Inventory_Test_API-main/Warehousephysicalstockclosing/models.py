from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

class PhysicalClosingItemRequest(BaseModel):
    randomId: str = Field(min_length=1, max_length=100)
    physicalStock: float = Field(ge=0)

    @field_validator("randomId")
    @classmethod
    def clean_random_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("randomId is required")
        return cleaned


class SubmitWarehousePhysicalClosingRequest(BaseModel):
    warehouseId: Optional[str] = None
    locationId: Optional[str] = None
    closingMonth: Optional[str] = None
    idempotencyKey: Optional[str] = None
    tenantId: Optional[str] = None
    submittedById: Optional[str] = None
    submittedBy: Optional[str] = None
    createdBy: Optional[str] = None
    description: Optional[str] = None
    itemType: str = "Raw Material"
    items: List[PhysicalClosingItemRequest] = Field(min_length=1)

    @field_validator(
        "warehouseId",
        "locationId",
        "closingMonth",
        "idempotencyKey",
        "tenantId",
        "submittedById",
        "submittedBy",
        "createdBy",
        "description",
        "itemType",
        mode="before",
    )
    @classmethod
    def clean_optional_text(cls, value):
        if value is None:
            return None
        return str(value).strip()

    @model_validator(mode="after")
    def validate_location(self):
        if not self.resolved_location_id:
            raise ValueError("warehouseId or locationId is required")
        return self

    @property
    def resolved_location_id(self) -> str:
        return str(self.locationId or self.warehouseId or "").strip()

    @property
    def resolved_created_by(self) -> str:
        return str(self.createdBy or self.submittedBy or "System").strip() or "System"

class EditPendingPhysicalClosingRequest(BaseModel):
    physicalStock: float = Field(ge=0)
    expectedEditVersion: int = Field(default=0, ge=0)
    reason: str = Field(min_length=1, max_length=500)
    editedBy: Optional[str] = None
    lastUpdatedBy: Optional[str] = None
    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("reason is required")
        return cleaned

    @field_validator(
        "editedBy",
        "lastUpdatedBy",
        mode="before",
    )
    @classmethod
    def clean_edit_text(cls, value):
        if value is None:
            return None
        return str(value).strip()

    @property
    def resolved_editor(self) -> str:
        return str(self.lastUpdatedBy or self.editedBy or "System").strip() or "System"