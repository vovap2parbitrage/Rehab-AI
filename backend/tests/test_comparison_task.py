from pathlib import Path

import pytest

from app.services.comparison.video_checks import InvalidVideoError
from app.services.storage import StorageError
from app.tasks import comparison_analysis
from app.tasks.comparison_analysis import analyze_video_task

REF = "videos/u/" + "a" * 32 + ".mp4"
PAT = "videos/u/" + "b" * 32 + ".mp4"


def _fake_download(key: str, dest: Path) -> Path:
    dest.write_bytes(b"video")
    return dest


def test_returns_compare_report(monkeypatch):
    seen = {}

    def fake_compare(ref, pat, parts, tol):
        seen["args"] = (parts, tol)
        return {"status": "done", "score": 8.0}

    monkeypatch.setattr(comparison_analysis, "download_video", _fake_download)
    monkeypatch.setattr(comparison_analysis, "compare", fake_compare)

    result = analyze_video_task.run(REF, PAT, ["torso"], {"torso_tilt": 5.0})

    assert result == {"status": "done", "score": 8.0}
    assert seen["args"] == (["torso"], {"torso_tilt": 5.0})


def test_downloads_both_keys_and_validates_them(monkeypatch):
    keys, checked, compared = [], [], []

    def fake_prepare(path):
        checked.append(path)
        return path.with_name(f"{path.name}.normalised.mp4")

    monkeypatch.setattr(comparison_analysis.storage, "download_video", lambda k, d: keys.append(k))
    monkeypatch.setattr(comparison_analysis, "prepare_video", fake_prepare)
    monkeypatch.setattr(
        comparison_analysis, "compare", lambda ref, pat, *a: compared.append((ref, pat)) or {}
    )

    analyze_video_task.run(REF, PAT, ["torso"], {})

    assert keys == [REF, PAT]
    assert len(checked) == 2
    # The analysis reads the checked (possibly converted) files, not the raw downloads.
    assert [Path(p).name for p in compared[0]] == [
        "reference.normalised.mp4",
        "patient.normalised.mp4",
    ]


def test_temp_files_are_deleted(monkeypatch):
    seen = {}

    def fake_compare(ref, pat, parts, tol):
        seen["paths"] = (ref, pat)
        assert Path(ref).exists() and Path(pat).exists()
        return {"status": "done"}

    monkeypatch.setattr(comparison_analysis, "download_video", _fake_download)
    monkeypatch.setattr(comparison_analysis, "compare", fake_compare)

    analyze_video_task.run(REF, PAT, ["torso"], {})

    assert not Path(seen["paths"][0]).exists()
    assert not Path(seen["paths"][1]).exists()


def test_storage_error_returns_failed(monkeypatch):
    def failing(key, dest):
        raise StorageError("Could not download the video.")

    monkeypatch.setattr(comparison_analysis, "download_video", failing)

    assert analyze_video_task.run(REF, PAT, ["torso"], {}) == {
        "status": "failed",
        "message": "Could not download the video.",
    }


def test_invalid_video_returns_failed(monkeypatch):
    def failing(key, dest):
        raise InvalidVideoError("The file is not a supported video (mp4 or mov).")

    monkeypatch.setattr(comparison_analysis, "download_video", failing)

    result = analyze_video_task.run(REF, PAT, ["torso"], {})
    assert result["status"] == "failed"
    assert "not a supported video" in result["message"]


def test_unexpected_error_hides_details(monkeypatch):
    def boom(*args):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(comparison_analysis, "download_video", _fake_download)
    monkeypatch.setattr(comparison_analysis, "compare", boom)

    assert analyze_video_task.run(REF, PAT, ["torso"], {}) == {
        "status": "failed",
        "message": "Analysis failed.",
    }


ASSIGNMENT = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def deleted(monkeypatch):
    """Videos the worker deletes from storage."""
    keys = []
    monkeypatch.setattr(comparison_analysis.storage, "delete_video", keys.append)
    return keys


def test_done_report_is_saved_as_a_session_with_the_video(monkeypatch, deleted):
    saved = []

    def fake_record(*args):
        saved.append(args)
        return "session-1"

    monkeypatch.setattr(comparison_analysis, "download_video", _fake_download)
    monkeypatch.setattr(comparison_analysis, "compare", lambda *a: {"status": "done", "score": 9.0})
    monkeypatch.setattr(comparison_analysis, "record_session", fake_record)

    result = analyze_video_task.run(REF, PAT, ["torso"], {}, ASSIGNMENT, 2, "task-1", "version-1")

    assert result == {"status": "done", "score": 9.0, "session_id": "session-1"}
    # The session remembers the exercise version the video was scored against.
    assert saved == [
        (ASSIGNMENT, "task-1", 2, {"status": "done", "score": 9.0}, PAT, "version-1")
    ]
    assert deleted == []  # the video now belongs to the session


@pytest.mark.parametrize("status", ["rerecord", "no_repetitions"])
def test_unfinished_report_is_not_saved_and_the_video_is_deleted(monkeypatch, deleted, status):
    saved = []
    monkeypatch.setattr(comparison_analysis, "download_video", _fake_download)
    monkeypatch.setattr(comparison_analysis, "compare", lambda *a: {"status": status})
    monkeypatch.setattr(comparison_analysis, "record_session", lambda *a: saved.append(a))

    result = analyze_video_task.run(REF, PAT, ["torso"], {}, ASSIGNMENT, None, "task-1")

    assert result == {"status": status}
    assert saved == []
    assert deleted == [PAT]


def test_database_failure_returns_failed_and_deletes_the_video(monkeypatch, deleted):
    def boom(*args):
        raise RuntimeError("db down")

    monkeypatch.setattr(comparison_analysis, "download_video", _fake_download)
    monkeypatch.setattr(comparison_analysis, "compare", lambda *a: {"status": "done"})
    monkeypatch.setattr(comparison_analysis, "record_session", boom)

    result = analyze_video_task.run(REF, PAT, ["torso"], {}, ASSIGNMENT, None, "task-1")

    assert result == {"status": "failed", "message": "Could not save the result."}
    assert deleted == [PAT]


def test_failed_analysis_of_an_assignment_deletes_the_video(monkeypatch, deleted):
    def failing(key, dest):
        raise InvalidVideoError("The file is not a supported video (mp4 or mov).")

    monkeypatch.setattr(comparison_analysis, "download_video", failing)

    result = analyze_video_task.run(REF, PAT, ["torso"], {}, ASSIGNMENT, None, "task-1")

    assert result["status"] == "failed"
    assert deleted == [PAT]


def test_a_failed_delete_does_not_hide_the_result(monkeypatch):
    def cannot_delete(key):
        raise StorageError("Could not delete the video.")

    monkeypatch.setattr(comparison_analysis.storage, "delete_video", cannot_delete)
    monkeypatch.setattr(comparison_analysis, "download_video", _fake_download)
    monkeypatch.setattr(comparison_analysis, "compare", lambda *a: {"status": "rerecord"})

    result = analyze_video_task.run(REF, PAT, ["torso"], {}, ASSIGNMENT, None, "task-1")

    assert result == {"status": "rerecord"}


def test_a_plain_comparison_never_deletes_anything(monkeypatch, deleted):
    monkeypatch.setattr(comparison_analysis, "download_video", _fake_download)
    monkeypatch.setattr(comparison_analysis, "compare", lambda *a: {"status": "rerecord"})

    analyze_video_task.run(REF, PAT, ["torso"], {})

    assert deleted == []
