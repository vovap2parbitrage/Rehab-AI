from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.services.comparison.angles import JOINT_TRIPLETS, TORSO_TILT

KNOWN_JOINTS = {*JOINT_TRIPLETS, TORSO_TILT}
MAX_TOLERANCE_DEG = 90.0
VIDEO_KEY_PATTERN = r"^videos/[A-Za-z0-9_-]{1,64}/[0-9a-f]{32}\.(mp4|mov|webm)$"


class UploadRequest(BaseModel):
    content_type: Literal["video/mp4", "video/quicktime", "video/webm"]


class UploadTarget(BaseModel):
    key: str
    url: str
    fields: dict[str, str]


class ComparisonRequest(BaseModel):
    assignment_id: UUID
    patient_key: str = Field(pattern=VIDEO_KEY_PATTERN)
    pain_score: int | None = Field(default=None, ge=0, le=10)
    video_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


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
    # Set once the analysis has been saved as a training session.
    session_id: str | None = None
