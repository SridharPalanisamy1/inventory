"""
Pydantic schemas for the Inventory Logging System.

This file defines the structure and validation rules
for Audit Logs, Event Logs, and Transaction Logs.
"""

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# =========================================================
# COMMON ACTOR
# =========================================================

class LogActor(BaseModel):
    """
    Identifies the actor responsible for a log event.

    IMPORTANT:
    The user_name must eventually come from the authenticated
    backend user/JWT context.

    Do not trust a user name sent directly by the frontend.
    """

    user_id: str | None = None

    user_name: str | None = None

    source: str = "system"


# =========================================================
# AUDIT LOG
# =========================================================

class AuditLogCreate(BaseModel):
    """
    Data required to create an Audit Log.
    """

    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    actor: LogActor

    action: str

    module: str

    entity_type: str | None = None

    entity_id: str | None = None

    location_id: str | None = None

    description: str | None = None

    old_values: dict[str, Any] = Field(
        default_factory=dict
    )

    new_values: dict[str, Any] = Field(
        default_factory=dict
    )

    status: str

    request_id: str | None = None

    idempotency_key: str | None = None

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


class AuditLogResponse(AuditLogCreate):
    """
    Response model when an Audit Log is returned.
    """

    model_config = ConfigDict(from_attributes=True)

    log_id: str


# =========================================================
# EVENT LOG
# =========================================================

class EventLogCreate(BaseModel):
    """
    Data required to create an Event Log.
    """

    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    event_type: str

    event_name: str

    module: str | None = None

    severity: str

    status: str

    message: str

    actor: LogActor | None = None

    request_id: str | None = None

    error: dict[str, Any] | None = None

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


class EventLogResponse(EventLogCreate):
    """
    Response model when an Event Log is returned.
    """

    model_config = ConfigDict(from_attributes=True)

    log_id: str


# =========================================================
# TRANSACTION ITEM
# =========================================================

class TransactionItem(BaseModel):
    """
    Item involved in a stock transaction.
    """

    item_code: str

    item_name: str | None = None

    sku: str | None = None


# =========================================================
# TRANSACTION LOG
# =========================================================

class TransactionLogCreate(BaseModel):
    """
    Data required to create a stock Transaction Log.
    """

    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    transaction_type: str

    direction: str

    module: str | None = None

    item: TransactionItem

    quantity: float

    unit: str | None = None

    from_location: str | None = None

    to_location: str | None = None

    reference_type: str | None = None

    reference_id: str | None = None

    stock_before: float | None = None

    stock_after: float | None = None

    actor: LogActor

    status: str

    request_id: str | None = None

    idempotency_key: str | None = None

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


class TransactionLogResponse(TransactionLogCreate):
    """
    Response model when a Transaction Log is returned.
    """

    model_config = ConfigDict(from_attributes=True)

    log_id: str