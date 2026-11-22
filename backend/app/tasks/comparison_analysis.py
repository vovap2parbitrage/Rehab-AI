import logging
import tempfile
from pathlib import Path

from app.services import storage
from app.services.comparison.pipeline import compare
from app.services.comparison.video_checks import InvalidVideoError, validate_video_file
from app.services.comparison_session import record_session
from app.services.storage import StorageError
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def download_video(key: str, dest: Path) -> None:
    storage.download_video(key, dest)
    validate_video_file(dest)


def _discard_video(key: str) -> None:
    """Delete a patient's video that did not become a session (best effort)."""
    try:
        storage.delete_video(key)
    except StorageError:
        logger.warning("Could not delete the unused video %s", key)


@celery_app.task(
    name="comparison.analyze",
    soft_time_limit=540,
    time_limit=600,
)
def analyze_video_task(
    reference_key: str,
    patient_key: str,
    body_parts: list[str],
    tolerances_deg: dict[str, float],
    assignment_id: str | None = None,
    pain_score: int | None = None,
    task_id: str | None = None,
    exercise_version_id: str | None = None,
) -> dict:
    try:
        with tempfile.TemporaryDirectory(prefix="rehab_cmp_") as tmp:
            reference_path = Path(tmp) / "reference.mp4"
            patient_path = Path(tmp) / "patient.mp4"
            download_video(reference_key, reference_path)
            download_video(patient_key, patient_path)
            report = compare(
                str(reference_path), str(patient_path), body_parts, tolerances_deg
            )
    except (StorageError, InvalidVideoError) as exc:
        if assignment_id:
            _discard_video(patient_key)
        return {"status": "failed", "message": str(exc)}
    except Exception:
        logger.exception("Video analysis failed")
        if assignment_id:
            _discard_video(patient_key)
        return {"status": "failed", "message": "Analysis failed."}

    # Without an assignment this is a plain comparison: nothing to save or clean up.
    if not (assignment_id and task_id):
        return report

    if report.get("status") == "done":
        try:
            session_id = record_session(
                assignment_id, task_id, pain_score, report, patient_key, exercise_version_id
            )
        except Exception:
            logger.exception("Could not save the session for comparison %s", task_id)
            _discard_video(patient_key)
            return {"status": "failed", "message": "Could not save the result."}
        return {**report, "session_id": session_id}

    # rerecord / no_repetitions: no session, so the patient will record a new video.
    _discard_video(patient_key)
    return report
