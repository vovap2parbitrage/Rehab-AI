"""The reference angles for the live recording assistant.

Everything comes from the assignment's exercise version (the doctor's data), exactly like the
final analysis, so the live hints and the analysis judge against the same reference.
"""

import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.statuses import AssignmentStatus
from app.models.assignment import Assignment
from app.models.user import User
from app.schemas.comparison import KNOWN_JOINTS, MAX_TOLERANCE_DEG
from app.schemas.live_reference import LiveReferenceRead
from app.services import storage
from app.services.comparison.scoring import DEFAULT_TOLERANCE


def compute_reference(reference_key: str, body_parts: list[str]) -> dict | None:
    # Imported here: the pose libraries are heavy and only this path needs them.
    from app.services.comparison.pipeline import live_reference

    with tempfile.TemporaryDirectory(prefix="rehab_live_") as tmp:
        path = Path(tmp) / "reference"
        storage.download_video(reference_key, path)
        return live_reference(str(path), body_parts)


def get_live_reference(db: Session, assignment_id: UUID, user: User) -> LiveReferenceRead:
    assignment = (
        db.query(Assignment)
        .filter(Assignment.id == assignment_id, Assignment.patient.has(user_id=user.id))
        .first()
    )
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    if assignment.status != AssignmentStatus.ACTIVE.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "Assignment is not active")

    version = assignment.exercise_version
    if (
        not version.reference_video_key
        or not storage.is_valid_key(version.reference_video_key)
        or not version.body_parts
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "The exercise has no reference to follow yet")

    if version.live_reference is None:
        try:
            computed = compute_reference(version.reference_video_key, list(version.body_parts))
        except storage.StorageError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, "The reference video cannot be read") from exc
        if computed is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "The selected body parts are not clear in the reference video"
            )
        version.live_reference = computed
        db.commit()

    stored = version.live_reference
    tolerances = {
        joint: float(value)
        for joint, value in (version.joint_tolerances or {}).items()
        if joint in KNOWN_JOINTS and 0 < value <= MAX_TOLERANCE_DEG
    }
    return LiveReferenceRead(
        exercise_version_id=version.id,
        joints=stored["joints"],
        fps=stored["fps"],
        angles=stored["angles"],
        tolerances=tolerances,
        default_tolerance_deg=DEFAULT_TOLERANCE,
    )
