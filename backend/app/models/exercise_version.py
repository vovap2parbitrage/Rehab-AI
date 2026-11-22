import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ExerciseVersion(Base):
    """A frozen copy of what an exercise is scored against.

    The exercise itself is the editable working copy. Whenever the reference video,
    body parts or tolerances change, a new version is added, and an assignment stays on
    the version it was given, so a patient's scores stay comparable.
    """

    __tablename__ = "exercise_versions"
    __table_args__ = (
        UniqueConstraint("exercise_id", "version", name="uq_exercise_versions_exercise_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version: Mapped[int] = mapped_column(Integer, nullable=False)

    reference_video_key: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
    )

    body_parts: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    joint_tolerances: Mapped[dict[str, float]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    exercise = relationship("Exercise", back_populates="versions")
