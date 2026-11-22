from datetime import date
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.statuses import AssignmentStatus


def _validate_weekdays(value: list[int]) -> list[int]:
    if len(set(value)) != len(value) or any(day < 0 or day > 6 for day in value):
        raise ValueError("weekdays must contain unique values from 0 (Monday) to 6 (Sunday)")
    return sorted(value)


class AssignmentCreate(BaseModel):
    patient_id: UUID
    exercise_id: UUID
    duration_weeks: int = Field(ge=1)
    weekdays: list[int] = Field(min_length=1, max_length=7)
    repetitions: int = Field(ge=1, le=500)
    starts_on: date

    @field_validator("weekdays")
    @classmethod
    def check_weekdays(cls, value: list[int]) -> list[int]:
        return _validate_weekdays(value)


class AssignmentRead(AssignmentCreate):
    id: UUID = Field(default_factory=uuid4)
    therapist_id: UUID | None = None
    status: str = Field(default=AssignmentStatus.ACTIVE.value, max_length=20)


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
    has_video: bool = False
    created_at: datetime


class PatientAssignmentRead(AssignmentRead):
    model_config = ConfigDict(from_attributes=True)

    exercise: PatientExerciseRead
    sessions: list[PatientSessionRead] = Field(default_factory=list)


class AssignmentUpdate(BaseModel):
    """What a therapist may change. The start date is fixed once the assignment exists,
    so sending `starts_on` (or any unknown field) is rejected instead of ignored."""

    model_config = ConfigDict(extra="forbid")

    repetitions: int | None = Field(default=None, ge=1, le=500)
    duration_weeks: int | None = Field(default=None, ge=1)
    weekdays: list[int] | None = Field(default=None, min_length=1, max_length=7)

    @field_validator("weekdays")
    @classmethod
    def check_weekdays(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        return _validate_weekdays(value)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "AssignmentUpdate":
        values = [self.repetitions, self.duration_weeks, self.weekdays]
        if all(f is None for f in values):
            raise ValueError("Provide at least one field")
        return self
