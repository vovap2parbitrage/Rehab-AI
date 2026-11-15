import uuid
from datetime import date

from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.schemas.exercise import ExerciseRead


def exercise_payload(owner_id: str | None = None, **overrides) -> dict:
    payload = {
        "name": "Knee flexion",
        "description": "Slow flexion to 90 degrees",
        "reference_video_key": (
            f"videos/{owner_id or 'test-owner'}/{uuid.uuid4().hex}.mp4"
        ),
        "joint_tolerances": {"knee": 5.0},
    }
    payload.update(overrides)
    return payload


def test_therapist_creates_exercise_and_created_by_is_set(api, login, therapist):
    login(therapist)

    response = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Knee flexion"
    assert body["created_by"] == str(therapist.id)
    assert body["joint_tolerances"] == {"knee": 5.0}


def test_created_by_cannot_be_set_by_client(api, login, therapist):
    login(therapist)

    response = api.post(
        "/api/v1/exercises/",
        json=exercise_payload(
            str(therapist.id), created_by=str(uuid.uuid4())
        ),
    )

    assert response.status_code == 201
    assert response.json()["created_by"] == str(therapist.id)


def test_patient_cannot_create_exercise(api, login, patient_user):
    login(patient_user)

    response = api.post("/api/v1/exercises/", json=exercise_payload())

    assert response.status_code == 403


def test_therapist_cannot_create_exercise_with_invalid_video_key(
    api, login, therapist
):
    login(therapist)

    response = api.post(
        "/api/v1/exercises/",
        json=exercise_payload(
            str(therapist.id), reference_video_key="videos/not-a-valid-key.mp4"
        ),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid reference video key"


def test_therapist_must_create_exercise_with_video(api, login, therapist):
    login(therapist)

    response = api.post(
        "/api/v1/exercises/",
        json=exercise_payload(
            str(therapist.id), reference_video_key=None
        ),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "A reference video is required"


def test_therapist_cannot_create_exercise_with_another_therapists_video(
    api, login, therapist, other_therapist
):
    login(therapist)
    foreign_key = f"videos/{other_therapist.id}/{uuid.uuid4().hex}.mp4"

    response = api.post(
        "/api/v1/exercises/",
        json=exercise_payload(
            str(therapist.id), reference_video_key=foreign_key
        ),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Video does not belong to you"


def test_therapist_cannot_update_exercise_with_invalid_or_foreign_video_key(
    api, login, therapist, other_therapist
):
    login(therapist)
    created = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    ).json()
    invalid_key = "videos/not-a-valid-key.mp4"
    foreign_key = f"videos/{other_therapist.id}/{uuid.uuid4().hex}.mp4"

    invalid_response = api.put(
        f"/api/v1/exercises/{created['id']}",
        json=exercise_payload(
            str(therapist.id), reference_video_key=invalid_key
        ),
    )
    foreign_response = api.put(
        f"/api/v1/exercises/{created['id']}",
        json=exercise_payload(
            str(therapist.id), reference_video_key=foreign_key
        ),
    )

    assert invalid_response.status_code == 422
    assert invalid_response.json()["detail"] == "Invalid reference video key"
    assert foreign_response.status_code == 403
    assert foreign_response.json()["detail"] == "Video does not belong to you"


def test_patient_can_view_reference_video_for_assigned_exercise(
    api, login, therapist, patient_user, seed_patient, db_session, monkeypatch
):
    patient = seed_patient(patient_user, therapist)
    login(therapist)
    created = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    ).json()
    db_session.add(
        Assignment(
            patient_id=patient.id,
            exercise_id=uuid.UUID(created["id"]),
            repetitions=10,
            sessions_per_week=3,
            starts_on=date(2026, 1, 1),
        )
    )
    db_session.commit()
    monkeypatch.setattr(
        "app.services.storage.create_video_url",
        lambda key: f"https://videos.test/{key}",
    )

    login(patient_user)
    response = api.get(f"/api/v1/exercises/{created['id']}/video")

    assert response.status_code == 200
    assert response.json()["url"] == (
        f"https://videos.test/{created['reference_video_key']}"
    )


def test_patient_cannot_view_video_for_unassigned_exercise(
    api, login, therapist, patient_user, other_patient_user, seed_patient, db_session
):
    seed_patient(patient_user, therapist)
    other_patient = seed_patient(other_patient_user, therapist)
    login(therapist)
    created = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    ).json()
    db_session.add(
        Assignment(
            patient_id=other_patient.id,
            exercise_id=uuid.UUID(created["id"]),
            repetitions=10,
            sessions_per_week=3,
            starts_on=date(2026, 1, 1),
        )
    )
    db_session.commit()

    login(patient_user)
    response = api.get(f"/api/v1/exercises/{created['id']}/video")

    assert response.status_code == 403
    assert response.json()["detail"] == "You can view only exercises assigned to you"


