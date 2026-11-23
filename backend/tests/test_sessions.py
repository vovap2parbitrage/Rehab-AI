import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.models.session import TrainingSession
from app.schemas.session import SessionCreate, SessionRead


def test_patient_creates_session_for_own_assignment(
    api, login, therapist, patient_user, seed_patient, seed_assignment
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    login(patient_user)

    response = api.post(
        "/api/v1/sessions/",
        json={"assignment_id": str(assignment.id), "pain_score": 4},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["assignment_id"] == str(assignment.id)
    assert body["pain_score"] == 4
    assert body["score"] is None
    assert body["joint_deviations"] == {}
    assert body["id"]
    assert body["created_at"]


def test_pain_score_is_optional_and_bounded(
    api, login, therapist, patient_user, seed_patient, seed_assignment
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    login(patient_user)

    without = api.post("/api/v1/sessions/", json={"assignment_id": str(assignment.id)})
    too_high = api.post(
        "/api/v1/sessions/",
        json={"assignment_id": str(assignment.id), "pain_score": 11},
    )

    assert without.status_code == 201
    assert too_high.status_code == 422


def test_session_for_unknown_assignment_returns_404(api, login, patient_user):
    login(patient_user)

    response = api.post(
        "/api/v1/sessions/",
        json={"assignment_id": str(uuid.uuid4()), "pain_score": 1},
    )

    assert response.status_code == 404


def test_patient_cannot_create_session_for_foreign_assignment(
    api, login, therapist, patient_user, other_patient_user, seed_patient, seed_assignment
):
    seed_patient(patient_user, therapist)
    foreign = seed_assignment(seed_patient(other_patient_user, therapist))
    login(patient_user)

    response = api.post(
        "/api/v1/sessions/",
        json={"assignment_id": str(foreign.id), "pain_score": 1},
    )

    assert response.status_code == 403


def test_get_session_checks_patient_access(
    api, login, therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment, seed_session,
):
    own = seed_session(seed_assignment(seed_patient(patient_user, therapist)))
    foreign = seed_session(seed_assignment(seed_patient(other_patient_user, therapist)))
    login(patient_user)

    assert api.get(f"/api/v1/sessions/{own.id}").status_code == 200
    assert api.get(f"/api/v1/sessions/{foreign.id}").status_code == 403
    assert api.get(f"/api/v1/sessions/{uuid.uuid4()}").status_code == 404


def test_patient_list_without_patient_id_returns_only_own(
    api, login, therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment, seed_session,
):
    own = seed_session(seed_assignment(seed_patient(patient_user, therapist)))
    seed_session(seed_assignment(seed_patient(other_patient_user, therapist)))
    login(patient_user)

    response = api.get("/api/v1/sessions/")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [str(own.id)]


def test_duplicate_video_check_searches_all_of_the_patients_assignments(
    api, login, therapist, patient_user, seed_patient, seed_assignment, db_session
):
    patient = seed_patient(patient_user, therapist)
    first_assignment = seed_assignment(patient)
    seed_assignment(patient)
    video_sha256 = "a" * 64
    session_date = datetime(2026, 2, 1, tzinfo=UTC)
    db_session.add(
        TrainingSession(
            assignment_id=first_assignment.id,
            video_sha256=video_sha256,
            completed_at=session_date,
        )
    )
    db_session.commit()
    login(patient_user)

    response = api.post(
        "/api/v1/sessions/duplicate-video",
        json={"video_sha256": video_sha256},
    )

    assert response.status_code == 200
    assert response.json()["session_date"] == "2026-02-01T00:00:00Z"


def test_another_patients_identical_video_is_not_a_duplicate(
    api, login, therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment, db_session,
):
    video_sha256 = "b" * 64
    foreign_assignment = seed_assignment(seed_patient(other_patient_user, therapist))
    db_session.add(
        TrainingSession(
            assignment_id=foreign_assignment.id,
            video_sha256=video_sha256,
        )
    )
    db_session.commit()
    login(patient_user)

    response = api.post(
        "/api/v1/sessions/duplicate-video",
        json={"video_sha256": video_sha256},
    )

    assert response.status_code == 200
    assert response.json()["session_date"] is None


def test_duplicate_video_check_requires_a_valid_hash_and_patient_role(
    api, login, therapist, patient_user
):
    login(patient_user)
    invalid_hash = api.post(
        "/api/v1/sessions/duplicate-video",
        json={"video_sha256": "not-a-hash"},
    )
    assert invalid_hash.status_code == 422

    login(therapist)
    forbidden = api.post(
        "/api/v1/sessions/duplicate-video",
        json={"video_sha256": "c" * 64},
    )
    assert forbidden.status_code == 403


def test_patient_session_list_paginates_newest_first(
    api, login, therapist, patient_user, seed_patient, seed_assignment, seed_session, db_session
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    old_session = TrainingSession(
        assignment_id=assignment.id,
        completed_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    new_session = TrainingSession(
        assignment_id=assignment.id,
        completed_at=datetime(2026, 2, 1, tzinfo=UTC),
    )
    db_session.add_all([old_session, new_session])
    db_session.commit()
    login(therapist)

    response = api.get(
        f"/api/v1/sessions/?patient_id={assignment.patient_id}",
        params={"limit": 1, "offset": 0},
    )
    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["id"] == str(new_session.id)


def test_list_with_patient_id_filters_and_checks_access(
    api, login, therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment, seed_session,
):
    own_patient = seed_patient(patient_user, therapist)
    foreign_patient = seed_patient(other_patient_user, therapist)
    own = seed_session(seed_assignment(own_patient))
    seed_session(seed_assignment(foreign_patient))

    login(therapist)
    response = api.get(f"/api/v1/sessions/?patient_id={own_patient.id}")
    assert [item["id"] for item in response.json()["items"]] == [str(own.id)]

    login(patient_user)
    forbidden = api.get(f"/api/v1/sessions/?patient_id={foreign_patient.id}")
    assert forbidden.status_code == 403


def test_therapist_list_excludes_foreign_patients(
    api, login, therapist, other_therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment, seed_session,
):
    own = seed_session(seed_assignment(seed_patient(patient_user, therapist)))
    seed_session(seed_assignment(seed_patient(other_patient_user, other_therapist)))
    login(therapist)

    response = api.get("/api/v1/sessions/")

    assert [item["id"] for item in response.json()["items"]] == [str(own.id)]


def test_admin_list_returns_everything(
    api, login, admin, therapist, other_therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment, seed_session,
):
    seed_session(seed_assignment(seed_patient(patient_user, therapist)))
    seed_session(seed_assignment(seed_patient(other_patient_user, other_therapist)))
    login(admin)

    response = api.get("/api/v1/sessions/")

    assert response.json()["total"] == 2


def test_session_schemas_match_model_columns():
    columns = {column.name for column in TrainingSession.__table__.columns}

    assert set(SessionCreate.model_fields) <= columns
    # has_video is derived from video_key, so it is not a column itself.
    assert set(SessionRead.model_fields) - {"has_video"} <= columns
    assert "video_key" in columns
    assert "video_sha256" in columns


def test_score_uses_the_zero_to_ten_scale():
    assert SessionRead(assignment_id=uuid.uuid4(), score=8.5).score == 8.5
    with pytest.raises(ValidationError):
        SessionRead(assignment_id=uuid.uuid4(), score=85)


VIDEO_KEY = "videos/" + "a" * 8 + "/" + "b" * 32 + ".mp4"


def _session_with_video(db_session, assignment, video_key=VIDEO_KEY):
    session = TrainingSession(assignment_id=assignment.id, score=7.5, video_key=video_key)
    db_session.add(session)
    db_session.commit()
    return session


def test_patient_and_therapist_can_open_the_session_video(
    api, login, therapist, patient_user, seed_patient, seed_assignment, db_session, monkeypatch
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    session = _session_with_video(db_session, assignment)
    monkeypatch.setattr("app.services.storage.create_video_url", lambda key: f"https://v.test/{key}")

    for user in (patient_user, therapist):
        login(user)
        response = api.get(f"/api/v1/sessions/{session.id}/video")
        assert response.status_code == 200
        assert response.json() == {"url": f"https://v.test/{VIDEO_KEY}"}


def test_other_patient_cannot_open_the_session_video(
    api, login, therapist, patient_user, other_patient_user, seed_patient, seed_assignment,
    db_session, monkeypatch,
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    session = _session_with_video(db_session, assignment)
    monkeypatch.setattr("app.services.storage.create_video_url", lambda key: "https://v.test/x")
    login(other_patient_user)

    assert api.get(f"/api/v1/sessions/{session.id}/video").status_code == 403


def test_other_therapist_cannot_open_the_session_video(
    api, login, therapist, other_therapist, patient_user, seed_patient, seed_assignment,
    db_session, monkeypatch,
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    session = _session_with_video(db_session, assignment)
    monkeypatch.setattr("app.services.storage.create_video_url", lambda key: "https://v.test/x")
    login(other_therapist)

    assert api.get(f"/api/v1/sessions/{session.id}/video").status_code == 403


def test_session_without_a_video_has_no_video_url(
    api, login, therapist, patient_user, seed_patient, seed_assignment, db_session
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    session = _session_with_video(db_session, assignment, video_key=None)
    login(patient_user)

    assert api.get(f"/api/v1/sessions/{session.id}/video").status_code == 404
    assert api.get(f"/api/v1/sessions/{session.id}").json()["has_video"] is False


def test_session_read_says_when_it_has_a_video_but_never_shows_the_key(
    api, login, therapist, patient_user, seed_patient, seed_assignment, db_session
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    session = _session_with_video(db_session, assignment)
    login(patient_user)

    body = api.get(f"/api/v1/sessions/{session.id}").json()
    mine = api.get("/api/v1/assignments/mine").json()[0]["sessions"][0]

    assert body["has_video"] is True
    assert mine["has_video"] is True
    assert VIDEO_KEY not in str(body) + str(mine)


def test_unknown_session_video_is_404(api, login, patient_user):
    login(patient_user)
    assert api.get(f"/api/v1/sessions/{uuid.uuid4()}/video").status_code == 404


def test_therapist_can_still_read_sessions_of_an_archived_patient(
    api, login, therapist, patient_user, seed_patient, seed_assignment, seed_session
):
    patient = seed_patient(patient_user, therapist)
    seed_session(seed_assignment(patient))
    login(therapist)
    assert api.post(f"/api/v1/patients/{patient.id}/archive").status_code == 204

    response = api.get(f"/api/v1/sessions/?patient_id={patient.id}")

    assert response.status_code == 200
    assert response.json()["total"] == 1
