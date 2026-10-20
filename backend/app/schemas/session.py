from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    patient_id: UUID
    assignment_id: UUID
    score: float = Field(ge=0, le=100)
    joint_deviations: dict[str, float] = Field(default_factory=dict)
    pain_score: int = Field(ge=0, le=10)
    skeleton_snapshot_key: str | None = Field(default=None, max_length=500)


class SessionRead(SessionCreate):
    id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
