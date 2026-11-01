from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


class BodyPart(str, Enum):
    left_arm = "left_arm"
    right_arm = "right_arm"
    left_leg = "left_leg"
    right_leg = "right_leg"
    torso = "torso"

class ComparisonRequest(BaseModel):
    reference_url: HttpUrl
    patient_url: HttpUrl
    body_part: list[BodyPart] = Field(min_length=1)
    tolerances_deg: dict[str, float] = Field(default_factory=dict)

    @field_validator
    @classmethod
    def tolerance_positive(cls, v: dict[str, float]) -> dict[str, float]:
        if any(t <= 0 for t in v.values()):
            raise ValueError("tolerance must be > 0")
        return v


class ComparisonCreated(BaseModel):
    task_id: str


class ErrorSegment(BaseModel):
    joint: str
    start_s: float
    end_s: float
    peak_deviation_deg: float
    direction: str


class Quality(BaseModel):
    reference_valid_frames_pct: float
    patient_valid_frames_pct: float
    ok: bool


class ComparisonResult(BaseModel):
    task_id: str
    status: Literal["pending", "done", "rerecord", "no_repetitions", "failed"]
    score: float | None = None
    worst_repetition_score: float | None = None
    repetitions: int | None = None
    repetition_scores: list[float] | None = None
    joint_scores: dict[str, float] | None = None
    errors: list[ErrorSegment] | None = None
    quality: Quality | None = None
    message: str | None = None
