from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    assignment_id: UUID
    pain_score: int | None = Field(default=None, ge=0, le=10)
    completed_at: datetime | None = None


class SessionRead(SessionCreate):
    id: UUID = Field(default_factory=uuid4)
    score: float | None = Field(default=None, ge=0, le=100)
    joint_deviations: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
