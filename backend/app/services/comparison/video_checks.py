import logging
import math
import subprocess
from pathlib import Path

import cv2

from app.core.config import settings

logger = logging.getLogger(__name__)

EBML_MAGIC = b"\x1a\x45\xdf\xa3"
# Frame rate of the converted copy. Browser recordings have a variable frame rate,
# so the analysis gets a constant one that matches the real timing of the video.
NORMALISED_FPS = 30
# Above this the reported frame rate is a container time base, not a real one.
MAX_PLAUSIBLE_FPS = 240
FFMPEG_TIMEOUT_SECONDS = 300
# The app stops a recording at the limit, but the browser may add a few frames after it.
LENGTH_TOLERANCE_SECONDS = 1.0
MAX_TOP_LEVEL_BOXES = 1000


class InvalidVideoError(Exception):
    """Safe-to-show reason the file cannot be analysed."""


def _looks_like_mp4_or_mov(header: bytes) -> bool:
    # ISO base media files (mp4 / mov) carry an "ftyp" box right after the 4-byte size.
    return len(header) >= 12 and header[4:8] == b"ftyp"


def _looks_like_webm(header: bytes) -> bool:
    # WebM is a Matroska (EBML) file whose header declares the "webm" doc type.
    return header.startswith(EBML_MAGIC) and b"webm" in header[:64]


def _is_fragmented_mp4(path: Path) -> bool:
    """True when the file has top-level `moof` boxes, as browser MP4 recordings do.

    Their frame rate and frame count are unreliable, so they are always converted.
    """
    with path.open("rb") as fh:
        for _ in range(MAX_TOP_LEVEL_BOXES):
            header = fh.read(8)
            if len(header) < 8:
                return False
            size = int.from_bytes(header[:4], "big")
            kind = header[4:8]
            if kind == b"moof":
                return True
            header_size = 8
            if size == 1:  # 64-bit box size follows the type
                large = fh.read(8)
                if len(large) < 8:
                    return False
                size = int.from_bytes(large, "big")
                header_size = 16
            if size < header_size:  # 0 means "to the end of the file"
                return False
            fh.seek(size - header_size, 1)
    return False


def _read_metadata(path: Path) -> tuple[float, float] | None:
    """Frame rate and frame count, or None when the container does not carry them."""
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            return None
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    finally:
        cap.release()
    if not fps or math.isnan(fps) or fps <= 0 or fps > MAX_PLAUSIBLE_FPS:
        return None
    if not frames or math.isnan(frames) or frames <= 0:
        return None
    return fps, frames


def _ffmpeg_exe() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def _normalise(source: Path, dest: Path) -> None:
    """Re-encode a browser recording into an MP4 with a constant frame rate.

    MediaRecorder output (WebM, fragmented MP4) has no duration or frame count, so
    OpenCV cannot tell how long it is. Only a little more than `max_video_seconds` is
    converted, which keeps the work bounded and still lets the length check fail.
    """
    command = [
        _ffmpeg_exe(),
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-an",
        "-t",
        str(settings.max_video_seconds + 2 * LENGTH_TOLERANCE_SECONDS),
        "-vf",
        f"fps={NORMALISED_FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v",
        "mpeg4",
        "-q:v",
        "3",
        str(dest),
    ]
    try:
        subprocess.run(
            command,
            check=True,
            capture_output=True,
            timeout=FFMPEG_TIMEOUT_SECONDS,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        stderr = getattr(exc, "stderr", b"") or b""
        logger.warning("ffmpeg could not convert the video: %s", stderr[-500:])
        raise InvalidVideoError("The video cannot be read.") from exc
    except OSError as exc:
        logger.exception("ffmpeg is not available")
        raise InvalidVideoError("The video cannot be read.") from exc


def _check_length(fps: float, frames: float) -> None:
    if frames / fps > settings.max_video_seconds + LENGTH_TOLERANCE_SECONDS:
        raise InvalidVideoError(f"The video is longer than {settings.max_video_seconds} seconds.")


def prepare_video(path: Path) -> Path:
    """Check the real file content and return a file the analysis can read.

    Uploaded MP4 / MOV files with proper metadata are used as they are. Browser
    recordings (WebM, fragmented MP4, MP4 without a frame count) are converted next
    to `path`.
    The declared content type and the file name are never trusted.
    """
    with path.open("rb") as fh:
        header = fh.read(64)
    is_iso = _looks_like_mp4_or_mov(header)
    if not is_iso and not _looks_like_webm(header):
        raise InvalidVideoError("The file is not a supported video (mp4, mov or webm).")

    if is_iso and not _is_fragmented_mp4(path):
        metadata = _read_metadata(path)
        if metadata is not None:
            _check_length(*metadata)
            return path

    normalised = path.with_name(f"{path.stem}.normalised.mp4")
    _normalise(path, normalised)
    metadata = _read_metadata(normalised)
    if metadata is None:
        raise InvalidVideoError("The video cannot be read.")
    _check_length(*metadata)
    return normalised
