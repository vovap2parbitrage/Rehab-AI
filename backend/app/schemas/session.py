from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    patient_id: UUID
    assignment_id: UUID
    pain_score: int = Field(ge=0, le=10)

class SessionResult(BaseModel):
    score: float = Field(ge=0, le=100)
    joint_deviations: dict[str, float]
    skeleton_snapshot_key: str | None = Field(
        default=None,
        max_length=500,
    )

class SessionRead(BaseModel):
    id: UUID
    patient_id: UUID
    assignment_id: UUID
    score: float | None = None
    joint_deviations: dict[str, float] | None = None
    pain_score: int
    skeleton_snapshot_key: str | None = None
    status: str
    created_at: datetime