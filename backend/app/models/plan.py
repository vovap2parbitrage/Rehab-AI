import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Plan(Base):
    __tablename__ = "plans"
    __table_args__ = (
        CheckConstraint("max_active_patients > 0", name="ck_plans_max_active_patients_positive"),
        CheckConstraint("price_uah >= 0", name="ck_plans_price_not_negative"),
    )

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    max_active_patients: Mapped[int] = mapped_column(Integer, nullable=False)
    # Price per month in hryvnias; 0 for the free plan.
    price_uah: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PlanPayment(Base):
    """One attempt to pay for a plan; the audit trail for purchases."""

    __tablename__ = "plan_payments"
    __table_args__ = (
        CheckConstraint("status IN ('paid', 'failed')", name="ck_plan_payments_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    plan_code: Mapped[str] = mapped_column(ForeignKey("plans.code"), nullable=False)
    amount_uah: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    provider_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
