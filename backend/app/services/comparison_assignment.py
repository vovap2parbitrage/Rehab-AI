"""Turn "this video is for assignment X" into everything the analysis needs.

The reference video, body parts and tolerances are read from the assignment's exercise
(the doctor's data), never from the request, so a patient cannot swap them.
"""

from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.assignment import Assignment
from app.models.user import User
from app.schemas.comparison import KNOWN_JOINTS, MAX_TOLERANCE_DEG, ComparisonRequest
from app.services import storage


@dataclass(frozen=True)
class PreparedComparison:
    assignment_id: UUID
    reference_key: str
    patient_key: str
    body_parts: list[str]
    tolerances_deg: dict[str, float]
    pain_score: int | None


def prepare_comparison(db: Session, req: ComparisonRequest, user: User) -> PreparedComparison:
    assignment = (
        db.query(Assignment)
        .filter(Assignment.id == req.assignment_id, Assignment.patient.has(user_id=user.id))
        .first()
    )
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    if assignment.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "Assignment is not active")
    if not storage.is_owned_key(req.patient_key, str(user.id)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Video does not belong to you")

    exercise = assignment.exercise
    if not exercise.reference_video_key or not storage.is_valid_key(exercise.reference_video_key):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "The exercise has no reference video yet"
        )
    if not exercise.body_parts:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "The exercise has no body parts to compare yet"
        )

    tolerances = {
        joint: float(value)
        for joint, value in (exercise.joint_tolerances or {}).items()
        if joint in KNOWN_JOINTS and 0 < value <= MAX_TOLERANCE_DEG
    }
    return PreparedComparison(
        assignment_id=assignment.id,
        reference_key=exercise.reference_video_key,
        patient_key=req.patient_key,
        body_parts=list(exercise.body_parts),
        tolerances_deg=tolerances,
        pain_score=req.pain_score,
    )
