import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class HelpRequest(Base):
    """A patient's question to the therapist after an exercise session ("Ask for help").

    A request without a reply is shown to the therapist in the "Needs attention" list.
    """

    __tablename__ = "help_requests"
    __table_args__ = (
        CheckConstraint(
            "length(trim(message)) >= 1 AND length(message) <= 2000",
            name="ck_help_requests_message_length",
        ),
        CheckConstraint(
            "reply IS NULL OR (length(trim(reply)) >= 1 AND length(reply) <= 2000)",
            name="ck_help_requests_reply_length",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id"),
        nullable=False,
        index=True,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patients.id"),
        nullable=False,
        index=True,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    replied_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    session = relationship("TrainingSession")
    patient = relationship("Patient")
    replier = relationship("User", foreign_keys=[replied_by])
