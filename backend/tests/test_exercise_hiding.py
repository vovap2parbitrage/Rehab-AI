"""A therapist can hide an exercise from the library and bring it back."""

import uuid

import pytest

from app.core.timezones import app_today

EXERCISES = "/api/v1/exercises/"


@pytest.fixture
def exercise(api, login, therapist):
    login(therapist)
    response = api.post(
        EXERCISES,
        json={
            "name": "Squat",
            "reference_video_key": f"videos/{therapist.id}/{uuid.uuid4().hex}.mp4",
            "body_parts": ["right_leg"],
        },
    )
    return response.json()


def names(response) -> list[str]:
    return [item["name"] for item in response.json()["items"]]


def test_a_hidden_exercise_leaves_the_library_and_shows_in_the_hidden_list(api, exercise):
    assert api.post(f"{EXERCISES}{exercise['id']}/hide").status_code == 204

    assert names(api.get(EXERCISES)) == []
    hidden = api.get(EXERCISES, params={"hidden": True})
    assert names(hidden) == ["Squat"]
    assert hidden.json()["items"][0]["hidden"] is True


def test_a_hidden_exercise_can_be_restored(api, exercise):
    api.post(f"{EXERCISES}{exercise['id']}/hide")

    assert api.post(f"{EXERCISES}{exercise['id']}/restore").status_code == 204

    assert names(api.get(EXERCISES)) == ["Squat"]
    assert names(api.get(EXERCISES, params={"hidden": True})) == []
    assert api.get(EXERCISES).json()["items"][0]["hidden"] is False


def test_hiding_twice_is_harmless(api, exercise):
    assert api.post(f"{EXERCISES}{exercise['id']}/hide").status_code == 204
    assert api.post(f"{EXERCISES}{exercise['id']}/hide").status_code == 204


def test_only_the_owner_can_hide_or_restore(api, login, exercise, other_therapist):
    login(other_therapist)

    assert api.post(f"{EXERCISES}{exercise['id']}/hide").status_code == 403
    assert api.post(f"{EXERCISES}{exercise['id']}/restore").status_code == 403


def test_hiding_an_unknown_exercise_is_404(api, login, therapist):
    login(therapist)

    assert api.post(f"{EXERCISES}{uuid.uuid4()}/hide").status_code == 404


def test_a_patient_cannot_hide_an_exercise(api, login, exercise, patient_user):
    login(patient_user)

    assert api.post(f"{EXERCISES}{exercise['id']}/hide").status_code == 403


def test_a_hidden_exercise_cannot_be_assigned_until_it_is_restored(
    api, exercise, therapist, patient_user, seed_patient
):
    patient = seed_patient(patient_user, therapist)
    body = {
        "patient_id": str(patient.id),
        "exercise_id": exercise["id"],
        "duration_weeks": 4,
        "weekdays": [0, 1, 2, 3, 4, 5, 6],
        "repetitions": 10,
        "starts_on": app_today().isoformat(),
    }
    api.post(f"{EXERCISES}{exercise['id']}/hide")

    assert api.post("/api/v1/assignments/", json=body).status_code == 409

    api.post(f"{EXERCISES}{exercise['id']}/restore")
    assert api.post("/api/v1/assignments/", json=body).status_code == 201


def test_hiding_does_not_touch_existing_assignments(
    api, login, exercise, therapist, patient_user, seed_patient, monkeypatch
):
    patient = seed_patient(patient_user, therapist)
    api.post(
        "/api/v1/assignments/",
        json={
            "patient_id": str(patient.id),
            "exercise_id": exercise["id"],
            "duration_weeks": 4,
            "weekdays": [0, 1, 2, 3, 4, 5, 6],
            "repetitions": 10,
            "starts_on": app_today().isoformat(),
        },
    )
    monkeypatch.setattr("app.services.storage.create_video_url", lambda key: f"https://v.test/{key}")
    api.post(f"{EXERCISES}{exercise['id']}/hide")

    login(patient_user)
    plan = api.get("/api/v1/assignments/mine").json()
    video = api.get(f"{EXERCISES}{exercise['id']}/video")

    assert [item["status"] for item in plan] == ["active"]
    assert plan[0]["exercise"]["name"] == "Squat"
    assert video.status_code == 200


def test_the_read_model_counts_every_assignment_of_the_exercise(
    api, exercise, therapist, patient_user, seed_patient
):
    patient = seed_patient(patient_user, therapist)
    ids = []
    for _ in range(2):
        response = api.post(
            "/api/v1/assignments/",
            json={
                "patient_id": str(patient.id),
                "exercise_id": exercise["id"],
                "duration_weeks": 4,
                "weekdays": [0, 1, 2, 3, 4, 5, 6],
                "repetitions": 10,
                "starts_on": app_today().isoformat(),
            },
        )
        ids.append(response.json()["id"])
    api.post(f"/api/v1/assignments/{ids[0]}/cancel")

    listed = api.get(EXERCISES).json()["items"][0]

    # One is cancelled, but it still stops the exercise from being deleted.
    assert listed["active_assignments"] == 1
    assert listed["assignments_total"] == 2
    assert api.delete(f"{EXERCISES}{exercise['id']}").status_code == 409


def test_an_unused_exercise_can_still_be_deleted(api, exercise, monkeypatch):
    monkeypatch.setattr("app.services.storage.delete_video", lambda key: None)

    assert api.delete(f"{EXERCISES}{exercise['id']}").status_code == 204
