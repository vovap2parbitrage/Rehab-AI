
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.patient_therapist import patient_therapist_table

if TYPE_CHECKING:  # only for the type checker: the relationships below name these as strings
    from app.models.exercise import Exercise
    from app.models.patient import Patient
    from app.models.plan import Plan

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('patient', 'therapist')",
            name="ck_users_role",
        ),
        CheckConstraint(
            "first_name IS NULL OR length(trim(first_name)) >= 1",
            name="ck_users_first_name_not_blank",
        ),
        CheckConstraint(
            "last_name IS NULL OR length(trim(last_name)) >= 1",
            name="ck_users_last_name_not_blank",
        ),
    )


    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    first_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    last_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    date_of_birth: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # Access tokens issued before this moment are rejected (set on a password change).
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="patient",
    )

    # Subscription plan; only limits therapists (how many active patients they may have).
    plan_code: Mapped[str] = mapped_column(
        String(20),
        ForeignKey("plans.code"),
        nullable=False,
        default="free",
        server_default="free",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    exercises: Mapped[list["Exercise"]] = relationship(
        "Exercise",
        back_populates="creator",
    )

    patient_profile: Mapped["Patient | None"] = relationship(
        "Patient",
        back_populates="user",
        uselist=False,
        foreign_keys="Patient.user_id",
    )

    plan: Mapped["Plan"] = relationship("Plan")

    patients_as_therapist: Mapped[list["Patient"]] = relationship(
        "Patient",
        secondary=patient_therapist_table,
        back_populates="therapists",
    )   