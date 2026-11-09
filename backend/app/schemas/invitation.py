from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, EmailStr, Field


class InvitationCreate(BaseModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    patient_id: UUID | None = None
    message: str | None = Field(default=None, max_length=2000)


class InvitationRead(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    patient_id: UUID
    therapist_id: UUID
    status: str
    message: str | None = None
    created_at: datetime | None = None
    responded_at: datetime | None = None


class PatientInvitationRead(BaseModel):
    id: UUID
    patient_id: UUID
    therapist_id: UUID
    therapist_email: str
    status: str
    message: str | None = None
    created_at: datetime
    responded_at: datetime | None = None


class PatientInvitationRespond(BaseModel):
    status: Literal["accepted", "declined"]
