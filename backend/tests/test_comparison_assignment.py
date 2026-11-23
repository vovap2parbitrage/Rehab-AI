"""POST /comparisons is tied to an assignment; a finished analysis becomes a session."""

import uuid

import pytest

from app.api.v1.endpoints.comparisons import get_comparison_service, get_storage
from app.main import app
from app.models.assignment import Assignment
from app.models.session import TrainingSession
from app.services import storage
from app.services.comparison_session import record_session

PREFIX = "/api/v1/comparisons"


class FakeService:
    def __init__(self):
        self.jobs = []

    def submit_comparison(self, job, user_id):
        self.jobs.append((job, user_id))
        return "task-1"


class FakeStore:
    StorageError = storage.StorageError
    is_owned_key = staticmethod(storage.is_owned_key)

    def __init__(self):
        self.deleted = []

    def delete_video(self, key):
        self.deleted.append(key)


@pytest.fixture
def store():
    fake = FakeStore()
    app.dependency_overrides[get_storage] = lambda: fake
    return fake


@pytest.fixture
def service(store):
    fake = FakeService()
    app.dependency_overrides[get_comparison_service] = lambda: fake
    return fake


@pytest.fixture
def setup(db_session, therapist, patient_user, seed_patient, seed_assignment):
    """A patient with an assignment whose exercise version is fully configured."""
    patient = seed_patient(patient_user, therapist)
    assignment = seed_assignment(patient)
    db_assignment = db_session.get(Assignment, assignment.id)
    exercise = db_assignment.exercise_version
    exercise.reference_video_key = f"videos/{therapist.id}/{'a' * 32}.mp4"
    exercise.body_parts = ["right_leg"]
    exercise.joint_tolerances = {"r_knee": 5, "not_a_joint": 3, "r_hip": 500}
    db_session.commit()
    return assignment, db_assignment


def patient_key(user):
    return f"videos/{user.id}/{'b' * 32}.mp4"


def test_job_is_built_from_the_exercise(api, login, service, setup, patient_user):
    assignment, db_assignment = setup
    login(patient_user)
    video_sha256 = "c" * 64

    r = api.post(
        PREFIX,
        json={
            "assignment_id": str(assignment.id),
            "patient_key": patient_key(patient_user),
            "pain_score": 3,
            "video_sha256": video_sha256,
        },
    )

    assert r.status_code == 202
    assert r.json() == {"task_id": "task-1"}
    job, user_id = service.jobs[0]
    assert user_id == str(patient_user.id)
    assert job.assignment_id == assignment.id
    assert job.reference_key == db_assignment.exercise_version.reference_video_key
    assert job.body_parts == ["right_leg"]
    # Unknown joints and out-of-range tolerances from the exercise are dropped.
    assert job.tolerances_deg == {"r_knee": 5.0}
    assert job.pain_score == 3
    assert job.video_sha256 == video_sha256


def test_invalid_video_hash_is_rejected(api, login, service, setup, patient_user):
    assignment, _ = setup
    login(patient_user)

    response = api.post(
        PREFIX,
        json={
            "assignment_id": str(assignment.id),
            "patient_key": patient_key(patient_user),
            "video_sha256": "not-a-sha256",
        },
    )

    assert response.status_code == 422
    assert service.jobs == []


def test_request_cannot_override_the_exercise(api, login, service, setup, patient_user):
    assignment, db_assignment = setup
    login(patient_user)
    other_reference = f"videos/{patient_user.id}/{'c' * 32}.mp4"

    api.post(
        PREFIX,
        json={
            "assignment_id": str(assignment.id),
            "patient_key": patient_key(patient_user),
            "reference_key": other_reference,
            "body_parts": ["torso"],
        },
    )

    job, _ = service.jobs[0]
    assert job.reference_key == db_assignment.exercise_version.reference_video_key
    assert job.body_parts == ["right_leg"]


def test_other_patient_gets_404(api, login, service, setup, other_patient_user):
    assignment, _ = setup
    login(other_patient_user)
    r = api.post(
        PREFIX,
        json={"assignment_id": str(assignment.id), "patient_key": patient_key(other_patient_user)},
    )
    assert r.status_code == 404
    assert service.jobs == []


def test_therapist_cannot_submit_for_a_patient(api, login, service, setup, therapist):
    assignment, _ = setup
    login(therapist)
    r = api.post(
        PREFIX,
        json={"assignment_id": str(assignment.id), "patient_key": patient_key(therapist)},
    )
    assert r.status_code == 404


