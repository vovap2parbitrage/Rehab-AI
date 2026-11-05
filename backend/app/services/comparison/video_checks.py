import math
from pathlib import Path

import cv2

from app.core.config import settings


class InvalidVideoError(Exception):
    """Safe-to-show reason the file cannot be analysed."""


def _looks_like_mp4_or_mov(header: bytes) -> bool:
    # ISO base media files (mp4 / mov) carry an "ftyp" box right after the 4-byte size.
    return len(header) >= 12 and header[4:8] == b"ftyp"


def validate_video_file(path: Path) -> None:
    """Check the real file content, not the name or the declared content type."""
    with path.open("rb") as fh:
        if not _looks_like_mp4_or_mov(fh.read(12)):
            raise InvalidVideoError("The file is not a supported video (mp4 or mov).")

    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise InvalidVideoError("The video cannot be read.")
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    finally:
        cap.release()

    if not fps or math.isnan(fps) or fps <= 0 or frames <= 0:
        raise InvalidVideoError("The video cannot be read.")
    if frames / fps > settings.max_video_seconds:
        raise InvalidVideoError(
            f"The video is longer than {settings.max_video_seconds} seconds."
        )
