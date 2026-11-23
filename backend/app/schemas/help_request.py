from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints

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
    # How the session the question is about was scored and recorded.
    score: float | None = None
    has_video: bool = False
    joint_deviations: dict[str, Any] = Field(default_factory=dict)
    message: str
    reply: str | None = None
    replied_by_email: str | None = None
    created_at: datetime
    replied_at: datetime | None = None
