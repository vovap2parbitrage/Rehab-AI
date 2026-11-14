from datetime import UTC, date, datetime, time, timedelta
from statistics import mean
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.assignment import Assignment
from app.models.patient import Patient
from app.models.session import TrainingSession
from app.models.user import User
from app.schemas.history import (
    AdherenceWeek,
    HistoryKpis,
    HistoryPeriod,
    HistoryPoint,
    PatientHistoryRead,
)
from app.services.patient_access import require_patient_access

PERIOD_DAYS = {
    HistoryPeriod.last_30_days: 30,
    HistoryPeriod.last_90_days: 90,
}


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _start_of_day(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=UTC)


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


def _period_start(
    period: HistoryPeriod,
    today: date,
    assignments: list[Assignment],
    first_session_at: datetime | None,
) -> date:
    days = PERIOD_DAYS.get(period)
    if days is not None:
        start = today - timedelta(days=days - 1)
    else:
        candidates = [item.starts_on for item in assignments]
        if first_session_at is not None:
            candidates.append(first_session_at.astimezone(UTC).date())
        start = min(candidates, default=today)
    # Whole weeks keep the weekly plan comparable with completed sessions.
    return _week_start(min(start, today))


def _planned_for_week(assignments: list[Assignment], week_start: date) -> int:
    week_end = week_start + timedelta(days=6)
    planned = 0
    for item in assignments:
        assignment_end = item.starts_on + timedelta(days=item.duration_weeks * 7 - 1)
        first_day = max(item.starts_on, week_start)
        last_day = min(assignment_end, week_end)
        if first_day > last_day:
            continue
        planned += sum(
            (first_day + timedelta(days=offset)).weekday() in item.weekdays
            for offset in range((last_day - first_day).days + 1)
        )
    return planned


def _adherence_weeks(
    assignments: list[Assignment],
    sessions: list[TrainingSession],
    date_from: date,
    date_to: date,
) -> list[AdherenceWeek]:
    completed: dict[date, int] = {}
    for item in sessions:
        week = _week_start(item.completed_at.astimezone(UTC).date())
        completed[week] = completed.get(week, 0) + 1

    weeks = []
    week = date_from
    while week <= date_to:
        weeks.append(
            AdherenceWeek(
                week_start=week,
                completed=completed.get(week, 0),
                planned=_planned_for_week(assignments, week),
            )
        )
        week += timedelta(days=7)
    return weeks


def _adherence_pct(weeks: list[AdherenceWeek]) -> float | None:
    planned = sum(week.planned for week in weeks)
    if planned == 0:
        return None
    done = sum(min(week.completed, week.planned) for week in weeks)
    return round(100 * done / planned, 1)


def _pain_trend(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    middle = len(values) // 2
    return _round(mean(values[len(values) - middle:]) - mean(values[:middle]))


def _series(
    sessions: list[TrainingSession],
    names: dict[UUID, str],
    field: str,
) -> list[HistoryPoint]:
    return [
        HistoryPoint(
            session_id=item.id,
            completed_at=item.completed_at,
            value=getattr(item, field),
            assignment_id=item.assignment_id,
            exercise_name=names[item.assignment_id],
        )
        for item in sessions
        if getattr(item, field) is not None
    ]


def build_patient_history(
    db: Session,
    patient_id: UUID,
    period: HistoryPeriod,
    today: date | None = None,
) -> PatientHistoryRead:
    today = today or datetime.now(UTC).date()
    assignments = (
        db.query(Assignment)
        .options(joinedload(Assignment.exercise))
        .filter(Assignment.patient_id == patient_id)
        .all()
    )
    names = {item.id: item.exercise.name for item in assignments}

    completed_sessions = (
        db.query(TrainingSession)
        .join(TrainingSession.assignment)
        .filter(
            Assignment.patient_id == patient_id,
            TrainingSession.completed_at.is_not(None),
        )
    )
    first_session_at, last_session_at = completed_sessions.with_entities(
        func.min(TrainingSession.completed_at),
        func.max(TrainingSession.completed_at),
    ).one()

    date_from = _period_start(period, today, assignments, first_session_at)
    date_to = _week_start(today)
    sessions = (
        completed_sessions.filter(
            TrainingSession.completed_at >= _start_of_day(date_from),
            TrainingSession.completed_at < _start_of_day(today + timedelta(days=1)),
        )
        .order_by(TrainingSession.completed_at)
        .all()
    )

    weeks = _adherence_weeks(assignments, sessions, date_from, date_to)
    pain_series = _series(sessions, names, "pain_score")
    score_series = _series(sessions, names, "score")
    pain_values = [point.value for point in pain_series]
    score_values = [point.value for point in score_series]

    return PatientHistoryRead(
        patient_id=patient_id,
        period=period,
        date_from=date_from,
        date_to=today,
        kpis=HistoryKpis(
            total_sessions=len(sessions),
            planned_sessions=sum(week.planned for week in weeks),
            adherence_pct=_adherence_pct(weeks),
            avg_pain=_round(mean(pain_values)) if pain_values else None,
            pain_trend=_pain_trend(pain_values),
            avg_score=_round(mean(score_values)) if score_values else None,
            last_session_at=last_session_at,
        ),
        pain_series=pain_series,
        score_series=score_series,
        adherence_weeks=weeks,
    )


def get_patient_history(
    db: Session,
    patient_id: UUID,
    user: User,
    roles: set[str],
    period: HistoryPeriod,
) -> PatientHistoryRead:
    require_patient_access(patient_id, user, roles, db)
    return build_patient_history(db, patient_id, period)


def get_my_history(db: Session, user: User, period: HistoryPeriod) -> PatientHistoryRead:
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found",
        )
    return build_patient_history(db, patient.id, period)
