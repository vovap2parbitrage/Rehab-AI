import logging
import tempfile
from pathlib import Path

from app.services import storage
from app.services.comparison.pipeline import compare
from app.services.comparison.video_checks import InvalidVideoError, validate_video_file
from app.services.storage import StorageError
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def download_video(key: str, dest: Path) -> None:
    storage.download_video(key, dest)
    validate_video_file(dest)


@celery_app.task(
    name="video_analysis.analyze",
    soft_time_limit=540,
    time_limit=600,
)
def analyze_video_task(
    reference_key: str,
    patient_key: str,
    body_parts: list[str],
    tolerances_deg: dict[str, float],
) -> dict:
    try:
        with tempfile.TemporaryDirectory(prefix="rehab_cmp_") as tmp:
            reference_path = Path(tmp) / "reference.mp4"
            patient_path = Path(tmp) / "patient.mp4"
            download_video(reference_key, reference_path)
            download_video(patient_key, patient_path)
            return compare(
                str(reference_path), str(patient_path), body_parts, tolerances_deg
            )
    except (StorageError, InvalidVideoError) as exc:
        return {"status": "failed", "message": str(exc)}
    except Exception:
        logger.exception("Video analysis failed")
        return {"status": "failed", "message": "Analysis failed."}
