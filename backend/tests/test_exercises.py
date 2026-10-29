import uuid

from app.schemas.exercise import ExerciseRead


def exercise_payload(**overrides) -> dict:
    payload = {
        "name": "Knee flexion",
        "description": "Slow flexion to 90 degrees",
        "reference_video_key": "videos/knee-flexion.mp4",
        "joint_tolerances": {"knee": 5.0},
    }
    payload.update(overrides)
    return payload


def test_therapist_creates_exercise_and_created_by_is_set(api, login, therapist):
    login(therapist)

    response = api.post("/api/v1/exercises/", json=exercise_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Knee flexion"
    assert body["created_by"] == str(therapist.id)
    assert body["joint_tolerances"] == {"knee": 5.0}


def test_created_by_cannot_be_set_by_client(api, login, therapist):
    login(therapist)

    response = api.post(
        "/api/v1/exercises/",
        json=exercise_payload(created_by=str(uuid.uuid4())),
    )

    assert response.status_code == 201
    assert response.json()["created_by"] == str(therapist.id)


def test_patient_cannot_create_exercise(api, login, patient_user):
    login(patient_user)

    response = api.post("/api/v1/exercises/", json=exercise_payload())

    assert response.status_code == 403


def test_every_role_can_list_and_get_exercises(api, login, therapist, patient_user):
    login(therapist)
    created = api.post("/api/v1/exercises/", json=exercise_payload()).json()

    login(patient_user)
    listed = api.get("/api/v1/exercises/")
    fetched = api.get(f"/api/v1/exercises/{created['id']}")

    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [created["id"]]
    assert fetched.status_code == 200


def test_unknown_exercise_returns_404(api, login, patient_user):
    login(patient_user)

    response = api.get(f"/api/v1/exercises/{uuid.uuid4()}")

    assert response.status_code == 404


def test_reference_video_key_limit_matches_model(api, login, therapist):
    login(therapist)

    ok = api.post("/api/v1/exercises/", json=exercise_payload(reference_video_key="a" * 512))
    too_long = api.post("/api/v1/exercises/", json=exercise_payload(reference_video_key="a" * 513))

    assert ok.status_code == 201
    assert too_long.status_code == 422


def test_exercise_read_schema_matches_model_columns():
    from app.models.exercise import Exercise

    columns = {column.name for column in Exercise.__table__.columns}

    assert set(ExerciseRead.model_fields) <= columns
