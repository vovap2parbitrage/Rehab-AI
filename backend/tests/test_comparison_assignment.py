"""POST /comparisons is tied to an assignment; a finished analysis becomes a session."""

import uuid

import pytest

from app.api.v1.endpoints.comparisons import get_comparison_service
from app.main import app
from app.models.assignment import Assignment
from app.models.session import TrainingSession
from app.services.comparison_session import record_session

PREFIX = "/api/v1/comparisons"


class FakeService:
    def __init__(self):
        self.jobs = []

    def submit_comparison(self, job, user_id):
        self.jobs.append((job, user_id))
        return "task-1"


@pytest.fixture
def service():
    fake = FakeService()
    app.dependency_overrides[get_comparison_service] = lambda: fake
    return fake


@pytest.fixture
def setup(db_session, therapist, patient_user, seed_patient, seed_assignment):
    """A patient with an assignment whose exercise is fully configured."""
    patient = seed_patient(patient_user, therapist)
    assignment = seed_assignment(patient)
    db_assignment = db_session.get(Assignment, assignment.id)
    exercise = db_assignment.exercise
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

    r = api.post(
        PREFIX,
        json={
            "assignment_id": str(assignment.id),
            "patient_key": patient_key(patient_user),
            "pain_score": 3,
        },
    )

    assert r.status_code == 202
    assert r.json() == {"task_id": "task-1"}
    job, user_id = service.jobs[0]
    assert user_id == str(patient_user.id)
    assert job.assignment_id == assignment.id
    assert job.reference_key == db_assignment.exercise.reference_video_key
    assert job.body_parts == ["right_leg"]
    # Unknown joints and out-of-range tolerances from the exercise are dropped.
    assert job.tolerances_deg == {"r_knee": 5.0}
    assert job.pain_score == 3


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
    assert job.reference_key == db_assignment.exercise.reference_video_key
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
    setattr(db_assignment.exercise, field, value)
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


def test_record_session_stores_score_and_deviations(setup, db_session):
    assignment, _ = setup

    assert record_session(str(assignment.id), "task-9", 4, REPORT) is True

    saved = db_session.query(TrainingSession).one()
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

    assert record_session(str(assignment.id), "task-9", None, REPORT) is True
    assert record_session(str(assignment.id), "task-9", None, REPORT) is False

    assert db_session.query(TrainingSession).count() == 1
