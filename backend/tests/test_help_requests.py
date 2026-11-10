import uuid

from app.models.session import TrainingSession


def _completed_session(db_session, assignment, pain_score=6) -> TrainingSession:
    session = TrainingSession(assignment_id=assignment.id, pain_score=pain_score)
    db_session.add(session)
    db_session.commit()
    return session


def _ask(api, session, message="My knee hurts after the exercise"):
    return api.post(
        "/api/v1/help-requests/",
        json={"session_id": str(session.id), "message": message},
    )


def test_patient_asks_for_help_after_session(
    api, login, db_session, therapist, patient_user, seed_patient, seed_assignment
):
    patient = seed_patient(patient_user, therapist)
    session = _completed_session(db_session, seed_assignment(patient))
    login(patient_user)

    response = _ask(api, session, "  My knee hurts after the exercise  ")

    assert response.status_code == 201
    body = response.json()
    assert body["session_id"] == str(session.id)
    assert body["patient_id"] == str(patient.id)
    assert body["patient_name"] == "Ivan Petrenko"
    assert body["exercise_name"] == "Test exercise"
    assert body["pain_score"] == 6
    assert body["message"] == "My knee hurts after the exercise"
    assert body["assignment_id"] == str(session.assignment_id)
    assert body["reply"] is None


def test_message_is_required_and_bounded(
    api, login, db_session, therapist, patient_user, seed_patient, seed_assignment
):
    session = _completed_session(
        db_session, seed_assignment(seed_patient(patient_user, therapist))
    )
    login(patient_user)

    assert _ask(api, session, "   ").status_code == 422
    assert _ask(api, session, "x" * 2001).status_code == 422


def test_patient_cannot_ask_about_foreign_or_unknown_session(
    api, login, db_session, therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment,
):
    seed_patient(patient_user, therapist)
    foreign = _completed_session(
        db_session, seed_assignment(seed_patient(other_patient_user, therapist))
    )
    login(patient_user)

    assert _ask(api, foreign).status_code == 404
    unknown = api.post(
        "/api/v1/help-requests/",
        json={"session_id": str(uuid.uuid4()), "message": "Help"},
    )
    assert unknown.status_code == 404


def test_therapist_cannot_create_help_request(
    api, login, db_session, therapist, patient_user, seed_patient, seed_assignment
):
    session = _completed_session(
        db_session, seed_assignment(seed_patient(patient_user, therapist))
    )
    login(therapist)

    assert _ask(api, session).status_code == 403


def test_needs_attention_shows_only_own_patients_unanswered_requests(
    api, login, db_session, therapist, other_therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment,
):
    own = _completed_session(db_session, seed_assignment(seed_patient(patient_user, therapist)))
    foreign = _completed_session(
        db_session, seed_assignment(seed_patient(other_patient_user, other_therapist))
    )
    login(patient_user)
    own_request = _ask(api, own).json()
    login(other_patient_user)
    _ask(api, foreign)

    login(therapist)
    response = api.get("/api/v1/help-requests/needs-attention")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [own_request["id"]]


def test_reply_removes_request_from_needs_attention_and_patient_sees_it(
    api, login, db_session, therapist, patient_user, seed_patient, seed_assignment
):
    session = _completed_session(
        db_session, seed_assignment(seed_patient(patient_user, therapist))
    )
    login(patient_user)
    request_id = _ask(api, session).json()["id"]

    login(therapist)
    reply = api.patch(
        f"/api/v1/help-requests/{request_id}/reply",
        json={"reply": "Reduce the repetitions to 5 and put ice on the knee."},
    )
    assert reply.status_code == 200
    assert reply.json()["reply"] == "Reduce the repetitions to 5 and put ice on the knee."
    assert reply.json()["replied_at"]
    assert reply.json()["replied_by_email"] == therapist.email
    assert api.get("/api/v1/help-requests/needs-attention").json() == []

    again = api.patch(f"/api/v1/help-requests/{request_id}/reply", json={"reply": "Again"})
    assert again.status_code == 409

    login(patient_user)
    mine = api.get("/api/v1/help-requests/mine").json()
    assert [item["reply"] for item in mine] == [
        "Reduce the repetitions to 5 and put ice on the knee."
    ]


