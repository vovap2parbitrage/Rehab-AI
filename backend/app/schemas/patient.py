from datetime import date, datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class PatientCreate(BaseModel):
    user_id: UUID
    therapist_ids: list[UUID] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=2000)


class PatientRead(PatientCreate):
    id: UUID = Field(default_factory=uuid4)
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: date | None = None
    archived_at: datetime | None = None
