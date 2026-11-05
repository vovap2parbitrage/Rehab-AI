from pathlib import Path

from app.services.comparison.video_checks import InvalidVideoError
from app.services.storage import StorageError
from app.tasks import video_analysis
from app.tasks.video_analysis import analyze_video_task

REF = "videos/u/" + "a" * 32 + ".mp4"
PAT = "videos/u/" + "b" * 32 + ".mp4"


def _fake_download(key: str, dest: Path) -> None:
    dest.write_bytes(b"video")


def test_returns_compare_report(monkeypatch):
    seen = {}

    def fake_compare(ref, pat, parts, tol):
        seen["args"] = (parts, tol)
        return {"status": "done", "score": 8.0}

    monkeypatch.setattr(video_analysis, "download_video", _fake_download)
    monkeypatch.setattr(video_analysis, "compare", fake_compare)

    result = analyze_video_task.run(REF, PAT, ["torso"], {"torso_tilt": 5.0})

    assert result == {"status": "done", "score": 8.0}
    assert seen["args"] == (["torso"], {"torso_tilt": 5.0})


def test_downloads_both_keys_and_validates_them(monkeypatch):
    keys, checked = [], []
    monkeypatch.setattr(video_analysis.storage, "download_video", lambda k, d: keys.append(k))
    monkeypatch.setattr(video_analysis, "validate_video_file", lambda p: checked.append(p))
    monkeypatch.setattr(video_analysis, "compare", lambda *a: {"status": "done"})

    analyze_video_task.run(REF, PAT, ["torso"], {})

    assert keys == [REF, PAT]
    assert len(checked) == 2


def test_temp_files_are_deleted(monkeypatch):
    seen = {}

    def fake_compare(ref, pat, parts, tol):
        seen["paths"] = (ref, pat)
        assert Path(ref).exists() and Path(pat).exists()
        return {"status": "done"}

    monkeypatch.setattr(video_analysis, "download_video", _fake_download)
    monkeypatch.setattr(video_analysis, "compare", fake_compare)

    analyze_video_task.run(REF, PAT, ["torso"], {})

    assert not Path(seen["paths"][0]).exists()
    assert not Path(seen["paths"][1]).exists()


def test_storage_error_returns_failed(monkeypatch):
    def failing(key, dest):
        raise StorageError("Could not download the video.")

    monkeypatch.setattr(video_analysis, "download_video", failing)

    assert analyze_video_task.run(REF, PAT, ["torso"], {}) == {
        "status": "failed",
        "message": "Could not download the video.",
    }


def test_invalid_video_returns_failed(monkeypatch):
    def failing(key, dest):
        raise InvalidVideoError("The file is not a supported video (mp4 or mov).")

    monkeypatch.setattr(video_analysis, "download_video", failing)

    result = analyze_video_task.run(REF, PAT, ["torso"], {})
    assert result["status"] == "failed"
    assert "not a supported video" in result["message"]


def test_unexpected_error_hides_details(monkeypatch):
    def boom(*args):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(video_analysis, "download_video", _fake_download)
    monkeypatch.setattr(video_analysis, "compare", boom)

    assert analyze_video_task.run(REF, PAT, ["torso"], {}) == {
        "status": "failed",
        "message": "Analysis failed.",
    }
