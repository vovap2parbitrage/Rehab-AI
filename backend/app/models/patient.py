
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.patient_therapist import patient_therapist_table

class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = (
        CheckConstraint(
            "length(trim(first_name)) >= 1",
            name="ck_patients_first_name_not_blank",
        ),
        CheckConstraint(
            "length(trim(last_name)) >= 1",
            name="ck_patients_last_name_not_blank",
        ),
        CheckConstraint(
            "notes IS NULL OR length(notes) <= 4000",
            name="ck_patients_notes_length",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
        index=True,
    )

    first_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    last_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    date_of_birth: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
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

    user = relationship(
        "User",
        back_populates="patient_profile",
        foreign_keys=[user_id],
    )

    therapists = relationship(
        "User",
        secondary=patient_therapist_table,
        back_populates="patients_as_therapist",
    )

    assignments = relationship(
        "Assignment",
        back_populates="patient",
    )
