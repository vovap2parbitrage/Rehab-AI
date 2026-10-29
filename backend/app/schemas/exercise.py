from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class ExerciseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    reference_video_key: str | None = Field(default=None, max_length=512)
    joint_tolerances: dict[str, float] = Field(default_factory=dict)


class ExerciseRead(ExerciseCreate):
    id: UUID = Field(default_factory=uuid4)
    created_by: UUID
