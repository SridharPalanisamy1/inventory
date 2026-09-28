from typing import Optional
from pydantic import BaseModel


class TenantAuditMixin(BaseModel):
    """Shared tenant_id/idempotency_key fields for request models across all inventory modules."""
    tenant_id: Optional[str] = ""
    idempotency_key: Optional[str] = ""
