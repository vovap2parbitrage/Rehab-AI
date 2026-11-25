"""The reference angles that the recording screen judges live repetitions against."""

import uuid

import pytest

from app.core.statuses import AssignmentStatus
from app.models.assignment import Assignment
from app.services import live_reference, storage

KEY = f"videos/{uuid.uuid4()}/{uuid.uuid4().hex}.mp4"
COMPUTED = {"joints": ["r_hip", "r_knee"], "fps": 10.0, "angles": [[170.0, 175.0], [120.0, 90.0]]}


@pytest.fixture
def computed(monkeypatch):
    calls = []

    def fake(reference_key, body_parts):
        calls.append((reference_key, body_parts))
        return COMPUTED

    monkeypatch.setattr(live_reference, "compute_reference", fake)
    return calls


@pytest.fixture
def assignment(db_session, therapist, patient_user, seed_patient, seed_assignment):
    seeded = seed_assignment(seed_patient(patient_user, therapist))
    row = db_session.get(Assignment, seeded.id)
    version = row.exercise_version
    version.reference_video_key = KEY
    version.body_parts = ["right_leg"]
    version.joint_tolerances = {"r_knee": 5, "knee": 7, "r_hip": 500}
    db_session.commit()
    return seeded


def get(api, assignment):
    return api.get(f"/api/v1/assignments/{assignment.id}/live-reference")


def test_a_patient_gets_the_reference_angles_and_tolerances(
    api, login, patient_user, assignment, computed
):
    login(patient_user)

    response = get(api, assignment)

    assert response.status_code == 200
    body = response.json()
    assert body["joints"] == ["r_hip", "r_knee"]
    assert body["fps"] == 10.0
    assert body["angles"] == COMPUTED["angles"]
    # Only known joints within the allowed range, like in the final analysis.
    assert body["tolerances"] == {"r_knee": 5.0}
    assert body["default_tolerance_deg"] == 10.0
    assert computed == [(KEY, ["right_leg"])]


def test_the_reference_is_worked_out_once_and_kept_with_the_version(
    api, login, patient_user, assignment, computed, db_session
):
    login(patient_user)

    get(api, assignment)
    second = get(api, assignment)

    assert second.status_code == 200
    assert len(computed) == 1
    row = db_session.get(Assignment, assignment.id)
    db_session.refresh(row.exercise_version)
    assert row.exercise_version.live_reference == COMPUTED


def test_another_patient_cannot_read_it(
    api, login, other_patient_user, assignment, computed
):
    login(other_patient_user)

    assert get(api, assignment).status_code == 404
    assert computed == []


def test_a_therapist_has_no_use_for_it(api, login, therapist, assignment, computed):
    login(therapist)

    assert get(api, assignment).status_code == 403


def test_a_cancelled_assignment_has_no_live_reference(
    api, login, patient_user, assignment, computed, db_session
):
    db_session.get(Assignment, assignment.id).status = AssignmentStatus.CANCELLED.value
    db_session.commit()
    login(patient_user)

    assert get(api, assignment).status_code == 409


def test_an_exercise_without_a_reference_video_says_so(
    api, login, patient_user, assignment, computed, db_session
):
    db_session.get(Assignment, assignment.id).exercise_version.reference_video_key = None
    db_session.commit()
    login(patient_user)

    assert get(api, assignment).status_code == 409
    assert computed == []


def test_an_unclear_reference_video_is_reported(
    api, login, patient_user, assignment, monkeypatch
):
    monkeypatch.setattr(live_reference, "compute_reference", lambda key, parts: None)
    login(patient_user)

    response = get(api, assignment)

    assert response.status_code == 409
    assert "not clear" in response.json()["detail"]


def test_a_storage_failure_is_a_bad_gateway(api, login, patient_user, assignment, monkeypatch):
    def broken(key, parts):
        raise storage.StorageError("Could not download the video.")

    monkeypatch.setattr(live_reference, "compute_reference", broken)
    login(patient_user)

    assert get(api, assignment).status_code == 502


def test_the_reference_is_worked_out_from_the_real_video(monkeypatch):
    """The whole path but the storage: download, pose, angles, smoothing, ~10 fps."""
    data = __import__("pathlib").Path(__file__).parent / "data" / "reference.mp4"

    def download(key, dest):
        dest.write_bytes(data.read_bytes())

    monkeypatch.setattr(storage, "download_video", download)

    result = live_reference.compute_reference(KEY, ["right_leg"])

    assert result["joints"] == ["r_hip", "r_knee"]
    assert 9 <= result["fps"] <= 11
    knee = [row[1] for row in result["angles"]]
    # The reference squat: standing (~180 deg), down to about 60 deg, and up again.
    assert max(knee) > 170
    assert min(knee) < 70
