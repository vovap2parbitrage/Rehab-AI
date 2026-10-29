import uuid


def patient_payload(user_id, therapist_id) -> dict:
    return {
        "user_id": str(user_id),
        "therapist_id": str(therapist_id),
        "first_name": "Ivan",
        "last_name": "Petrenko",
        "date_of_birth": "1990-05-17",
        "notes": "left knee",
    }


def test_therapist_creates_and_reads_own_patient(
    api, login, therapist, patient_user
):
    login(therapist)

    created = api.post("/api/v1/patients/", json=patient_payload(patient_user.id, therapist.id))
    assert created.status_code == 201
    body = created.json()
    assert body["first_name"] == "Ivan"
    assert body["therapist_id"] == str(therapist.id)

    fetched = api.get(f"/api/v1/patients/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == body["id"]


def test_patient_cannot_create_patient(api, login, patient_user):
    login(patient_user)

    response = api.post(
        "/api/v1/patients/",
        json=patient_payload(patient_user.id, uuid.uuid4()),
    )

    assert response.status_code == 403


def test_patient_reads_own_record(api, login, therapist, patient_user, seed_patient):
    patient = seed_patient(patient_user, therapist)
    login(patient_user)

    response = api.get(f"/api/v1/patients/{patient.id}")

    assert response.status_code == 200


def test_patient_cannot_read_another_patient(
    api, login, therapist, patient_user, other_patient_user, seed_patient
):
    seed_patient(patient_user, therapist)
    foreign = seed_patient(other_patient_user, therapist)
    login(patient_user)

    response = api.get(f"/api/v1/patients/{foreign.id}")

    assert response.status_code == 403


def test_therapist_cannot_read_patient_of_another_therapist(
    api, login, therapist, other_therapist, patient_user, seed_patient
):
    foreign = seed_patient(patient_user, other_therapist)
    login(therapist)

    response = api.get(f"/api/v1/patients/{foreign.id}")

    assert response.status_code == 403


def test_admin_reads_any_patient(api, login, admin, therapist, patient_user, seed_patient):
    patient = seed_patient(patient_user, therapist)
    login(admin)

    response = api.get(f"/api/v1/patients/{patient.id}")

    assert response.status_code == 200


def test_unknown_patient_returns_404(api, login, admin):
    login(admin)

    response = api.get(f"/api/v1/patients/{uuid.uuid4()}")

    assert response.status_code == 404


def test_patient_requires_model_fields(api, login, therapist):
    login(therapist)

    response = api.post(
        "/api/v1/patients/",
        json={"full_name": "Ivan Petrenko", "phone": "+380000000000"},
    )

    assert response.status_code == 422


def test_patient_schema_matches_model_columns():
    from app.models.patient import Patient
    from app.schemas.patient import PatientRead

    columns = {column.name for column in Patient.__table__.columns}

    assert set(PatientRead.model_fields) <= columns
