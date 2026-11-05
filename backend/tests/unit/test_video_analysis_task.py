from pathlib import Path

import pytest

from app.tasks import video_analysis
from app.tasks.video_analysis import DownloadError, analyze_video_task


def _fake_download(url: str, dest: Path) -> None:
    dest.write_bytes(b"video")


def test_returns_compare_report(monkeypatch):
    seen = {}

    def fake_compare(ref, pat, parts, tol):
        seen["paths"] = (ref, pat)
        seen["args"] = (parts, tol)
        return {"status": "done", "score": 8.0}

    monkeypatch.setattr(video_analysis, "download_video", _fake_download)
    monkeypatch.setattr(video_analysis, "compare", fake_compare)

    result = analyze_video_task.run("https://x/ref", "https://x/pat", ["torso"], {"torso": 5.0})

    assert result == {"status": "done", "score": 8.0}
    assert seen["args"] == (["torso"], {"torso": 5.0})


def test_temp_files_are_deleted(monkeypatch):
    seen = {}

    def fake_compare(ref, pat, parts, tol):
        seen["paths"] = (ref, pat)
        assert Path(ref).exists() and Path(pat).exists()
        return {"status": "done"}

    monkeypatch.setattr(video_analysis, "download_video", _fake_download)
    monkeypatch.setattr(video_analysis, "compare", fake_compare)

    analyze_video_task.run("https://x/ref", "https://x/pat", ["torso"], {})

    assert not Path(seen["paths"][0]).exists()
    assert not Path(seen["paths"][1]).exists()


def test_download_error_returns_failed(monkeypatch):
    def failing(url, dest):
        raise DownloadError("Could not download the video.")

    monkeypatch.setattr(video_analysis, "download_video", failing)

    result = analyze_video_task.run("https://x/ref", "https://x/pat", ["torso"], {})

    assert result == {"status": "failed", "message": "Could not download the video."}


def test_unexpected_error_hides_details(monkeypatch):
    def boom(*args):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(video_analysis, "download_video", _fake_download)
    monkeypatch.setattr(video_analysis, "compare", boom)

    result = analyze_video_task.run("https://x/ref", "https://x/pat", ["torso"], {})

    assert result == {"status": "failed", "message": "Analysis failed."}


@pytest.mark.parametrize("size", [10, 11])
def test_download_rejects_oversized_file(monkeypatch, tmp_path, size):
    class FakeResponse:
        def __init__(self):
            self.headers = {}

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def raise_for_status(self):
            pass

        def iter_bytes(self, n):
            yield b"x" * size

    monkeypatch.setattr(video_analysis, "MAX_VIDEO_BYTES", 10)
    monkeypatch.setattr(video_analysis.httpx, "stream", lambda *a, **k: FakeResponse())

    dest = tmp_path / "v.mp4"
    if size > 10:
        with pytest.raises(DownloadError):
            video_analysis.download_video("https://x/v", dest)
    else:
        video_analysis.download_video("https://x/v", dest)
        assert dest.stat().st_size == size
