from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints

HelpText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class HelpRequestCreate(BaseModel):
    session_id: UUID
    message: HelpText


class HelpRequestReply(BaseModel):
    reply: HelpText


class HelpRequestRead(BaseModel):
    id: UUID
    session_id: UUID
    assignment_id: UUID
    patient_id: UUID
    patient_name: str
    exercise_name: str
    pain_score: int | None = None
    message: str
    reply: str | None = None
    replied_by_email: str | None = None
    created_at: datetime
    replied_at: datetime | None = None
