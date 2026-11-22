from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    max_active_patients: int
    price_uah: int


class TherapistPlanRead(BaseModel):
    """A therapist's plan and how much of its patient limit is in use."""

    plan: str
    plan_name: str
    limit: int
    active: int
    # Pending invitations also reserve a slot, but only active patients reduce ``free``.
    pending: int
    free: int


class PlanChange(BaseModel):
    plan_code: str


class PlanPurchaseRead(BaseModel):
    payment_id: UUID | None
    amount_uah: int
    plan: TherapistPlanRead
