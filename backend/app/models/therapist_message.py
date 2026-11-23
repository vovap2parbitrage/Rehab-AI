import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TherapistMessage(Base):
    """A message from a therapist to a patient, for example about missed sessions.

    Unlike a help request it is not about one session. The patient can answer once.
    """

    __tablename__ = "therapist_messages"
    __table_args__ = (
        CheckConstraint(
            "length(trim(message)) >= 1 AND length(message) <= 2000",
            name="ck_therapist_messages_message_length",
        ),
        CheckConstraint(
            "reply IS NULL OR (length(trim(reply)) >= 1 AND length(reply) <= 2000)",
            name="ck_therapist_messages_reply_length",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    therapist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patients.id"),
        nullable=False,
        index=True,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # When the therapist looked at the reply; an unseen reply is shown as new.
    reply_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    therapist = relationship("User", foreign_keys=[therapist_id])
    patient = relationship("Patient")
