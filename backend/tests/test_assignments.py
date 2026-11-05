import uuid

from app.models.assignment import Assignment
from app.schemas.assignment import AssignmentRead


def assignment_payload(patient_id, **overrides) -> dict:
    payload = {
        "patient_id": str(patient_id),
        "exercise_id": str(uuid.uuid4()),
        "sessions_per_week": 3,
        "repetitions": 10,
        "starts_on": "2026-01-01",
    }
    payload.update(overrides)
    return payload


def test_therapist_assigns_exercise_to_own_patient(
    api, login, therapist, patient_user, seed_patient
):
    patient = seed_patient(patient_user, therapist)
    login(therapist)

    response = api.post("/api/v1/assignments/", json=assignment_payload(patient.id))

    assert response.status_code == 201
    body = response.json()
    assert body["patient_id"] == str(patient.id)
    assert body["status"] == "active"
    assert body["ends_on"] is None


def test_therapist_cannot_assign_to_foreign_patient(
    api, login, therapist, other_therapist, patient_user, seed_patient
):
    foreign = seed_patient(patient_user, other_therapist)
    login(therapist)

    response = api.post("/api/v1/assignments/", json=assignment_payload(foreign.id))

    assert response.status_code == 403


def test_assignment_for_unknown_patient_returns_404(api, login, therapist):
    login(therapist)

    response = api.post("/api/v1/assignments/", json=assignment_payload(uuid.uuid4()))

    assert response.status_code == 404


def test_patient_cannot_create_assignment(api, login, therapist, patient_user, seed_patient):
    patient = seed_patient(patient_user, therapist)
    login(patient_user)

    response = api.post("/api/v1/assignments/", json=assignment_payload(patient.id))

    assert response.status_code == 403


def test_list_with_patient_id_filters_and_checks_access(
    api, login, therapist, patient_user, other_patient_user, seed_patient, seed_assignment
):
    own = seed_patient(patient_user, therapist)
    other = seed_patient(other_patient_user, therapist)
    own_assignment = seed_assignment(own)
    seed_assignment(other)
    login(therapist)

    response = api.get(f"/api/v1/assignments/?patient_id={own.id}")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [str(own_assignment.id)]


def test_list_with_foreign_patient_id_is_forbidden(
    api, login, patient_user, other_patient_user, therapist, seed_patient
):
    seed_patient(patient_user, therapist)
    foreign = seed_patient(other_patient_user, therapist)
    login(patient_user)

    response = api.get(f"/api/v1/assignments/?patient_id={foreign.id}")

    assert response.status_code == 403


def test_patient_list_without_patient_id_returns_only_own(
    api, login, therapist, patient_user, other_patient_user, seed_patient, seed_assignment
):
    own = seed_patient(patient_user, therapist)
    other = seed_patient(other_patient_user, therapist)
    own_assignment = seed_assignment(own)
    seed_assignment(other)
    login(patient_user)

    response = api.get("/api/v1/assignments/")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [str(own_assignment.id)]


def test_therapist_list_without_patient_id_returns_only_own_patients(
    api, login, therapist, other_therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment,
):
    own_assignment = seed_assignment(seed_patient(patient_user, therapist))
    seed_assignment(seed_patient(other_patient_user, other_therapist))
    login(therapist)

    response = api.get("/api/v1/assignments/")

    assert [item["id"] for item in response.json()] == [str(own_assignment.id)]


def test_admin_list_returns_everything(
    api, login, admin, therapist, other_therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment,
):
    seed_assignment(seed_patient(patient_user, therapist))
    seed_assignment(seed_patient(other_patient_user, other_therapist))
    login(admin)

    response = api.get("/api/v1/assignments/")

    assert len(response.json()) == 2


def test_get_assignment_checks_patient_access(
    api, login, therapist, patient_user, other_patient_user, seed_patient, seed_assignment
):
    own = seed_assignment(seed_patient(patient_user, therapist))
    foreign = seed_assignment(seed_patient(other_patient_user, therapist))
    login(patient_user)

    assert api.get(f"/api/v1/assignments/{own.id}").status_code == 200
    assert api.get(f"/api/v1/assignments/{foreign.id}").status_code == 403
    assert api.get(f"/api/v1/assignments/{uuid.uuid4()}").status_code == 404


def test_assignment_read_schema_matches_model_columns():
    columns = {column.name for column in Assignment.__table__.columns}

    assert set(AssignmentRead.model_fields) <= columns
