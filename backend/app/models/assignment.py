import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, String, text
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
            "sessions_per_week BETWEEN 1 AND 14",
            name="ck_assignments_sessions_per_week_range",
        ),
        CheckConstraint(
            "ends_on IS NULL OR ends_on >= starts_on",
            name="ck_assignments_date_range",
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
    # The therapist who assigned the exercise; patient questions about it go to them.
    therapist_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    repetitions: Mapped[int] = mapped_column(Integer, nullable=False)
    sessions_per_week: Mapped[int] = mapped_column(Integer, nullable=False)

    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)


    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        nullable=False,
    )

    patient = relationship("Patient", back_populates="assignments")
    exercise = relationship("Exercise", back_populates="assignments")
    therapist = relationship("User", foreign_keys=[therapist_id])
    sessions = relationship("TrainingSession", back_populates="assignment")