"""Joint tolerances: what a therapist may set, and what the editor needs to know."""

import uuid

import pytest

from app.models.exercise import Exercise
from app.services.comparison.angles import BODY_PARTS

EXERCISES = "/api/v1/exercises/"


def payload(therapist, **overrides) -> dict:
    return {
        "name": "Squat",
        "reference_video_key": f"videos/{therapist.id}/{uuid.uuid4().hex}.mp4",
        "body_parts": ["right_leg"],
        "joint_tolerances": {},
        **overrides,
    }


def test_valid_tolerances_for_the_chosen_body_parts_are_saved(api, login, therapist):
    login(therapist)

    response = api.post(
        EXERCISES, json=payload(therapist, joint_tolerances={"r_knee": 5, "r_hip": 12.5})
    )

    assert response.status_code == 201
    assert response.json()["joint_tolerances"] == {"r_knee": 5, "r_hip": 12.5}


def test_the_limits_of_the_allowed_range_are_accepted(api, login, therapist):
    login(therapist)

    response = api.post(
        EXERCISES, json=payload(therapist, joint_tolerances={"r_knee": 0.5, "r_hip": 90})
    )

    assert response.status_code == 201


@pytest.mark.parametrize(
    "tolerances",
    [
        {"left_pinky": 5},  # not a joint
        {"l_knee": 5},  # a joint of a body part that is not selected
        {"r_knee": 0},
        {"r_knee": -3},
        {"r_knee": 91},
    ],
    ids=["unknown joint", "joint of another body part", "zero", "negative", "above 90"],
)
def test_invalid_tolerances_are_rejected(api, login, therapist, tolerances):
    login(therapist)

    response = api.post(EXERCISES, json=payload(therapist, joint_tolerances=tolerances))

    assert response.status_code == 422


def test_tolerances_are_checked_again_when_the_exercise_is_edited(api, login, therapist):
    login(therapist)
    created = api.post(EXERCISES, json=payload(therapist, joint_tolerances={"r_knee": 5})).json()

    # The body part is dropped, so its tolerance would no longer belong to the exercise.
    response = api.put(
        f"{EXERCISES}{created['id']}",
        json=payload(
            therapist,
            reference_video_key=created["reference_video_key"],
            body_parts=["torso"],
            joint_tolerances={"r_knee": 5},
        ),
    )

    assert response.status_code == 422


def test_an_exercise_saved_with_old_rules_can_still_be_read(
    api, login, therapist, db_session
):
    # Rows from before the checks may hold keys that are not joints; they must not break the page.
    exercise = Exercise(
        name="Old", created_by=therapist.id, joint_tolerances={"knee": 5.0}, body_parts=[]
    )
    db_session.add(exercise)
    db_session.commit()
    login(therapist)

    response = api.get(EXERCISES)

    assert response.status_code == 200
    assert response.json()["items"][0]["joint_tolerances"] == {"knee": 5.0}


def test_the_scoring_options_come_from_the_scoring_code(api, login, therapist):
    login(therapist)

    response = api.get(f"{EXERCISES}scoring-options")

    assert response.status_code == 200
    body = response.json()
    assert body["joints_by_body_part"] == {part: list(joints) for part, joints in BODY_PARTS.items()}
    assert body["default_tolerance_deg"] == 10
    assert body["max_tolerance_deg"] == 90


def test_a_patient_cannot_read_the_scoring_options(api, login, patient_user):
    login(patient_user)

    assert api.get(f"{EXERCISES}scoring-options").status_code == 403
