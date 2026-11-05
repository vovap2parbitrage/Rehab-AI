import logging
import tempfile
from pathlib import Path

import httpx

from app.services.comparison.pipeline import compare
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

MAX_VIDEO_BYTES = 200 * 1024 * 1024
DOWNLOAD_TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
CHUNK_SIZE = 1024 * 1024


class DownloadError(Exception):
    pass


def download_video(url: str, dest: Path) -> None:
    """Stream a video to `dest`, refusing redirects and files over MAX_VIDEO_BYTES."""
    size = 0
    try:
        with httpx.stream(
            "GET", url, timeout=DOWNLOAD_TIMEOUT, follow_redirects=False
        ) as response:
            response.raise_for_status()
            declared = response.headers.get("content-length")
            if declared and int(declared) > MAX_VIDEO_BYTES:
                raise DownloadError("Video file is too large.")
            with dest.open("wb") as out:
                for chunk in response.iter_bytes(CHUNK_SIZE):
                    size += len(chunk)
                    if size > MAX_VIDEO_BYTES:
                        raise DownloadError("Video file is too large.")
                    out.write(chunk)
    except httpx.HTTPError as exc:
        raise DownloadError("Could not download the video.") from exc


@celery_app.task(
    name="video_analysis.analyze",
    soft_time_limit=540,
    time_limit=600,
)
def analyze_video_task(
    reference_url: str,
    patient_url: str,
    body_parts: list[str],
    tolerances_deg: dict[str, float],
) -> dict:
    try:
        with tempfile.TemporaryDirectory(prefix="rehab_cmp_") as tmp:
            reference_path = Path(tmp) / "reference.mp4"
            patient_path = Path(tmp) / "patient.mp4"
            download_video(reference_url, reference_path)
            download_video(patient_url, patient_path)
            return compare(
                str(reference_path), str(patient_path), body_parts, tolerances_deg
            )
    except DownloadError as exc:
        return {"status": "failed", "message": str(exc)}
    except Exception:
        logger.exception("Video analysis failed")
        return {"status": "failed", "message": "Analysis failed."}
