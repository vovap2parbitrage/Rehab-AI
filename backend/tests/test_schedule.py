"""When an assignment is due, and what a patient may do about it today."""

from datetime import UTC, datetime, timedelta

import pytest

from app.core.timezones import app_today
from app.models.assignment import Assignment
from app.models.session import TrainingSession
from app.services.schedule import (
    is_session_day,
    next_session_day,
    planned_session_count,
)

TODAY = app_today()


def plan(starts_on, weekdays, weeks=2) -> Assignment:
    return Assignment(starts_on=starts_on, weekdays=weekdays, duration_weeks=weeks)


def test_a_session_is_due_only_on_the_weekdays_inside_the_dates():
    monday = TODAY - timedelta(days=TODAY.weekday())
    assignment = plan(monday, [0, 2], weeks=1)  # Mon and Wed of one week

    assert is_session_day(assignment, monday)
    assert not is_session_day(assignment, monday + timedelta(days=1))
    assert is_session_day(assignment, monday + timedelta(days=2))
    assert not is_session_day(assignment, monday + timedelta(days=7))  # after the plan
    assert not is_session_day(assignment, monday - timedelta(days=7))  # before the plan


def test_the_planned_count_is_the_number_of_due_days():
    assert planned_session_count(plan(TODAY, [0, 2, 4], weeks=4)) == 12
    assert planned_session_count(plan(TODAY, [0, 1, 2, 3, 4, 5, 6], weeks=2)) == 14


def test_the_next_session_day_skips_today_and_stops_at_the_end():
    monday = TODAY - timedelta(days=TODAY.weekday())
    assignment = plan(monday, [0, 3], weeks=1)  # Mon and Thu

    assert next_session_day(assignment, monday) == monday + timedelta(days=3)
    assert next_session_day(assignment, monday + timedelta(days=3)) is None
    assert next_session_day(assignment, monday - timedelta(days=30)) == monday


@pytest.fixture
def patient(therapist, patient_user, seed_patient):
    return seed_patient(patient_user, therapist)


def test_a_patient_cannot_do_a_session_on_a_day_that_is_not_scheduled(
    api, login, patient_user, patient, seed_assignment
):
    other_day = (TODAY.weekday() + 1) % 7
    assignment = seed_assignment(patient, weekdays=[other_day])
    login(patient_user)

    response = api.post(f"/api/v1/sessions/assignments/{assignment.id}", json={})

    assert response.status_code == 409
    assert "not scheduled for today" in response.json()["detail"]


def test_a_patient_cannot_do_the_session_of_an_assignment_that_has_not_started(
    api, login, patient_user, patient, seed_assignment
):
    assignment = seed_assignment(patient, starts_on=(TODAY + timedelta(days=7)).isoformat())
    login(patient_user)

    assert api.post(f"/api/v1/sessions/assignments/{assignment.id}", json={}).status_code == 409


def test_a_session_can_be_done_only_once_on_a_day(
    api, login, patient_user, patient, seed_assignment
):
    assignment = seed_assignment(patient)
    login(patient_user)

    first = api.post(f"/api/v1/sessions/assignments/{assignment.id}", json={})
    second = api.post(f"/api/v1/sessions/assignments/{assignment.id}", json={})

    assert first.status_code == 201
    assert second.status_code == 409
    assert "already done" in second.json()["detail"]


def test_the_generic_session_endpoint_does_not_let_a_patient_skip_the_schedule(
    api, login, patient_user, patient, seed_assignment
):
    other_day = (TODAY.weekday() + 1) % 7
    assignment = seed_assignment(patient, weekdays=[other_day])
    login(patient_user)

    response = api.post("/api/v1/sessions/", json={"assignment_id": str(assignment.id)})

    assert response.status_code == 409


def test_a_session_done_yesterday_does_not_block_today(
    api, login, patient_user, patient, seed_assignment, db_session
):
    assignment = seed_assignment(patient)
    db_session.add(
        TrainingSession(assignment_id=assignment.id, completed_at=datetime.now(UTC) - timedelta(hours=30))
    )
    db_session.commit()
    login(patient_user)

    assert api.post(f"/api/v1/sessions/assignments/{assignment.id}", json={}).status_code == 201


def test_the_patient_sees_what_is_due_today_and_what_comes_next(
    api, login, patient_user, patient, seed_assignment
):
    due_today = seed_assignment(patient)
    later = seed_assignment(patient, starts_on=(TODAY + timedelta(days=3)).isoformat())
    login(patient_user)

    plans = {item["id"]: item for item in api.get("/api/v1/assignments/mine").json()}

    assert plans[str(due_today.id)]["scheduled_today"] is True
    assert plans[str(due_today.id)]["done_today"] is False
    assert plans[str(due_today.id)]["next_session_on"] == (TODAY + timedelta(days=1)).isoformat()
    assert plans[str(later.id)]["scheduled_today"] is False
    assert plans[str(later.id)]["next_session_on"] == (TODAY + timedelta(days=3)).isoformat()

    api.post(f"/api/v1/sessions/assignments/{due_today.id}", json={})
    plans = {item["id"]: item for item in api.get("/api/v1/assignments/mine").json()}
    assert plans[str(due_today.id)]["done_today"] is True


def test_the_video_analysis_follows_the_same_schedule(
    api, login, patient_user, patient, seed_assignment, db_session
):
    from app.schemas.comparison import ComparisonRequest
    from app.services.comparison_assignment import prepare_comparison

    other_day = (TODAY.weekday() + 1) % 7
    assignment = seed_assignment(patient, weekdays=[other_day])
    request = ComparisonRequest(
        assignment_id=assignment.id,
        patient_key=f"videos/{patient_user.id}/{'b' * 32}.mp4",
    )

    with pytest.raises(Exception) as refused:
        prepare_comparison(db_session, request, patient_user)

    assert getattr(refused.value, "status_code", None) == 409
    assert "not scheduled for today" in refused.value.detail
