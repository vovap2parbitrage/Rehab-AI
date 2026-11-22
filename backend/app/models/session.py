
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, func
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

    comparison_task_id: Mapped[str | None] = mapped_column(
        String(64),
        unique=True,
        nullable=True,
    )

    # The patient's recorded video in storage. Empty for sessions saved without a video.
    video_key: Mapped[str | None] = mapped_column(
        String(512),
        unique=True,
        nullable=True,
    )

    # The exercise version the video was scored against; empty for sessions without analysis.
    exercise_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("exercise_versions.id"),
        nullable=True,
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

    @property
    def has_video(self) -> bool:
        return self.video_key is not None
