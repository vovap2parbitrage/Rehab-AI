from datetime import date
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AssignmentCreate(BaseModel):
    patient_id: UUID
    exercise_id: UUID
    duration_weeks: int = Field(ge=1)
    weekdays: list[int] = Field(min_length=1, max_length=7)
    repetitions: int = Field(ge=1, le=500)
    starts_on: date

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(cls, value: list[int]) -> list[int]:
        if len(set(value)) != len(value) or any(day < 0 or day > 6 for day in value):
            raise ValueError("weekdays must contain unique values from 0 (Monday) to 6 (Sunday)")
        return sorted(value)


class AssignmentRead(AssignmentCreate):
    id: UUID = Field(default_factory=uuid4)
    therapist_id: UUID | None = None
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
