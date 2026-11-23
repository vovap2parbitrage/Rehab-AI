from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints

MessageText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class MessageCreate(BaseModel):
    patient_id: UUID
    message: MessageText


class MessageReply(BaseModel):
    reply: MessageText


class MessageRead(BaseModel):
    id: UUID
    patient_id: UUID
    patient_name: str
    therapist_name: str
    message: str
    created_at: datetime
    reply: str | None = None
    replied_at: datetime | None = None
    # False while the therapist has not looked at the reply yet.
    reply_seen: bool = False
