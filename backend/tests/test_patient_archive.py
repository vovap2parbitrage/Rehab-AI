import uuid

from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.models.patient import Patient
from app.models.session import TrainingSession


def assignment_payload(patient_id, **overrides) -> dict:
    payload = {
        "patient_id": str(patient_id),
        "exercise_id": str(uuid.uuid4()),
        "duration_weeks": 4,
        "weekdays": [0, 2, 4],
        "repetitions": 10,
        "starts_on": "2026-01-01",
    }
    payload.update(overrides)
    return payload


def _link_co_therapist(db_session, patient, co_therapist):
    db_patient = db_session.get(Patient, patient.id)
    db_patient.therapists.append(co_therapist)
    db_session.commit()


def _archive(api, patient):
    return api.post(f"/api/v1/patients/{patient.id}/archive")


def _restore(api, patient):
    return api.post(f"/api/v1/patients/{patient.id}/restore")


def _ids(response) -> list[str]:
    return [item["id"] for item in response.json()]


def test_archived_patient_leaves_the_active_list_and_can_be_restored(
    api, login, therapist, patient_user, seed_patient
):
    patient = seed_patient(patient_user, therapist)
    login(therapist)

    assert _archive(api, patient).status_code == 204

    assert api.get("/api/v1/patients/").json() == []
    archived = api.get("/api/v1/patients/?archived=true")
    assert _ids(archived) == [str(patient.id)]
    assert archived.json()[0]["archived_at"] is not None

    assert _restore(api, patient).status_code == 204

    assert _ids(api.get("/api/v1/patients/")) == [str(patient.id)]
    assert api.get("/api/v1/patients/?archived=true").json() == []
    assert api.get(f"/api/v1/patients/{patient.id}").json()["archived_at"] is None


def test_archived_patient_stays_readable_with_history(
    api, login, therapist, patient_user, seed_patient, seed_assignment, db_session
):
    patient = seed_patient(patient_user, therapist)
    assignment = seed_assignment(patient)
    login(therapist)
    assert _archive(api, patient).status_code == 204

    record = api.get(f"/api/v1/patients/{patient.id}")
    assert record.status_code == 200
    assert record.json()["archived_at"] is not None
    assert api.get(f"/api/v1/patients/{patient.id}/history").status_code == 200
    assert _ids(api.get(f"/api/v1/assignments/?patient_id={patient.id}")) == [
        str(assignment.id)
    ]
    assert api.get(f"/api/v1/sessions/?patient_id={patient.id}").status_code == 200
    assert api.get("/api/v1/assignments/").json() == []


def test_archived_patient_question_history_stays_readable(
    api, login, db_session, therapist, patient_user, seed_patient, seed_assignment
):
    patient = seed_patient(patient_user, therapist)
    session = TrainingSession(assignment_id=seed_assignment(patient).id, pain_score=5)
    db_session.add(session)
    db_session.commit()
    login(patient_user)
    asked = api.post(
        "/api/v1/help-requests/",
        json={"session_id": str(session.id), "message": "It hurts"},
    )
    assert asked.status_code == 201

    login(therapist)
    assert _archive(api, patient).status_code == 204

    assert api.get("/api/v1/help-requests/needs-attention").json() == []
    history = api.get(f"/api/v1/help-requests/?patient_id={patient.id}")
    assert _ids(history) == [asked.json()["id"]]


def test_archive_cancels_only_this_therapists_active_assignments(
    api, login, therapist, other_therapist, patient_user, seed_patient, seed_assignment,
    db_session,
):
    patient = seed_patient(patient_user, therapist)
    _link_co_therapist(db_session, patient, other_therapist)
    active = seed_assignment(patient)
    completed = seed_assignment(patient, status="completed")
    foreign = seed_assignment(patient, therapist_id=other_therapist.id)
    login(therapist)

    assert _archive(api, patient).status_code == 204

    db_session.expire_all()
    statuses = {
        item.id: item.status
        for item in db_session.query(Assignment).filter(Assignment.patient_id == patient.id)
    }
    assert statuses == {
        active.id: "cancelled",
        completed.id: "completed",
        foreign.id: "active",
    }


def test_archiving_does_not_affect_another_therapists_link(
    api, login, therapist, other_therapist, patient_user, seed_patient, seed_assignment,
    db_session,
):
    patient = seed_patient(patient_user, therapist)
    _link_co_therapist(db_session, patient, other_therapist)
    foreign = seed_assignment(patient, therapist_id=other_therapist.id)
    login(therapist)
    assert _archive(api, patient).status_code == 204

    login(other_therapist)

    assert _ids(api.get("/api/v1/patients/")) == [str(patient.id)]
    assert api.get("/api/v1/patients/?archived=true").json() == []
    assert api.get(f"/api/v1/patients/{patient.id}").json()["archived_at"] is None
    assert _ids(api.get("/api/v1/assignments/")) == [str(foreign.id)]
    created = api.post("/api/v1/assignments/", json=assignment_payload(patient.id))
    assert created.status_code != 409


def test_archive_and_restore_are_idempotent(
    api, login, therapist, patient_user, seed_patient
):
    patient = seed_patient(patient_user, therapist)
    login(therapist)

    assert _restore(api, patient).status_code == 204
    assert _archive(api, patient).status_code == 204
    first = api.get(f"/api/v1/patients/{patient.id}").json()["archived_at"]
    assert _archive(api, patient).status_code == 204
    assert api.get(f"/api/v1/patients/{patient.id}").json()["archived_at"] == first


def test_therapist_cannot_archive_or_restore_a_foreign_patient(
    api, login, therapist, other_therapist, patient_user, seed_patient
):
    foreign = seed_patient(patient_user, other_therapist)
    login(therapist)

    assert _archive(api, foreign).status_code == 403
    assert _restore(api, foreign).status_code == 403


def test_archive_unknown_patient_returns_404(api, login, therapist):
    login(therapist)

    assert api.post(f"/api/v1/patients/{uuid.uuid4()}/archive").status_code == 404


def test_patient_and_admin_cannot_archive(
    api, login, admin, therapist, patient_user, seed_patient
):
    patient = seed_patient(patient_user, therapist)

    login(patient_user)
    assert _archive(api, patient).status_code == 403
    login(admin)
    assert _archive(api, patient).status_code == 403


def test_old_delete_endpoint_is_gone(api, login, therapist, patient_user, seed_patient):
    patient = seed_patient(patient_user, therapist)
    login(therapist)

    assert api.delete(f"/api/v1/patients/{patient.id}").status_code == 405


def test_cannot_assign_to_an_archived_patient_until_restored(
    api, login, therapist, patient_user, seed_patient, db_session
):
    patient = seed_patient(patient_user, therapist)
    exercise = Exercise(name="Test exercise", created_by=therapist.id)
    db_session.add(exercise)
    db_session.commit()
    payload = assignment_payload(patient.id, exercise_id=str(exercise.id))
    login(therapist)
    assert _archive(api, patient).status_code == 204

    blocked = api.post("/api/v1/assignments/", json=payload)

    assert blocked.status_code == 409
    assert _restore(api, patient).status_code == 204
    assert api.post("/api/v1/assignments/", json=payload).status_code == 201
