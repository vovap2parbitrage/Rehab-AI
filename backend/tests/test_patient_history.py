import uuid
from datetime import UTC, date, datetime

import pytest

from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.models.session import TrainingSession
from app.schemas.history import HistoryPeriod
from app.services.history import build_patient_history

TODAY = date(2026, 3, 18)


@pytest.fixture
def add_assignment(db_session):
    def _add(patient, starts_on, duration_weeks=52, weekdays=None, name="Squat"):
        exercise = Exercise(name=name, created_by=patient.therapist_ids[0])
        db_session.add(exercise)
        db_session.flush()
        assignment = Assignment(
            patient_id=patient.id,
            exercise_id=exercise.id,
            repetitions=10,
            duration_weeks=duration_weeks,
            weekdays=weekdays or [0, 1, 2],
            starts_on=starts_on,
        )
        db_session.add(assignment)
        db_session.commit()
        return assignment

    return _add


@pytest.fixture
def add_session(db_session):
    def _add(assignment, completed_at, pain_score=None, score=None):
        session = TrainingSession(
            assignment_id=assignment.id,
            completed_at=completed_at,
            pain_score=pain_score,
            score=score,
        )
        db_session.add(session)
        db_session.commit()
        return session

    return _add


def at(month: int, day: int, hour: int = 10) -> datetime:
    return datetime(2026, month, day, hour, tzinfo=UTC)


@pytest.fixture
def history_data(therapist, patient_user, seed_patient, add_assignment, add_session):
    patient = seed_patient(patient_user, therapist)
    main = add_assignment(patient, date(2026, 1, 1))
    short = add_assignment(
        patient, date(2026, 3, 2), duration_weeks=1, weekdays=[0, 1], name="Bridge"
    )

    add_session(main, at(2, 10), pain_score=9)
    add_session(main, None, pain_score=7)
    add_session(main, at(2, 17), pain_score=6)
    add_session(main, at(2, 18), pain_score=5)
    add_session(short, at(3, 3), pain_score=4, score=7)
    add_session(main, at(3, 4), pain_score=3, score=8)
    add_session(main, at(3, 5))
    add_session(main, at(3, 16), pain_score=2)
    add_session(main, at(3, 17), pain_score=2)
    add_session(main, at(3, 17, 18))
    add_session(main, at(3, 18, 9), pain_score=1)
    return patient, main, short


def test_history_for_last_30_days(db_session, history_data):
    patient, _main, short = history_data

    result = build_patient_history(db_session, patient.id, HistoryPeriod.last_30_days, TODAY)

    assert result.date_from == date(2026, 2, 16)
    assert result.date_to == TODAY
    assert [(week.week_start, week.completed, week.planned) for week in result.adherence_weeks] == [
        (date(2026, 2, 16), 2, 3),
        (date(2026, 2, 23), 0, 3),
        (date(2026, 3, 2), 3, 5),
        (date(2026, 3, 9), 0, 3),
        (date(2026, 3, 16), 4, 3),
    ]
    assert result.kpis.total_sessions == 9
    assert result.kpis.planned_sessions == 17
    assert result.kpis.adherence_pct == 47.1
    assert result.kpis.avg_pain == 3.3
    assert result.kpis.pain_trend == -3.3
    assert result.kpis.avg_score == 7.5
    assert result.kpis.last_session_at == at(3, 18, 9)
    assert [point.value for point in result.pain_series] == [6, 5, 4, 3, 2, 2, 1]
    assert [point.value for point in result.score_series] == [7, 8]
    assert result.score_series[0].assignment_id == short.id
    assert result.score_series[0].exercise_name == "Bridge"


def test_history_for_all_time_starts_with_first_assignment_week(db_session, history_data):
    patient, _main, _short = history_data

    result = build_patient_history(db_session, patient.id, HistoryPeriod.all_time, TODAY)

    assert result.date_from == date(2025, 12, 29)
    assert result.adherence_weeks[0].planned == 0
    assert result.kpis.total_sessions == 10
    assert result.pain_series[0].value == 9


def test_empty_history(db_session, therapist, patient_user, seed_patient):
    patient = seed_patient(patient_user, therapist)

    result = build_patient_history(db_session, patient.id, HistoryPeriod.last_30_days, TODAY)

    assert result.kpis.total_sessions == 0
    assert result.kpis.planned_sessions == 0
    assert result.kpis.adherence_pct is None
    assert result.kpis.avg_pain is None
    assert result.kpis.pain_trend is None
    assert result.kpis.avg_score is None
    assert result.kpis.last_session_at is None
    assert result.pain_series == []
    assert result.score_series == []
    assert all(week.planned == 0 for week in result.adherence_weeks)


def test_patient_reads_own_history(api, login, patient_user, history_data):
    patient, _main, _short = history_data
    login(patient_user)

    response = api.get("/api/v1/patients/me/history", params={"period": "all"})

    assert response.status_code == 200
    body = response.json()
    assert body["patient_id"] == str(patient.id)
    assert body["period"] == "all"
    assert body["kpis"]["total_sessions"] == 10


def test_my_history_defaults_to_30_days(api, login, therapist, patient_user, seed_patient):
    seed_patient(patient_user, therapist)
    login(patient_user)

    response = api.get("/api/v1/patients/me/history")

    assert response.status_code == 200
    assert response.json()["period"] == "30d"


def test_my_history_without_profile_returns_404(api, login, patient_user):
    login(patient_user)

    response = api.get("/api/v1/patients/me/history")

    assert response.status_code == 404


def test_therapist_cannot_use_my_history(api, login, therapist):
    login(therapist)

    response = api.get("/api/v1/patients/me/history")

    assert response.status_code == 403


def test_invalid_period_is_rejected(api, login, therapist, patient_user, seed_patient):
    patient = seed_patient(patient_user, therapist)
    login(therapist)

    response = api.get(f"/api/v1/patients/{patient.id}/history", params={"period": "7d"})

    assert response.status_code == 422


def test_assigned_therapist_reads_patient_history(api, login, therapist, history_data):
    patient, _main, _short = history_data
    login(therapist)

    response = api.get(f"/api/v1/patients/{patient.id}/history", params={"period": "90d"})

    assert response.status_code == 200
    assert response.json()["period"] == "90d"


def test_patient_reads_own_history_by_id(api, login, patient_user, history_data):
    patient, _main, _short = history_data
    login(patient_user)

    response = api.get(f"/api/v1/patients/{patient.id}/history")

    assert response.status_code == 200


def test_admin_reads_patient_history(api, login, admin, history_data):
    patient, _main, _short = history_data
    login(admin)

    response = api.get(f"/api/v1/patients/{patient.id}/history")

    assert response.status_code == 200


def test_other_therapist_cannot_read_history(api, login, other_therapist, history_data):
    patient, _main, _short = history_data
    login(other_therapist)

    response = api.get(f"/api/v1/patients/{patient.id}/history")

    assert response.status_code == 403


def test_other_patient_cannot_read_history(
    api, login, therapist, other_patient_user, seed_patient, history_data
):
    patient, _main, _short = history_data
    seed_patient(other_patient_user, therapist)
    login(other_patient_user)

    response = api.get(f"/api/v1/patients/{patient.id}/history")

    assert response.status_code == 403


def test_unknown_patient_history_returns_404(api, login, therapist):
    login(therapist)

    response = api.get(f"/api/v1/patients/{uuid.uuid4()}/history")

    assert response.status_code == 404
