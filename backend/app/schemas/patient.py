from datetime import date
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class PatientCreate(BaseModel):
    user_id: UUID
    therapist_id: UUID
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    date_of_birth: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class PatientRead(PatientCreate):
    id: UUID = Field(default_factory=uuid4)
