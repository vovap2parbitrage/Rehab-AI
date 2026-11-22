import subprocess
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.services.comparison import video_checks
from app.services.comparison.video_checks import InvalidVideoError, prepare_video


def _write_mp4(path: Path, seconds: int, fps: int = 10) -> Path:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (64, 64))
    for _ in range(seconds * fps):
        writer.write(np.zeros((64, 64, 3), dtype=np.uint8))
    writer.release()
    return path


def _ffmpeg(*args: str) -> None:
    subprocess.run(
        [video_checks._ffmpeg_exe(), "-nostdin", "-loglevel", "error", "-y", *args],
        check=True,
        capture_output=True,
    )


def _test_pattern(seconds: int) -> list[str]:
    return ["-f", "lavfi", "-i", f"testsrc=duration={seconds}:size=64x64:rate=15"]


def _write_browser_webm(path: Path, seconds: int) -> Path:
    """Like MediaRecorder output: a live WebM stream without duration or cues."""
    _ffmpeg(
        *_test_pattern(seconds),
        "-c:v",
        "libvpx",
        "-b:v",
        "200k",
        "-f",
        "webm",
        "-live",
        "1",
        str(path),
    )
    return path


def _write_fragmented_mp4(path: Path, seconds: int) -> Path:
    """Like Chrome's MP4 recording: fragmented, with an empty `moov` box."""
    _ffmpeg(
        *_test_pattern(seconds),
        "-c:v",
        "mpeg4",
        "-f",
        "mp4",
        "-movflags",
        "frag_keyframe+empty_moov+default_base_moof",
        str(path),
    )
    return path


def _duration(path: Path) -> float:
    cap = cv2.VideoCapture(str(path))
    try:
        return cap.get(cv2.CAP_PROP_FRAME_COUNT) / cap.get(cv2.CAP_PROP_FPS)
    finally:
        cap.release()


def test_rejects_non_video_content(tmp_path):
    f = tmp_path / "v.mp4"
    f.write_bytes(b"MZ\x90\x00 this is an exe renamed to mp4")
    with pytest.raises(InvalidVideoError, match="not a supported video"):
        prepare_video(f)


def test_rejects_matroska_that_is_not_webm(tmp_path):
    f = tmp_path / "v"
    f.write_bytes(video_checks.EBML_MAGIC + b"\x42\x82\x88matroska" + b"\x00" * 64)
    with pytest.raises(InvalidVideoError, match="not a supported video"):
        prepare_video(f)


def test_rejects_ftyp_header_without_readable_video(tmp_path):
    f = tmp_path / "v.mp4"
    f.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64)
    with pytest.raises(InvalidVideoError):
        prepare_video(f)


def test_rejects_webm_header_without_readable_video(tmp_path):
    f = tmp_path / "v"
    f.write_bytes(video_checks.EBML_MAGIC + b"\x42\x82\x84webm" + b"\x00" * 64)
    with pytest.raises(InvalidVideoError, match="cannot be read"):
        prepare_video(f)


def test_readable_mp4_is_used_as_it_is(tmp_path):
    f = _write_mp4(tmp_path / "v.mp4", seconds=3)
    assert prepare_video(f) == f
    assert list(tmp_path.iterdir()) == [f]  # nothing converted


def test_rejects_too_long_video(tmp_path, monkeypatch):
    f = _write_mp4(tmp_path / "v.mp4", seconds=3)

    prepare_video(f)  # 3 s is fine
    monkeypatch.setattr(video_checks.settings, "max_video_seconds", 1)
    with pytest.raises(InvalidVideoError, match="longer than"):
        prepare_video(f)


def test_allows_a_recording_that_ends_just_after_the_limit(tmp_path, monkeypatch):
    f = _write_mp4(tmp_path / "v.mp4", seconds=3)
    monkeypatch.setattr(video_checks.settings, "max_video_seconds", 2.5)
    assert prepare_video(f) == f


def test_browser_webm_is_converted_to_a_readable_mp4(tmp_path):
    source = _write_browser_webm(tmp_path / "patient", seconds=3)

    result = prepare_video(source)

    assert result != source
    assert result.read_bytes()[4:8] == b"ftyp"
    assert _duration(result) == pytest.approx(3, abs=0.2)
    cap = cv2.VideoCapture(str(result))
    assert cap.get(cv2.CAP_PROP_FPS) == video_checks.NORMALISED_FPS
    cap.release()


def test_too_long_webm_is_rejected(tmp_path, monkeypatch):
    source = _write_browser_webm(tmp_path / "patient", seconds=5)
    monkeypatch.setattr(video_checks.settings, "max_video_seconds", 2)
    with pytest.raises(InvalidVideoError, match="longer than 2 seconds"):
        prepare_video(source)


def test_fragmented_mp4_recording_is_converted(tmp_path):
    source = _write_fragmented_mp4(tmp_path / "patient.mp4", seconds=3)
    assert video_checks._is_fragmented_mp4(source)

    result = prepare_video(source)

    assert result.name == "patient.normalised.mp4"
    assert _duration(result) == pytest.approx(3, abs=0.2)


def test_regular_mp4_is_not_fragmented(tmp_path):
    assert not video_checks._is_fragmented_mp4(_write_mp4(tmp_path / "v.mp4", seconds=1))


def test_mp4_without_reliable_metadata_is_converted(tmp_path, monkeypatch):
    source = _write_mp4(tmp_path / "patient.mp4", seconds=3)
    real_read = video_checks._read_metadata
    monkeypatch.setattr(
        video_checks,
        "_read_metadata",
        lambda path: None if path == source else real_read(path),
    )

    result = prepare_video(source)

    assert result.name == "patient.normalised.mp4"
    assert _duration(result) == pytest.approx(3, abs=0.2)


def test_implausible_frame_rate_counts_as_missing_metadata(tmp_path, monkeypatch):
    f = _write_mp4(tmp_path / "v.mp4", seconds=1)
    assert video_checks._read_metadata(f) is not None

    class _Capture:
        def __init__(self, path):
            pass

        def isOpened(self):
            return True

        def get(self, prop):
            return 1000.0 if prop == cv2.CAP_PROP_FPS else 10.0

        def release(self):
            pass

    monkeypatch.setattr(video_checks.cv2, "VideoCapture", _Capture)
    assert video_checks._read_metadata(f) is None


def test_missing_ffmpeg_is_a_safe_error(tmp_path, monkeypatch):
    source = _write_browser_webm(tmp_path / "patient", seconds=1)
    monkeypatch.setattr(video_checks, "_ffmpeg_exe", lambda: str(tmp_path / "no-ffmpeg"))
    with pytest.raises(InvalidVideoError, match="cannot be read"):
        prepare_video(source)
