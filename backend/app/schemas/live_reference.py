from uuid import UUID

from pydantic import BaseModel


class LiveReferenceRead(BaseModel):
    """What the recording screen needs to judge repetitions while the patient moves."""

    exercise_version_id: UUID
    joints: list[str]
    fps: float
    # One row per reference frame, one angle (degrees) per joint, in `joints` order.
    angles: list[list[float]]
    tolerances: dict[str, float]
    default_tolerance_deg: float
