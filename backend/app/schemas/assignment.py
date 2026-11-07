from datetime import date
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class AssignmentCreate(BaseModel):
    patient_id: UUID
    exercise_id: UUID
    sessions_per_week: int = Field(ge=1, le=14)
    repetitions: int = Field(ge=1, le=500)
    starts_on: date
    ends_on: date | None = None


class AssignmentRead(AssignmentCreate):
    id: UUID = Field(default_factory=uuid4)
    status: str = Field(default="active", max_length=20)


class PatientExerciseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None = None
    reference_video_key: str | None = None


class PatientSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    assignment_id: UUID
    pain_score: int | None = None
    completed_at: datetime | None = None
    score: float | None = None
    joint_deviations: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class PatientAssignmentRead(AssignmentRead):
    model_config = ConfigDict(from_attributes=True)

    exercise: PatientExerciseRead
    sessions: list[PatientSessionRead] = Field(default_factory=list)
