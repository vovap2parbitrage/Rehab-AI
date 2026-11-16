import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, String, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        CheckConstraint(
            "repetitions BETWEEN 1 AND 500",
            name="ck_assignments_repetitions_range",
        ),
        CheckConstraint(
            "duration_weeks > 0",
            name="ck_assignments_duration_weeks_positive",
        )
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patients.id"),
        nullable=False,
        index=True,
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id"),
        nullable=False,
        index=True,
    )
    therapist_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    duration_weeks: Mapped[int] = mapped_column(Integer, nullable=False)

    repetitions: Mapped[int] = mapped_column(Integer, nullable=False)

    starts_on: Mapped[date] = mapped_column(Date, nullable=False)

    weekdays: Mapped[list[int]] = mapped_column(JSON, nullable=False)

    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        nullable=False,
    )

    patient = relationship("Patient", back_populates="assignments")
    exercise = relationship("Exercise", back_populates="assignments")
    therapist = relationship("User", foreign_keys=[therapist_id])
    sessions = relationship("TrainingSession", back_populates="assignment")