from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.services.comparison.angles import JOINT_TRIPLETS, TORSO_TILT

KNOWN_JOINTS = {*JOINT_TRIPLETS, TORSO_TILT}
MAX_TOLERANCE_DEG = 90.0
VIDEO_KEY_PATTERN = r"^videos/[A-Za-z0-9_-]{1,64}/[0-9a-f]{32}\.(mp4|mov)$"


class BodyPart(str, Enum):
    left_arm = "left_arm"
    right_arm = "right_arm"
    left_leg = "left_leg"
    right_leg = "right_leg"
    torso = "torso"

class UploadRequest(BaseModel):
    content_type: Literal["video/mp4", "video/quicktime"]


class UploadTarget(BaseModel):
    key: str
    url: str
    fields: dict[str, str]


class ComparisonRequest(BaseModel):
    reference_key: str = Field(pattern=VIDEO_KEY_PATTERN)
    patient_key: str = Field(pattern=VIDEO_KEY_PATTERN)
    body_parts: list[BodyPart] = Field(min_length=1, max_length=len(BodyPart))
    tolerances_deg: dict[str, float] = Field(default_factory=dict, max_length=len(KNOWN_JOINTS))

    @field_validator("body_parts")
    @classmethod
    def body_parts_unique(cls, v: list[BodyPart]) -> list[BodyPart]:
        if len(set(v)) != len(v):
            raise ValueError("body_parts must not repeat")
        return v

    @field_validator("tolerances_deg")
    @classmethod
    def tolerances_valid(cls, v: dict[str, float]) -> dict[str, float]:
        unknown = set(v) - KNOWN_JOINTS
        if unknown:
            raise ValueError(f"unknown joints: {sorted(unknown)}")
        if any(not 0 < t <= MAX_TOLERANCE_DEG for t in v.values()):
            raise ValueError(f"tolerance must be > 0 and <= {MAX_TOLERANCE_DEG}")
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
