from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class PatientCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=2000)


class PatientRead(PatientCreate):
    id: UUID = Field(default_factory=uuid4)
    is_archived: bool = False