def test_other_therapist_cannot_reply(
    api, login, db_session, therapist, other_therapist, patient_user,
    seed_patient, seed_assignment,
):
    session = _completed_session(
        db_session, seed_assignment(seed_patient(patient_user, therapist))
    )
    login(patient_user)
    request_id = _ask(api, session).json()["id"]

    login(other_therapist)
    response = api.patch(f"/api/v1/help-requests/{request_id}/reply", json={"reply": "Hi"})

    assert response.status_code == 403
    unknown = api.patch(f"/api/v1/help-requests/{uuid.uuid4()}/reply", json={"reply": "Hi"})
    assert unknown.status_code == 404


def test_patient_sees_only_own_requests(
    api, login, db_session, therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment,
):
    own = _completed_session(db_session, seed_assignment(seed_patient(patient_user, therapist)))
    foreign = _completed_session(
        db_session, seed_assignment(seed_patient(other_patient_user, therapist))
    )
    login(other_patient_user)
    _ask(api, foreign)
    login(patient_user)
    own_request = _ask(api, own).json()

    response = api.get("/api/v1/help-requests/mine")

    assert [item["id"] for item in response.json()] == [own_request["id"]]


def _add_co_therapist(db_session, patient, co_therapist):
    from app.models.patient import Patient

    db_patient = db_session.get(Patient, patient.id)
    db_patient.therapists.append(co_therapist)
    db_session.commit()


def test_question_goes_only_to_the_therapist_who_assigned_the_exercise(
    api, login, db_session, therapist, other_therapist, patient_user,
    seed_patient, seed_assignment,
):
    patient = seed_patient(patient_user, therapist)
    _add_co_therapist(db_session, patient, other_therapist)
    session = _completed_session(db_session, seed_assignment(patient))
    login(patient_user)
    request_id = _ask(api, session).json()["id"]

    login(other_therapist)
    assert api.get("/api/v1/help-requests/needs-attention").json() == []
    assert api.get(f"/api/v1/help-requests/?patient_id={patient.id}").json() == []
    forbidden = api.patch(f"/api/v1/help-requests/{request_id}/reply", json={"reply": "Hi"})
    assert forbidden.status_code == 403

    login(therapist)
    assert [item["id"] for item in api.get("/api/v1/help-requests/needs-attention").json()] == [
        request_id
    ]


def test_patient_history_keeps_answered_questions_newest_first(
    api, login, db_session, therapist, patient_user, other_patient_user,
    seed_patient, seed_assignment,
):
    patient = seed_patient(patient_user, therapist)
    assignment = seed_assignment(patient)
    first = _completed_session(db_session, assignment)
    second = _completed_session(db_session, assignment)
    seed_patient(other_patient_user, therapist)
    login(patient_user)
    first_id = _ask(api, first, "First question").json()["id"]
    second_id = _ask(api, second, "Second question").json()["id"]

    login(therapist)
    api.patch(f"/api/v1/help-requests/{first_id}/reply", json={"reply": "Answer"})
    history = api.get(f"/api/v1/help-requests/?patient_id={patient.id}").json()

    assert [item["id"] for item in history] == [second_id, first_id]
    assert history[1]["reply"] == "Answer"


def test_patient_history_checks_access(
    api, login, therapist, other_therapist, patient_user, seed_patient
):
    patient = seed_patient(patient_user, therapist)

    login(other_therapist)
    assert api.get(f"/api/v1/help-requests/?patient_id={patient.id}").status_code == 403

    login(patient_user)
    assert api.get(f"/api/v1/help-requests/?patient_id={patient.id}").status_code == 403