def test_unknown_assignment_is_404(api, login, service, setup, patient_user):
    login(patient_user)
    r = api.post(
        PREFIX,
        json={"assignment_id": str(uuid.uuid4()), "patient_key": patient_key(patient_user)},
    )
    assert r.status_code == 404


def test_inactive_assignment_is_409(api, login, service, setup, patient_user, db_session):
    assignment, db_assignment = setup
    db_assignment.status = "completed"
    db_session.commit()
    login(patient_user)
    r = api.post(
        PREFIX,
        json={"assignment_id": str(assignment.id), "patient_key": patient_key(patient_user)},
    )
    assert r.status_code == 409


def test_someone_elses_video_is_403(api, login, service, setup, patient_user, other_patient_user):
    assignment, _ = setup
    login(patient_user)
    r = api.post(
        PREFIX,
        json={
            "assignment_id": str(assignment.id),
            "patient_key": patient_key(other_patient_user),
        },
    )
    assert r.status_code == 403
    assert service.jobs == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("reference_video_key", None),
        ("reference_video_key", "squat.mp4"),  # the UI still stores just a file name
        ("body_parts", []),
    ],
)
def test_unfinished_exercise_is_409(api, login, service, setup, patient_user, db_session, field, value):
    assignment, db_assignment = setup
    setattr(db_assignment.exercise_version, field, value)
    db_session.commit()
    login(patient_user)
    r = api.post(
        PREFIX,
        json={"assignment_id": str(assignment.id), "patient_key": patient_key(patient_user)},
    )
    assert r.status_code == 409
    assert service.jobs == []


REPORT = {
    "status": "done",
    "score": 8.5,
    "repetitions": 7,
    "repetition_scores": [8, 9],
    "worst_repetition_score": 7.0,
    "joint_scores": {"r_knee": 8.1},
    "errors": [{"joint": "r_knee", "start_s": 1.0, "end_s": 1.5}],
    "quality": {"ok": True},
}


def test_record_session_stores_score_deviations_and_video_hash(setup, db_session):
    assignment, db_assignment = setup

    video = f"videos/u/{'d' * 32}.mp4"
    video_sha256 = "e" * 64
    version = db_assignment.exercise_version_id

    session_id = record_session(
        str(assignment.id), "task-9", 4, REPORT, video, str(version), video_sha256
    )

    saved = db_session.query(TrainingSession).one()
    assert session_id == str(saved.id)
    assert saved.video_key == video
    assert saved.video_sha256 == video_sha256
    assert saved.exercise_version_id == version
    assert saved.has_video
    assert saved.assignment_id == assignment.id
    assert saved.score == 8.5
    assert saved.pain_score == 4
    assert saved.comparison_task_id == "task-9"
    assert saved.completed_at is not None
    assert saved.joint_deviations["joint_scores"] == {"r_knee": 8.1}
    assert saved.joint_deviations["repetitions"] == 7
    assert "quality" not in saved.joint_deviations


def test_same_analysis_creates_only_one_session(setup, db_session):
    assignment, _ = setup

    first = record_session(str(assignment.id), "task-9", None, REPORT)
    second = record_session(str(assignment.id), "task-9", None, REPORT)

    assert first == second
    assert db_session.query(TrainingSession).count() == 1


def test_a_refused_request_deletes_the_unused_upload(
    api, login, service, store, setup, patient_user, db_session
):
    assignment, db_assignment = setup
    db_assignment.exercise_version.body_parts = []  # the exercise is not ready for analysis
    db_session.commit()
    login(patient_user)
    key = patient_key(patient_user)

    response = api.post(PREFIX, json={"assignment_id": str(assignment.id), "patient_key": key})

    assert response.status_code == 409
    assert store.deleted == [key]


def test_an_accepted_request_keeps_the_upload(api, login, service, store, setup, patient_user):
    assignment, _ = setup
    login(patient_user)

    response = api.post(
        PREFIX,
        json={"assignment_id": str(assignment.id), "patient_key": patient_key(patient_user)},
    )

    assert response.status_code == 202
    assert store.deleted == []


def test_someone_elses_upload_is_never_deleted(
    api, login, service, store, setup, patient_user, other_patient_user
):
    assignment, _ = setup
    login(patient_user)

    response = api.post(
        PREFIX,
        json={
            "assignment_id": str(assignment.id),
            "patient_key": patient_key(other_patient_user),
        },
    )

    assert response.status_code == 403
    assert store.deleted == []
