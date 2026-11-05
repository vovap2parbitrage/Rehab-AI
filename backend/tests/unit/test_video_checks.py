import numpy as np
import pytest

from app.services.comparison import video_checks
from app.services.comparison.video_checks import InvalidVideoError, validate_video_file


def test_rejects_non_video_content(tmp_path):
    f = tmp_path / "v.mp4"
    f.write_bytes(b"MZ\x90\x00 this is an exe renamed to mp4")
    with pytest.raises(InvalidVideoError, match="not a supported video"):
        validate_video_file(f)


def test_rejects_ftyp_header_without_readable_video(tmp_path):
    f = tmp_path / "v.mp4"
    f.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64)
    with pytest.raises(InvalidVideoError):
        validate_video_file(f)


def test_rejects_too_long_video(tmp_path, monkeypatch):
    import cv2

    f = tmp_path / "v.mp4"
    writer = cv2.VideoWriter(str(f), cv2.VideoWriter_fourcc(*"mp4v"), 10, (64, 64))
    for _ in range(30):
        writer.write(np.zeros((64, 64, 3), dtype=np.uint8))
    writer.release()

    validate_video_file(f)  # 3 s is fine
    monkeypatch.setattr(video_checks.settings, "max_video_seconds", 1)
    with pytest.raises(InvalidVideoError, match="longer than"):
        validate_video_file(f)
