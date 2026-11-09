import pytest

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


def _unassigned_patient(db_session, seed_patient, patient_user, therapist):
    patient = seed_patient(patient_user, therapist)
    db_patient = db_session.get(Patient, patient.id)
    db_patient.therapists.clear()
    db_session.commit()
    return patient


def test_patient_can_decline_the_same_therapist_twice(
    api, login, therapist, patient_user, seed_patient, db_session
):
    patient = _unassigned_patient(db_session, seed_patient, patient_user, therapist)

    for _ in range(2):
        login(therapist)
        invitation = api.post("/api/v1/invitations/", json={"patient_id": str(patient.id)})
        assert invitation.status_code == 201

        login(patient_user)
        answer = api.patch(
            f"/api/v1/invitations/{invitation.json()['id']}/response",
            json={"status": "declined"},
        )
        assert answer.status_code == 200
        assert answer.json()["status"] == "declined"


def test_second_pending_invitation_is_a_conflict(
    api, login, therapist, patient_user, seed_patient, db_session
):
    patient = _unassigned_patient(db_session, seed_patient, patient_user, therapist)
    login(therapist)

    first = api.post("/api/v1/invitations/", json={"patient_id": str(patient.id)})
    second = api.post("/api/v1/invitations/", json={"patient_id": str(patient.id)})

    assert first.status_code == 201
    assert second.status_code == 409


@pytest.mark.parametrize("bad_status", ["pending", "revoked", "anything"])
def test_patient_cannot_send_an_arbitrary_response_status(
    api, login, therapist, patient_user, seed_patient, db_session, bad_status
):
    patient = _unassigned_patient(db_session, seed_patient, patient_user, therapist)
    login(therapist)
    invitation = api.post("/api/v1/invitations/", json={"patient_id": str(patient.id)})

    login(patient_user)
    response = api.patch(
        f"/api/v1/invitations/{invitation.json()['id']}/response",
        json={"status": bad_status},
    )

    assert response.status_code == 422


def test_invitation_email_must_be_valid(api, login, therapist):
    login(therapist)
    response = api.post("/api/v1/invitations/", json={"email": "not-an-email"})
    assert response.status_code == 422
