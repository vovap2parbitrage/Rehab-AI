from app.models.patient import Patient


def test_therapist_can_send_invitation(
    api, login, therapist, patient_user, seed_patient, db_session
):
    patient = seed_patient(patient_user, therapist)
    db_patient = db_session.get(Patient, patient.id)
    db_patient.therapists.clear()
    db_session.commit()
    login(therapist)

    response = api.post(
        "/api/v1/invitations/",
        json={"patient_id": str(patient.id), "message": "Будемо працювати разом"},
    )

    assert response.status_code == 201
    assert response.json()["patient_id"] == str(patient.id)
    assert response.json()["therapist_id"] == str(therapist.id)
    assert response.json()["status"] == "pending"


def test_patient_cannot_send_invitation(api, login, patient_user):
    login(patient_user)

    response = api.post(
        "/api/v1/invitations/",
        json={"patient_id": str(patient_user.id)},
    )

    assert response.status_code == 403
