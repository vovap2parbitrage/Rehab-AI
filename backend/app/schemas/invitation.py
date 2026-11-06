from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class InvitationCreate(BaseModel):
    patient_id: UUID
    message: str | None = Field(default=None, max_length=2000)


class InvitationRead(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    patient_id: UUID
    therapist_id: UUID
    status: str
    message: str | None = None
    created_at: datetime | None = None
    responded_at: datetime | None = None
