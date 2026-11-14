from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


BODY_PARTS = ("left_arm", "right_arm", "left_leg", "right_leg", "torso")


class ExerciseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    reference_video_key: str | None = Field(default=None, max_length=512)
    joint_tolerances: dict[str, float] = Field(default_factory=dict)
    body_parts: list[str] = Field(default_factory=list, max_length=len(BODY_PARTS))

    @field_validator("body_parts")
    @classmethod
    def body_parts_valid(cls, v: list[str]) -> list[str]:
        if len(set(v)) != len(v):
            raise ValueError("body_parts must not repeat")
        unknown = set(v) - set(BODY_PARTS)
        if unknown:
            raise ValueError(f"unknown body parts: {sorted(unknown)}")
        return v


class ExerciseRead(ExerciseCreate):
    id: UUID = Field(default_factory=uuid4)
    created_by: UUID
