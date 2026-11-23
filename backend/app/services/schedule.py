"""When an assignment has to be done: the one place that knows its weekly schedule."""

from datetime import date, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.timezones import app_today, day_bounds
from app.models.assignment import Assignment
from app.models.session import TrainingSession


def last_day(assignment: Assignment) -> date:
    return assignment.starts_on + timedelta(days=assignment.duration_weeks * 7 - 1)


def is_session_day(assignment: Assignment, day: date) -> bool:
    """True if the plan asks for a session on this day (within its dates and weekdays)."""
    return (
        assignment.starts_on <= day <= last_day(assignment)
        and day.weekday() in assignment.weekdays
    )


def planned_session_count(assignment: Assignment) -> int:
    return sum(
        is_session_day(assignment, assignment.starts_on + timedelta(days=offset))
        for offset in range(assignment.duration_weeks * 7)
    )


def next_session_day(assignment: Assignment, after: date) -> date | None:
    """The first session day later than ``after``, or None when the plan has none left."""
    day = max(after + timedelta(days=1), assignment.starts_on)
    while day <= last_day(assignment):
        if is_session_day(assignment, day):
            return day
        day += timedelta(days=1)
    return None


def assignments_done_on(db: Session, assignment_ids: list[UUID], day: date) -> set[UUID]:
    """Which of the assignments have a completed session on this (local) day."""
    if not assignment_ids:
        return set()
    start, end = day_bounds(day)
    rows = (
        db.query(TrainingSession.assignment_id)
        .filter(
            TrainingSession.assignment_id.in_(assignment_ids),
            TrainingSession.completed_at >= start,
            TrainingSession.completed_at < end,
        )
        .distinct()
    )
    return {row[0] for row in rows}


def require_session_today(db: Session, assignment: Assignment) -> None:
    """A patient may only do an assignment on a day it is scheduled, once that day."""
    today = app_today()
    if not is_session_day(assignment, today):
        raise HTTPException(status_code=409, detail="The assignment is not scheduled for today")
    if assignment.id in assignments_done_on(db, [assignment.id], today):
        raise HTTPException(status_code=409, detail="Today's session is already done")
