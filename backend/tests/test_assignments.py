import uuid
from datetime import date, timedelta

import pytest

from app.core.timezones import app_today
from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.models.session import TrainingSession
from app.schemas.assignment import AssignmentRead


def first_session_day(weekdays) -> date:
    """The first day from today on that is a plan weekday."""
    day = app_today()
    while day.weekday() not in weekdays:
        day += timedelta(days=1)
    return day


def assignment_payload(patient_id, **overrides) -> dict:
    weekdays = overrides.get("weekdays", [0, 2, 4])
    payload = {
        "patient_id": str(patient_id),
        "exercise_id": str(uuid.uuid4()),
        "duration_weeks": 4,
        "weekdays": weekdays,
        "repetitions": 10,
        "starts_on": first_session_day(weekdays).isoformat(),
    }
    payload.update(overrides)
    return payload


def test_therapist_assigns_exercise_to_own_patient(
    api, login, therapist, patient_user, seed_patient, db_session
):
    patient = seed_patient(patient_user, therapist)
    exercise = Exercise(name="Test exercise", created_by=therapist.id)
    db_session.add(exercise)
    db_session.commit()
    login(therapist)

    response = api.post(
        "/api/v1/assignments/",
        json=assignment_payload(patient.id, exercise_id=str(exercise.id)),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["patient_id"] == str(patient.id)
    assert body["status"] == "active"
    assert body["duration_weeks"] == 4
    assert body["weekdays"] == [0, 2, 4]
    assert body["therapist_id"] == str(therapist.id)


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


def test_patient_list_marks_expired_assignment_completed(
    api, login, therapist, patient_user, seed_patient, seed_assignment, db_session
):
    patient = seed_patient(patient_user, therapist)
    assignment = seed_assignment(patient)
    db_assignment = db_session.get(Assignment, assignment.id)
    db_assignment.starts_on = date(2000, 1, 1)
    db_session.commit()
    login(patient_user)

    response = api.get("/api/v1/assignments/mine")

    assert response.status_code == 200
    assert response.json()[0]["id"] == str(assignment.id)
    assert response.json()[0]["status"] == "completed"


def test_assignment_becomes_completed_after_all_planned_sessions(
    api, login, therapist, patient_user, seed_patient, seed_assignment, db_session
):
    patient = seed_patient(patient_user, therapist)
    assignment = seed_assignment(
        patient,
        duration_weeks=1,
        weekdays=[date.today().weekday()],
        starts_on=date.today().isoformat(),
    )
    db_assignment = db_session.get(Assignment, assignment.id)
    db_session.add(
        TrainingSession(
            assignment_id=db_assignment.id,
            completed_at=date.today(),
        )
    )
    db_session.commit()
    login(patient_user)

    response = api.get("/api/v1/assignments/mine")

    assert response.status_code == 200
    assert response.json()[0]["status"] == "completed"


def test_completed_assignment_cannot_be_canceled(
    api, login, therapist, patient_user, seed_patient, seed_assignment, db_session
):
    patient = seed_patient(patient_user, therapist)
    assignment = seed_assignment(patient)
    db_assignment = db_session.get(Assignment, assignment.id)
    db_assignment.status = "completed"
    db_session.commit()
    login(therapist)

    response = api.post(f"/api/v1/assignments/{assignment.id}/cancel")

    assert response.status_code == 403
    assert response.json()["detail"] == "You can cancel only active assignments"


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


def test_cancelled_assignment_is_hidden_from_the_patient_but_not_the_therapist(
    api, login, therapist, patient_user, seed_patient, seed_assignment
):
    patient = seed_patient(patient_user, therapist)
    assignment = seed_assignment(patient)
    login(therapist)
    assert api.post(f"/api/v1/assignments/{assignment.id}/cancel").status_code == 204

    login(patient_user)
    assert api.get("/api/v1/assignments/mine").json() == []
    assert api.get("/api/v1/assignments/").json() == []

    login(therapist)
    listed = api.get(f"/api/v1/assignments/?patient_id={patient.id}").json()
    assert [(item["id"], item["status"]) for item in listed] == [
        (str(assignment.id), "cancelled")
    ]


def test_therapist_edits_an_active_assignment(
    api, login, therapist, patient_user, seed_patient, seed_assignment
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    login(therapist)

    response = api.patch(
        f"/api/v1/assignments/{assignment.id}",
        json={"repetitions": 20, "weekdays": [4, 1]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["repetitions"] == 20
    assert body["weekdays"] == [1, 4]  # sorted by the validator
    assert body["starts_on"] == str(assignment.starts_on)  # the start date never changes
    assert body["duration_weeks"] == assignment.duration_weeks  # not sent, so unchanged


def test_other_therapist_cannot_edit_the_assignment(
    api, login, therapist, other_therapist, patient_user, seed_patient, seed_assignment
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    login(other_therapist)

    response = api.patch(f"/api/v1/assignments/{assignment.id}", json={"repetitions": 20})

    assert response.status_code == 403


def test_only_active_assignments_can_be_edited(
    api, login, therapist, patient_user, seed_patient, seed_assignment, db_session
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    db_assignment = db_session.get(Assignment, assignment.id)
    db_assignment.status = "completed"
    db_session.commit()
    login(therapist)

    response = api.patch(f"/api/v1/assignments/{assignment.id}", json={"repetitions": 20})

    assert response.status_code == 409


@pytest.mark.parametrize(
    "body",
    [{}, {"repetitions": 0}, {"weekdays": [1, 1]}, {"weekdays": [7]}, {"duration_weeks": 0}],
)
def test_invalid_assignment_edit_is_rejected(
    api, login, therapist, patient_user, seed_patient, seed_assignment, body
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    login(therapist)

    assert api.patch(f"/api/v1/assignments/{assignment.id}", json=body).status_code == 422


def test_patient_cannot_edit_an_assignment(
    api, login, therapist, patient_user, seed_patient, seed_assignment
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    login(patient_user)

    assert api.patch(f"/api/v1/assignments/{assignment.id}", json={"repetitions": 20}).status_code == 403


def test_the_start_date_of_an_assignment_cannot_be_changed(
    api, login, therapist, patient_user, seed_patient, seed_assignment
):
    assignment = seed_assignment(seed_patient(patient_user, therapist))
    login(therapist)

    response = api.patch(
        f"/api/v1/assignments/{assignment.id}",
        json={"repetitions": 20, "starts_on": "2030-01-01"},
    )

    assert response.status_code == 422
    unchanged = api.get(f"/api/v1/assignments/{assignment.id}").json()
    assert unchanged["repetitions"] == assignment.repetitions
    assert unchanged["starts_on"] == str(assignment.starts_on)


def _create(api, therapist, patient_user, seed_patient, login, **overrides):
    patient = seed_patient(patient_user, therapist)
    login(therapist)
    return api.post(
        "/api/v1/assignments/", json=assignment_payload(patient.id, **overrides)
    )


def test_an_assignment_cannot_start_in_the_past(
    api, login, therapist, patient_user, seed_patient, db_session
):
    exercise = Exercise(name="Squat", created_by=therapist.id)
    db_session.add(exercise)
    db_session.commit()
    yesterday = (app_today() - timedelta(days=1)).isoformat()

    response = _create(
        api, therapist, patient_user, seed_patient, login,
        exercise_id=str(exercise.id),
        weekdays=[0, 1, 2, 3, 4, 5, 6],
        starts_on=yesterday,
    )

    assert response.status_code == 422
    assert "before today" in response.json()["detail"]


def test_an_assignment_can_start_today(
    api, login, therapist, patient_user, seed_patient, db_session
):
    exercise = Exercise(name="Squat", created_by=therapist.id)
    db_session.add(exercise)
    db_session.commit()
    today = app_today()

    response = _create(
        api, therapist, patient_user, seed_patient, login,
        exercise_id=str(exercise.id),
        weekdays=[today.weekday()],
        starts_on=today.isoformat(),
    )

    assert response.status_code == 201


def test_the_start_date_must_be_a_weekday_of_the_plan(
    api, login, therapist, patient_user, seed_patient, db_session
):
    exercise = Exercise(name="Squat", created_by=therapist.id)
    db_session.add(exercise)
    db_session.commit()
    start = first_session_day([0, 1, 2, 3, 4, 5, 6])
    other_day = (start.weekday() + 1) % 7

    response = _create(
        api, therapist, patient_user, seed_patient, login,
        exercise_id=str(exercise.id),
        weekdays=[other_day],
        starts_on=start.isoformat(),
    )

    assert response.status_code == 422
    assert "weekdays of the plan" in response.json()["detail"]
