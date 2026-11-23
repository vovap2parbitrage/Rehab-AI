from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.body_part import BodyPart
from app.schemas.comparison import KNOWN_JOINTS, MAX_TOLERANCE_DEG
from app.services.comparison.angles import BODY_PARTS as JOINTS_BY_BODY_PART
from app.services.comparison.scoring import DEFAULT_TOLERANCE

BODY_PARTS = {part.value for part in BodyPart}


class ExerciseFields(BaseModel):
    """What an exercise consists of. Plain data, so stored rows are always readable."""

    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    reference_video_key: str | None = Field(default=None, max_length=512)
    joint_tolerances: dict[str, float] = Field(default_factory=dict)
    body_parts: list[str] = Field(default_factory=list, max_length=len(BODY_PARTS))


class ExerciseCreate(ExerciseFields):
    """What a therapist sends; the rules below apply to new input only."""

    @field_validator("body_parts")
    @classmethod
    def body_parts_valid(cls, v: list[str]) -> list[str]:
        if len(set(v)) != len(v):
            raise ValueError("body_parts must not repeat")
        unknown = set(v) - BODY_PARTS
        if unknown:
            raise ValueError(f"unknown body parts: {sorted(unknown)}")
        return v

    @field_validator("joint_tolerances")
    @classmethod
    def tolerances_valid(cls, v: dict[str, float]) -> dict[str, float]:
        unknown = set(v) - KNOWN_JOINTS
        if unknown:
            raise ValueError(f"unknown joints: {sorted(unknown)}")
        if any(not 0 < tolerance <= MAX_TOLERANCE_DEG for tolerance in v.values()):
            raise ValueError(f"a tolerance must be above 0 and at most {MAX_TOLERANCE_DEG:g} degrees")
        return v

    @model_validator(mode="after")
    def tolerances_belong_to_body_parts(self) -> "ExerciseCreate":
        allowed = {
            joint for part in self.body_parts for joint in JOINTS_BY_BODY_PART.get(part, [])
        }
        outside = set(self.joint_tolerances) - allowed
        if outside:
            raise ValueError(
                f"tolerances for joints outside the selected body parts: {sorted(outside)}"
            )
        return self


class ExerciseUpdate(ExerciseCreate):
    # Move the active assignments of this exercise to its newest version. By default they
    # stay on the version they were given, so their scores remain comparable.
    apply_to_active_assignments: bool = False


class ExerciseRead(ExerciseFields):
    id: UUID = Field(default_factory=uuid4)
    created_by: UUID
    version: int = 1
    active_assignments: int = 0
    # Every assignment ever made from this exercise: while there is one it cannot be deleted.
    assignments_total: int = 0
    hidden: bool = False


class ScoringOptions(BaseModel):
    """What a tolerance editor needs to know; taken from the scoring code itself."""

    joints_by_body_part: dict[str, list[str]]
    default_tolerance_deg: float
    max_tolerance_deg: float
