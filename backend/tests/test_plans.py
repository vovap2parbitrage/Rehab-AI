import uuid

import pytest
from conftest import make_user

from app.models.invitation import TherapistInvitation
from app.models.patient import Patient
from app.models.plan import PlanPayment
from app.services import payments

LIMIT_CODE = "patient_limit_reached"


def _patient(db_session, *therapists) -> Patient:
    owner = make_user("patient")
    db_session.add(owner)
    db_session.flush()
    patient = Patient(
        user_id=owner.id,
        therapists=list(therapists),
    )
    db_session.add(patient)
    db_session.commit()
    return patient


def _fill(db_session, therapist, count: int) -> list[Patient]:
    return [_patient(db_session, therapist) for _ in range(count)]


def _invite(api, patient):
    return api.post("/api/v1/invitations/", json={"patient_id": str(patient.id)})


def _my_plan(api) -> dict:
    response = api.get("/api/v1/therapists/me/plan")
    assert response.status_code == 200
    return response.json()


def test_price_page_data_is_public_and_ordered_by_price(api):
    response = api.get("/api/v1/plans/")

    assert response.status_code == 200
    assert [(item["code"], item["max_active_patients"], item["price_uah"]) for item in response.json()] == [
        ("free", 5, 0),
        ("standard", 15, 499),
        ("pro", 30, 899),
    ]


def test_new_therapist_starts_on_the_free_plan(api, login, therapist):
    login(therapist)

    assert _my_plan(api) == {
        "plan": "free",
        "plan_name": "Безкоштовний",
        "limit": 5,
        "active": 0,
        "pending": 0,
        "free": 5,
    }


def test_only_therapists_read_their_plan(api, login, patient_user):
    login(patient_user)

    assert api.get("/api/v1/therapists/me/plan").status_code == 403


def test_counter_drops_when_a_patient_joins_and_rises_when_archived(
    api, login, therapist, db_session
):
    patient = _patient(db_session)
    login(therapist)
    assert _invite(api, patient).status_code == 201
    assert _my_plan(api)["free"] == 5

    invitation_id = db_session.query(TherapistInvitation).one().id
    login(patient.user)
    answer = api.patch(
        f"/api/v1/invitations/{invitation_id}/response", json={"status": "accepted"}
    )
    assert answer.status_code == 200

    login(therapist)
    assert (_my_plan(api)["active"], _my_plan(api)["free"]) == (1, 4)

    assert api.post(f"/api/v1/patients/{patient.id}/archive").status_code == 204
    assert (_my_plan(api)["active"], _my_plan(api)["free"]) == (0, 5)


def test_invitation_is_refused_at_the_limit_with_a_clear_message(
    api, login, therapist, db_session
):
    _fill(db_session, therapist, 5)
    newcomer = _patient(db_session)
    login(therapist)

    response = _invite(api, newcomer)

    assert response.status_code == 409
    assert response.json()["code"] == LIMIT_CODE
    assert "5 active patients" in response.json()["detail"]
    assert db_session.query(TherapistInvitation).count() == 0


def test_pending_invitations_also_take_a_slot(api, login, therapist, db_session):
    _fill(db_session, therapist, 4)
    first, second = _patient(db_session), _patient(db_session)
    login(therapist)

    assert _invite(api, first).status_code == 201
    refused = _invite(api, second)

    assert refused.status_code == 409
    assert refused.json()["code"] == LIMIT_CODE
    plan = _my_plan(api)
    assert (plan["active"], plan["pending"], plan["free"]) == (4, 1, 1)


def test_archiving_frees_a_slot_for_a_new_invitation(api, login, therapist, db_session):
    patients = _fill(db_session, therapist, 5)
    newcomer = _patient(db_session)
    login(therapist)
    assert _invite(api, newcomer).status_code == 409

    assert api.post(f"/api/v1/patients/{patients[0].id}/archive").status_code == 204

    assert _invite(api, newcomer).status_code == 201