def test_therapist_can_edit_exercise_with_unchanged_legacy_video_key(
    api, login, therapist, db_session
):
    login(therapist)
    created = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    ).json()
    exercise = db_session.get(Exercise, uuid.UUID(created["id"]))
    exercise.reference_video_key = "legacy-video-name.mp4"
    db_session.commit()

    payload = exercise_payload(
        str(therapist.id),
        name="Renamed exercise",
        reference_video_key=exercise.reference_video_key,
    )
    response = api.put(f"/api/v1/exercises/{created['id']}", json=payload)

    assert response.status_code == 200
    assert response.json()["name"] == "Renamed exercise"
    assert response.json()["reference_video_key"] == "legacy-video-name.mp4"


def test_therapist_must_keep_or_upload_video_when_updating(
    api, login, therapist
):
    login(therapist)
    created = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    ).json()

    response = api.put(
        f"/api/v1/exercises/{created['id']}",
        json=exercise_payload(
            str(therapist.id), reference_video_key=None
        ),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "A reference video is required"


def test_replacing_reference_video_deletes_old_unreferenced_file(
    api, login, therapist, monkeypatch
):
    deleted_keys = []
    monkeypatch.setattr(
        "app.services.storage.delete_video",
        lambda key: deleted_keys.append(key),
    )
    login(therapist)
    old_key = f"videos/{therapist.id}/{uuid.uuid4().hex}.mp4"
    new_key = f"videos/{therapist.id}/{uuid.uuid4().hex}.mp4"
    created = api.post(
        "/api/v1/exercises/",
        json=exercise_payload(str(therapist.id), reference_video_key=old_key),
    ).json()

    response = api.put(
        f"/api/v1/exercises/{created['id']}",
        json=exercise_payload(str(therapist.id), reference_video_key=new_key),
    )

    assert response.status_code == 200
    assert deleted_keys == [old_key]


def test_replacing_shared_reference_video_keeps_file_in_use(
    api, login, therapist, monkeypatch
):
    deleted_keys = []
    monkeypatch.setattr(
        "app.services.storage.delete_video",
        lambda key: deleted_keys.append(key),
    )
    login(therapist)
    shared_key = f"videos/{therapist.id}/{uuid.uuid4().hex}.mp4"
    created = api.post(
        "/api/v1/exercises/",
        json=exercise_payload(str(therapist.id), reference_video_key=shared_key),
    ).json()
    api.post(
        "/api/v1/exercises/",
        json=exercise_payload(str(therapist.id), reference_video_key=shared_key),
    )

    response = api.put(
        f"/api/v1/exercises/{created['id']}",
        json=exercise_payload(
            str(therapist.id),
            reference_video_key=f"videos/{therapist.id}/{uuid.uuid4().hex}.mp4",
        ),
    )

    assert response.status_code == 200
    assert deleted_keys == []


def test_uploaded_video_cleanup_requires_ownership_and_no_references(
    api, login, therapist, other_therapist, monkeypatch
):
    deleted_keys = []
    monkeypatch.setattr(
        "app.services.storage.delete_video",
        lambda key: deleted_keys.append(key),
    )
    login(therapist)
    own_key = f"videos/{therapist.id}/{uuid.uuid4().hex}.mp4"
    foreign_key = f"videos/{other_therapist.id}/{uuid.uuid4().hex}.mp4"

    deleted = api.delete(
        "/api/v1/comparisons/uploads", params={"key": own_key}
    )
    forbidden = api.delete(
        "/api/v1/comparisons/uploads", params={"key": foreign_key}
    )
    created = api.post(
        "/api/v1/exercises/",
        json=exercise_payload(
            str(therapist.id),
            reference_video_key=f"videos/{therapist.id}/{uuid.uuid4().hex}.mp4",
        ),
    ).json()
    referenced_key = created["reference_video_key"]
    conflict = api.delete(
        "/api/v1/comparisons/uploads", params={"key": referenced_key}
    )

    assert deleted.status_code == 204
    assert forbidden.status_code == 403
    assert conflict.status_code == 409
    assert deleted_keys == [own_key]


def test_patient_cannot_delete_uploaded_video(api, login, patient_user):
    login(patient_user)

    response = api.delete(
        "/api/v1/comparisons/uploads",
        params={"key": f"videos/{patient_user.id}/{uuid.uuid4().hex}.mp4"},
    )

    assert response.status_code == 403


def test_every_role_can_list_and_get_exercises(api, login, therapist, patient_user):
    login(therapist)
    created = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    ).json()

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

    ok = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    )
    too_long = api.post(
        "/api/v1/exercises/",
        json=exercise_payload(
            str(therapist.id), reference_video_key="a" * 513
        ),
    )

    assert ok.status_code == 201
    assert too_long.status_code == 422


