from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class PhysicalClosingItemRequest(BaseModel):
    itemCode: str = Field(min_length=1, max_length=100)
    physicalStock: float = Field(ge=0)

    @field_validator("itemCode")
    @classmethod
    def clean_item_code(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("itemCode is required")
        return cleaned


class SubmitOutletPhysicalClosingRequest(BaseModel):
    locationId: str
    branch: Optional[str] = None
    closingMonth: Optional[str] = None
    idempotencyKey: Optional[str] = None
    tenantId: Optional[str] = None
    submittedById: Optional[str] = None
    submittedBy: Optional[str] = None
    createdBy: Optional[str] = None
    description: Optional[str] = None
    items: List[PhysicalClosingItemRequest] = Field(min_length=1)

    @field_validator(
        "locationId",
        "branch",
        "closingMonth",
        "idempotencyKey",
        "tenantId",
        "submittedById",
        "submittedBy",
        "createdBy",
        "description",
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
            raise ValueError("locationId or branch is required")
        return self

    @property
    def resolved_location_id(self) -> str:
        return str(self.locationId or self.branch or "").strip()

    @property
    def resolved_created_by(self) -> str:
        return str(self.createdBy or self.submittedBy or "System").strip() or "System"


class EditPendingOutletPhysicalClosingRequest(BaseModel):
    physicalStock: float = Field(ge=0)
    expectedEditVersion: int = Field(default=0, ge=0)
    editedBy: Optional[str] = None
    lastUpdatedBy: Optional[str] = None
    reason: Optional[str] = None

    @field_validator("editedBy", "lastUpdatedBy", "reason", mode="before")
    @classmethod
    def clean_edit_text(cls, value):
        if value is None:
            return None
        return str(value).strip()

    @property
    def resolved_editor(self) -> str:
        return str(self.lastUpdatedBy or self.editedBy or "System").strip() or "System"