def test_the_last_free_slot_can_still_be_accepted(api, login, therapist, db_session):
    _fill(db_session, therapist, 4)
    newcomer = _patient(db_session)
    login(therapist)
    assert _invite(api, newcomer).status_code == 201
    invitation_id = db_session.query(TherapistInvitation).one().id

    login(newcomer.user)
    answer = api.patch(
        f"/api/v1/invitations/{invitation_id}/response", json={"status": "accepted"}
    )

    assert answer.status_code == 200
    login(therapist)
    assert _my_plan(api)["active"] == 5


def test_accepting_is_refused_when_the_plan_no_longer_has_room(
    api, login, admin, therapist, db_session
):
    newcomer = _patient(db_session)
    _fill(db_session, therapist, 15)
    db_session.add(TherapistInvitation(patient_id=newcomer.id, therapist_id=therapist.id))
    therapist.plan_code = "standard"
    db_session.commit()
    login(admin)
    assert (
        api.put(
            f"/api/v1/therapists/{therapist.id}/plan", json={"plan_code": "free"}
        ).status_code
        == 200
    )
    invitation_id = db_session.query(TherapistInvitation).one().id

    login(newcomer.user)
    answer = api.patch(
        f"/api/v1/invitations/{invitation_id}/response", json={"status": "accepted"}
    )

    assert answer.status_code == 409
    assert answer.json()["code"] == LIMIT_CODE
    assert db_session.query(TherapistInvitation).one().status == "pending"


def test_declining_works_at_the_limit(api, login, therapist, db_session):
    _fill(db_session, therapist, 5)
    newcomer = _patient(db_session)
    db_session.add(TherapistInvitation(patient_id=newcomer.id, therapist_id=therapist.id))
    db_session.commit()
    invitation_id = db_session.query(TherapistInvitation).one().id

    login(newcomer.user)
    answer = api.patch(
        f"/api/v1/invitations/{invitation_id}/response", json={"status": "declined"}
    )

    assert answer.status_code == 200


def test_restore_is_refused_at_the_limit_and_allowed_with_room(
    api, login, therapist, db_session
):
    patients = _fill(db_session, therapist, 5)
    login(therapist)
    assert api.post(f"/api/v1/patients/{patients[0].id}/archive").status_code == 204
    assert _invite(api, _patient(db_session)).status_code == 201
    refused = api.post(f"/api/v1/patients/{patients[0].id}/restore")

    assert refused.status_code == 409
    assert refused.json()["code"] == LIMIT_CODE
    assert api.get("/api/v1/patients/?archived=true").json()["items"][0]["id"] == str(
        patients[0].id
    )

    invitation = db_session.query(TherapistInvitation).one()
    invitation.status = "revoked"
    db_session.commit()

    assert api.post(f"/api/v1/patients/{patients[0].id}/restore").status_code == 204
    assert _my_plan(api)["active"] == 5


def test_restoring_an_active_patient_at_the_limit_is_a_no_op(
    api, login, therapist, db_session
):
    patients = _fill(db_session, therapist, 5)
    login(therapist)

    assert api.post(f"/api/v1/patients/{patients[0].id}/restore").status_code == 204


