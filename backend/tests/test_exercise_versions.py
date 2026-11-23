"""An assignment stays on the exercise version it was given, so scores stay comparable."""

import uuid

import pytest

from app.core.timezones import today_in
from app.models.assignment import Assignment
from app.models.exercise_version import ExerciseVersion
from app.schemas.comparison import ComparisonRequest
from app.services.comparison_assignment import prepare_comparison

EXERCISES = "/api/v1/exercises/"
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]


def video_key(owner) -> str:
    return f"videos/{owner.id}/{uuid.uuid4().hex}.mp4"


@pytest.fixture
def stored_videos(monkeypatch):
    """The videos the service asks storage to delete."""
    deleted = []
    monkeypatch.setattr("app.services.storage.delete_video", deleted.append)
    return deleted


@pytest.fixture
def exercise(api, login, therapist, stored_videos):
    login(therapist)
    response = api.post(
        EXERCISES,
        json={
            "name": "Squat",
            "reference_video_key": video_key(therapist),
            "body_parts": ["right_leg"],
            "joint_tolerances": {"r_knee": 5},
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def assign(api, therapist, patient_user, seed_patient, exercise):
    patient = seed_patient(patient_user, therapist)

    def _assign() -> str:
        response = api.post(
            "/api/v1/assignments/",
            json={
                "patient_id": str(patient.id),
                "exercise_id": exercise["id"],
                "duration_weeks": 4,
                "weekdays": ALL_DAYS,
                "repetitions": 10,
                "starts_on": today_in(None).isoformat(),
            },
        )
        assert response.status_code == 201
        return response.json()["id"]

    return _assign


def edit(api, exercise, **changes):
    body = {
        "name": exercise["name"],
        "description": exercise["description"],
        "reference_video_key": exercise["reference_video_key"],
        "body_parts": exercise["body_parts"],
        "joint_tolerances": exercise["joint_tolerances"],
        **changes,
    }
    response = api.put(f"{EXERCISES}{exercise['id']}", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def versions_of(db_session, exercise):
    db_session.expire_all()
    return [
        version.version
        for version in db_session.query(ExerciseVersion)
        .filter(ExerciseVersion.exercise_id == uuid.UUID(exercise["id"]))
        .order_by(ExerciseVersion.version)
    ]


def pinned_version(db_session, assignment_id) -> int:
    db_session.expire_all()
    return db_session.get(Assignment, uuid.UUID(assignment_id)).exercise_version.version


def test_a_new_exercise_starts_at_version_one(exercise, db_session):
    assert exercise["version"] == 1
    assert exercise["active_assignments"] == 0
    assert versions_of(db_session, exercise) == [1]


def test_editing_only_the_name_or_description_does_not_start_a_version(
    api, exercise, db_session
):
    edited = edit(api, exercise, name="Deep squat", description="Slowly")

    assert edited["version"] == 1
    assert edited["name"] == "Deep squat"
    assert versions_of(db_session, exercise) == [1]


@pytest.mark.parametrize(
    "change",
    [
        {"body_parts": ["right_leg", "torso"]},
        {"joint_tolerances": {"r_knee": 8}},
        {"reference_video_key": "NEW"},
    ],
    ids=["body parts", "tolerances", "reference video"],
)
def test_changing_what_is_scored_starts_a_new_version(
    api, exercise, therapist, assign, db_session, change
):
    assign()  # keeps version 1 alive, so it is not pruned
    if change.get("reference_video_key") == "NEW":
        change = {"reference_video_key": video_key(therapist)}

    edited = edit(api, exercise, **change)

    assert edited["version"] == 2
    assert versions_of(db_session, exercise) == [1, 2]


def test_an_assignment_stays_on_the_version_it_was_given(
    api, exercise, assign, db_session
):
    before = assign()

    edit(api, exercise, body_parts=["torso"])
    after = assign()

    assert pinned_version(db_session, before) == 1
    assert pinned_version(db_session, after) == 2


def test_the_comparison_uses_the_version_of_the_assignment(
    api, exercise, therapist, patient_user, assign, db_session
):
    first = assign()
    new_video = video_key(therapist)
    edit(api, exercise, body_parts=["torso"], reference_video_key=new_video)
    request = ComparisonRequest(
        assignment_id=first,
        patient_key=f"videos/{patient_user.id}/{'b' * 32}.mp4",
    )

    job = prepare_comparison(db_session, request, patient_user)

    assert job.reference_key == exercise["reference_video_key"]  # not the new video
    assert job.body_parts == ["right_leg"]
    assert job.tolerances_deg == {"r_knee": 5.0}


def test_applying_an_edit_moves_only_the_active_assignments(
    api, exercise, assign, db_session
):
    active = assign()
    cancelled = assign()
    assert api.post(f"/api/v1/assignments/{cancelled}/cancel").status_code == 204

    edited = edit(api, exercise, body_parts=["torso"], apply_to_active_assignments=True)

    assert edited["version"] == 2
    assert pinned_version(db_session, active) == 2
    assert pinned_version(db_session, cancelled) == 1


def test_an_assignment_can_be_moved_to_the_newest_version_by_a_later_edit(
    api, exercise, assign, db_session
):
    assignment = assign()
    exercise_v2 = edit(api, exercise, body_parts=["torso"])
    assert pinned_version(db_session, assignment) == 1

    edit(api, exercise_v2, name="Deep squat", apply_to_active_assignments=True)

    assert pinned_version(db_session, assignment) == 2


def test_the_exercise_counts_its_active_assignments(api, exercise, assign):
    first = assign()
    assign()
    api.post(f"/api/v1/assignments/{first}/cancel")

    listed = api.get(EXERCISES).json()["items"][0]

    assert listed["active_assignments"] == 1


def test_an_unused_old_version_and_its_video_are_removed(
    api, exercise, therapist, db_session, stored_videos
):
    edit(api, exercise, reference_video_key=video_key(therapist))

    assert versions_of(db_session, exercise) == [2]
    assert stored_videos == [exercise["reference_video_key"]]


def test_a_version_an_assignment_uses_keeps_its_video(
    api, exercise, therapist, assign, db_session, stored_videos
):
    assign()

    edit(api, exercise, reference_video_key=video_key(therapist))

    assert versions_of(db_session, exercise) == [1, 2]
    assert stored_videos == []


def test_a_video_of_an_older_version_cannot_be_deleted_as_unused(
    api, exercise, therapist, assign, stored_videos
):
    assign()
    edit(api, exercise, reference_video_key=video_key(therapist))

    response = api.delete(
        "/api/v1/comparisons/uploads", params={"key": exercise["reference_video_key"]}
    )

    assert response.status_code == 409


def test_the_patient_sees_the_video_of_the_version_the_assignment_is_scored_against(
    api, login, exercise, therapist, patient_user, assign, monkeypatch
):
    monkeypatch.setattr("app.services.storage.create_video_url", lambda key: f"https://v.test/{key}")
    assign()
    new_video = video_key(therapist)
    edit(api, exercise, reference_video_key=new_video)

    login(patient_user)
    patient_url = api.get(f"{EXERCISES}{exercise['id']}/video").json()["url"]
    login(therapist)
    therapist_url = api.get(f"{EXERCISES}{exercise['id']}/video").json()["url"]

    assert patient_url == f"https://v.test/{exercise['reference_video_key']}"
    assert therapist_url == f"https://v.test/{new_video}"
