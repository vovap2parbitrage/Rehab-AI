import uuid

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
    assert [item["id"] for item in response.json()] == [str(own.id)]


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
    assert [item["id"] for item in response.json()] == [str(own.id)]

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

    assert [item["id"] for item in response.json()] == [str(own.id)]


def test_admin_list_returns_everything(
    api, login, admin, therapist, other_therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment, seed_session,
):
    seed_session(seed_assignment(seed_patient(patient_user, therapist)))
    seed_session(seed_assignment(seed_patient(other_patient_user, other_therapist)))
    login(admin)

    response = api.get("/api/v1/sessions/")

    assert len(response.json()) == 2


def test_session_schemas_match_model_columns():
    columns = {column.name for column in TrainingSession.__table__.columns}

    assert set(SessionCreate.model_fields) <= columns
    assert set(SessionRead.model_fields) <= columns
