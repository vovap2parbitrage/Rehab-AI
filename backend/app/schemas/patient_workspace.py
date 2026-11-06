from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PatientDoctorRead(BaseModel):
    id: UUID
    email: str


class PatientInvitationRead(BaseModel):
    id: UUID
    patient_id: UUID
    therapist_id: UUID
    therapist_email: str
    status: Literal["pending", "accepted", "declined", "revoked"]
    message: str | None = None
    created_at: datetime
    responded_at: datetime | None = None


class PatientInvitationRespond(BaseModel):
    status: Literal["accepted", "declined"]


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


class PatientAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    patient_id: UUID
    exercise_id: UUID
    repetitions: int
    sessions_per_week: int
    starts_on: date
    ends_on: date | None = None
    status: str
    exercise: PatientExerciseRead
    sessions: list[PatientSessionRead] = Field(default_factory=list)


class PatientSessionCreate(BaseModel):
    pain_score: int | None = Field(default=None, ge=0, le=10)
