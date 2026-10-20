from datetime import date
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class AssignmentCreate(BaseModel):
    patient_id: UUID
    exercise_id: UUID
    sessions_per_week: int = Field(ge=1, le=14)
    repetitions: int = Field(ge=1, le=500)
    starts_on: date
    ends_on: date


class AssignmentRead(AssignmentCreate):
    id: UUID = Field(default_factory=uuid4)
    is_active: bool = True