def test_therapist_can_update_and_delete_own_exercise(
    api, login, therapist, monkeypatch
):
    monkeypatch.setattr("app.services.storage.delete_video", lambda _key: None)
    login(therapist)
    created = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    ).json()

    updated = api.put(
        f"/api/v1/exercises/{created['id']}",
        json=exercise_payload(str(therapist.id), name="Updated exercise"),
    )
    deleted = api.delete(f"/api/v1/exercises/{created['id']}")
    missing = api.get(f"/api/v1/exercises/{created['id']}")

    assert updated.status_code == 200
    assert updated.json()["name"] == "Updated exercise"
    assert deleted.status_code == 204
    assert missing.status_code == 404


def test_therapist_cannot_delete_assigned_exercise(
    api, login, therapist, patient_user, seed_patient, db_session
):
    patient = seed_patient(patient_user, therapist)
    login(therapist)
    created = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    ).json()
    db_exercise = db_session.get(Exercise, uuid.UUID(created["id"]))
    db_session.add(
        Assignment(
            patient_id=patient.id,
            exercise_id=db_exercise.id,
            repetitions=10,
            sessions_per_week=3,
            starts_on=date(2026, 1, 1),
        )
    )
    db_session.commit()

    response = api.delete(f"/api/v1/exercises/{created['id']}")

    assert response.status_code == 409
    assert response.json()["detail"] == "Cannot delete an exercise assigned to a patient"


def test_therapist_cannot_update_another_therapists_exercise(
    api, login, therapist, other_therapist
):
    login(therapist)
    created = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    ).json()

    login(other_therapist)
    response = api.put(
        f"/api/v1/exercises/{created['id']}",
        json=exercise_payload(
            str(other_therapist.id), name="Not allowed"
        ),
    )

    assert response.status_code == 403


def test_exercise_read_schema_matches_model_columns():
    from app.models.exercise import Exercise

    columns = {column.name for column in Exercise.__table__.columns}

    assert set(ExerciseRead.model_fields) <= columns


def test_exercise_stores_body_parts(api, login, therapist):
    login(therapist)

    response = api.post(
        "/api/v1/exercises/",
        json=exercise_payload(
            str(therapist.id), body_parts=["right_leg", "torso"]
        ),
    )

    assert response.status_code == 201
    assert response.json()["body_parts"] == ["right_leg", "torso"]


def test_exercise_body_parts_default_to_empty(api, login, therapist):
    login(therapist)

    response = api.post(
        "/api/v1/exercises/", json=exercise_payload(str(therapist.id))
    )

    assert response.json()["body_parts"] == []


def test_exercise_rejects_unknown_or_repeated_body_parts(api, login, therapist):
    login(therapist)

    for bad in (["head"], ["torso", "torso"]):
        response = api.post(
            "/api/v1/exercises/",
            json=exercise_payload(str(therapist.id), body_parts=bad),
        )
        assert response.status_code == 422