def test_creating_a_patient_profile_is_refused_at_the_limit(
    api, login, therapist, db_session
):
    _fill(db_session, therapist, 5)
    owner = make_user("patient")
    db_session.add(owner)
    db_session.commit()
    login(therapist)

    response = api.post(
        "/api/v1/patients/",
        json={"user_id": str(owner.id), "first_name": "Ivan", "last_name": "Petrenko"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == LIMIT_CODE
    assert db_session.query(Patient).filter(Patient.user_id == owner.id).count() == 0


def test_another_therapists_limit_is_independent(
    api, login, therapist, other_therapist, db_session
):
    _fill(db_session, therapist, 5)
    newcomer = _patient(db_session)
    login(other_therapist)

    assert _invite(api, newcomer).status_code == 201
    assert _my_plan(api)["active"] == 0


def test_admin_changes_the_plan_and_the_limit_follows(
    api, login, admin, therapist, db_session
):
    _fill(db_session, therapist, 5)
    newcomer = _patient(db_session)
    login(therapist)
    assert _invite(api, newcomer).status_code == 409

    login(admin)
    changed = api.put(f"/api/v1/therapists/{therapist.id}/plan", json={"plan_code": "pro"})
    assert changed.status_code == 200
    assert (changed.json()["plan"], changed.json()["limit"], changed.json()["free"]) == (
        "pro",
        30,
        25,
    )

    login(therapist)
    assert _invite(api, newcomer).status_code == 201


def test_only_an_admin_can_assign_a_plan(api, login, therapist, other_therapist):
    login(therapist)

    response = api.put(
        f"/api/v1/therapists/{other_therapist.id}/plan", json={"plan_code": "pro"}
    )

    assert response.status_code == 403


def test_assigning_an_unknown_plan_or_user_returns_404(api, login, admin, therapist):
    login(admin)

    assert (
        api.put(f"/api/v1/therapists/{therapist.id}/plan", json={"plan_code": "gold"}).status_code
        == 404
    )
    assert (
        api.put(f"/api/v1/therapists/{uuid.uuid4()}/plan", json={"plan_code": "pro"}).status_code
        == 404
    )


def test_buying_a_plan_takes_a_mock_payment_and_applies_it_at_once(
    api, login, therapist, db_session
):
    login(therapist)

    response = api.post("/api/v1/therapists/me/plan/purchase", json={"plan_code": "standard"})

    assert response.status_code == 200
    body = response.json()
    assert body["amount_uah"] == 499
    assert (body["plan"]["plan"], body["plan"]["limit"]) == ("standard", 15)
    payment = db_session.query(PlanPayment).one()
    assert str(payment.id) == body["payment_id"]
    assert (payment.user_id, payment.plan_code, payment.amount_uah) == (
        therapist.id,
        "standard",
        499,
    )
    assert (payment.status, payment.provider) == ("paid", "mock")
    assert payment.provider_reference.startswith("mock-")
    db_session.refresh(therapist)
    assert _my_plan(api)["limit"] == 15


def test_switching_to_the_free_plan_needs_no_payment(api, login, therapist, db_session):
    login(therapist)
    api.post("/api/v1/therapists/me/plan/purchase", json={"plan_code": "pro"})

    response = api.post("/api/v1/therapists/me/plan/purchase", json={"plan_code": "free"})

    assert response.status_code == 200
    assert response.json()["payment_id"] is None
    assert response.json()["plan"]["plan"] == "free"
    assert db_session.query(PlanPayment).count() == 1


def test_buying_the_current_plan_is_a_conflict(api, login, therapist, db_session):
    login(therapist)

    response = api.post("/api/v1/therapists/me/plan/purchase", json={"plan_code": "free"})

    assert response.status_code == 409
    assert db_session.query(PlanPayment).count() == 0


def test_buying_an_unknown_plan_returns_404(api, login, therapist):
    login(therapist)

    response = api.post("/api/v1/therapists/me/plan/purchase", json={"plan_code": "gold"})

    assert response.status_code == 404


def test_patients_cannot_buy_plans(api, login, patient_user):
    login(patient_user)

    response = api.post("/api/v1/therapists/me/plan/purchase", json={"plan_code": "pro"})

    assert response.status_code == 403


def test_a_declined_payment_keeps_the_plan_and_is_recorded(
    api, login, therapist, db_session, monkeypatch
):
    class Declining:
        name = "mock"

        def charge(self, **_kwargs):
            return payments.PaymentResult(paid=False)

    monkeypatch.setattr("app.services.plan.get_payment_provider", lambda: Declining())
    login(therapist)

    response = api.post("/api/v1/therapists/me/plan/purchase", json={"plan_code": "pro"})

    assert response.status_code == 402
    assert _my_plan(api)["plan"] == "free"
    assert db_session.query(PlanPayment).one().status == "failed"


@pytest.mark.parametrize("plan_code", ["standard", "pro"])
def test_bought_plan_raises_the_invitation_limit(api, login, therapist, db_session, plan_code):
    _fill(db_session, therapist, 5)
    newcomer = _patient(db_session)
    login(therapist)
    assert _invite(api, newcomer).status_code == 409

    api.post("/api/v1/therapists/me/plan/purchase", json={"plan_code": plan_code})

    assert _invite(api, newcomer).status_code == 201
