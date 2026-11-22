import pytest

from app.models.patient import Patient
from app.models.user import User
from app.services import keycloak_admin
from app.services.keycloak_admin import KeycloakAdminError


@pytest.fixture
def keycloak_calls(monkeypatch):
    calls = []
    monkeypatch.setattr(keycloak_admin, "replace_app_role", lambda sub, role: calls.append((sub, role)))
    return calls


def _empty_profile(db_session, user) -> Patient:
    profile = Patient(user_id=user.id)
    db_session.add(profile)
    db_session.commit()
    return profile


def test_new_account_becomes_a_therapist_without_approval(
    api, login, patient_user, db_session, keycloak_calls
):
    _empty_profile(db_session, patient_user)
    login(patient_user)

    response = api.post("/api/v1/auth/me/role", json={"role": "therapist"})

    assert response.status_code == 200
    assert response.json()["role"] == "therapist"
    assert response.json()["pending_role"] is None
    assert [(sub, role.value) for sub, role in keycloak_calls] == [
        (patient_user.keycloak_sub, "therapist")
    ]
    db_session.expire_all()
    assert db_session.get(User, patient_user.id).role == "therapist"
    assert db_session.query(Patient).filter(Patient.user_id == patient_user.id).count() == 0


def test_choosing_therapist_twice_is_harmless(api, login, therapist, keycloak_calls):
    login(therapist)

    response = api.post("/api/v1/auth/me/role", json={"role": "therapist"})

    assert response.status_code == 200
    assert keycloak_calls == []


def test_account_with_patient_data_cannot_switch(
    api, login, therapist, patient_user, seed_patient, db_session, keycloak_calls
):
    seed_patient(patient_user, therapist)
    login(patient_user)

    response = api.post("/api/v1/auth/me/role", json={"role": "therapist"})

    assert response.status_code == 409
    assert keycloak_calls == []
    assert db_session.query(Patient).filter(Patient.user_id == patient_user.id).count() == 1


@pytest.mark.parametrize("role", ["admin", "patient", "doctor"])
def test_only_the_therapist_role_can_be_chosen(api, login, patient_user, keycloak_calls, role):
    login(patient_user)

    assert api.post("/api/v1/auth/me/role", json={"role": role}).status_code == 422


def test_admin_cannot_choose_a_role(api, login, admin, keycloak_calls):
    login(admin)

    assert api.post("/api/v1/auth/me/role", json={"role": "therapist"}).status_code == 400
    assert keycloak_calls == []


def test_keycloak_failure_keeps_the_account_a_patient(
    api, login, patient_user, db_session, monkeypatch
):
    _empty_profile(db_session, patient_user)

    def fail(sub, role):
        raise KeycloakAdminError("down")

    monkeypatch.setattr(keycloak_admin, "replace_app_role", fail)
    login(patient_user)

    response = api.post("/api/v1/auth/me/role", json={"role": "therapist"})

    assert response.status_code == 503
    db_session.expire_all()
    assert db_session.get(User, patient_user.id).role == "patient"
    assert db_session.query(Patient).filter(Patient.user_id == patient_user.id).count() == 1


def test_choosing_a_role_requires_a_login(api):
    assert api.post("/api/v1/auth/me/role", json={"role": "therapist"}).status_code == 401
