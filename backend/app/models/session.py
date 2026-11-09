
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, Float, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TrainingSession(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint(
            "score IS NULL OR score BETWEEN 0 AND 10",
            name="ck_sessions_score_range",
        ),
        CheckConstraint(
            "pain_score IS NULL OR pain_score BETWEEN 0 AND 10",
            name="ck_sessions_pain_score_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id"),
        nullable=False,
        index=True,
    )

    score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    joint_deviations: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )

    pain_score: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    assignment = relationship(
        "Assignment",
        back_populates="sessions",
    )
