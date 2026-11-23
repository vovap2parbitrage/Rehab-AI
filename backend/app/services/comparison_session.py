"""Save a finished video analysis as a training session of the assignment."""

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models.session import TrainingSession

logger = logging.getLogger(__name__)


def record_session(
    assignment_id: str,
    task_id: str,
    pain_score: int | None,
    report: dict,
    video_key: str | None = None,
    exercise_version_id: str | None = None,
    video_sha256: str | None = None,
) -> str:
    """Create the session for a successful analysis and return its id.

    If this analysis was already saved, the existing session's id is returned.
    """
    deviations = {
        key: report[key]
        for key in (
            "joint_scores",
            "errors",
            "repetitions",
            "repetition_scores",
            "worst_repetition_score",
        )
        if key in report
    }
    session = TrainingSession(
        assignment_id=UUID(assignment_id),
        comparison_task_id=task_id,
        score=report.get("score"),
        joint_deviations=deviations,
        pain_score=pain_score,
        video_key=video_key,
        video_sha256=video_sha256,
        exercise_version_id=UUID(exercise_version_id) if exercise_version_id else None,
        completed_at=datetime.now(UTC),
    )
    with SessionLocal() as db:
        db.add(session)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.info("Session for comparison %s already exists", task_id)
            existing = (
                db.query(TrainingSession.id)
                .filter(TrainingSession.comparison_task_id == task_id)
                .one()
            )
            return str(existing.id)
        return str(session.id)
