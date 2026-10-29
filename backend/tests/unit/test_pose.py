import cv2
import numpy as np

from app.services.comparison.pose import extract_pose


def _write_black_video(path: str, frames: int = 10, size=(320, 240)) -> None:
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 10.0, size)
    for _ in range(frames):
        writer.write(np.zeros((size[1], size[0], 3), dtype=np.uint8))
    writer.release()


def test_no_person_gives_nan_and_not_detected(tmp_path):
    video = str(tmp_path / "black.mp4")
    _write_black_video(video)

    seq = extract_pose(video)

    assert seq.points.shape == (10, 33, 2)
    assert seq.visibility.shape == (10, 33)
    assert not seq.detected.any()
    assert np.isnan(seq.points).all()


def test_missing_file_raises(tmp_path):
    import pytest

    with pytest.raises(ValueError):
        extract_pose(str(tmp_path / "nope.mp4"))
