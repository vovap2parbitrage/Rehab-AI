import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.patient_therapist import patient_therapist_table

class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = (
        CheckConstraint(
            "notes IS NULL OR length(notes) <= 4000",
            name="ck_patients_notes_length",
        )
    ),

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

    therapist_invitations = relationship(
        "TherapistInvitation",
        back_populates="patient",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    assignments = relationship(
        "Assignment",
        back_populates="patient",
    )
