"""The therapist's "Today" page: who has done what is due, and who has not."""

from collections import defaultdict
from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.statuses import AssignmentStatus
from app.core.timezones import APP_TIMEZONE, app_today, day_bounds
from app.models.assignment import Assignment
from app.models.patient import Patient
from app.models.session import TrainingSession
from app.models.user import User
from app.schemas.today import TodayCounters, TodayItem, TodayPatient, TodayRead
from app.services.help_request import list_needs_attention
from app.services.message import count_unseen_replies
from app.services.patient_access import treated_by
from app.services.schedule import assignments_done_on, is_session_day


def _patient_name(patient: Patient) -> str:
    return " ".join(name for name in (patient.user.first_name, patient.user.last_name) if name)


def _group(assignments: list[Assignment], done: set) -> dict:
    """Items per patient, ordered by exercise name."""
    grouped: dict = defaultdict(list)
    for item in assignments:
        grouped[item.patient_id].append(
            TodayItem(
                assignment_id=item.id,
                exercise_name=item.exercise.name,
                done=item.id in done,
            )
        )
    for entries in grouped.values():
        entries.sort(key=lambda entry: entry.exercise_name)
    return grouped


def get_today(db: Session, user: User) -> TodayRead:
    today = app_today()
    yesterday = today - timedelta(days=1)

    assignments = (
        db.query(Assignment)
        .join(Assignment.patient)
        .options(
            joinedload(Assignment.exercise),
            joinedload(Assignment.patient).joinedload(Patient.user),
        )
        .filter(
            Assignment.therapist_id == user.id,
            Assignment.status.in_(
                [AssignmentStatus.ACTIVE.value, AssignmentStatus.COMPLETED.value]
            ),
            treated_by(user.id),
        )
        .order_by(Assignment.starts_on)
        .all()
    )
    patients = {item.patient_id: item.patient for item in assignments}

    due_today = [
        item
        for item in assignments
        if item.status == AssignmentStatus.ACTIVE.value and is_session_day(item, today)
    ]
    due_yesterday = [item for item in assignments if is_session_day(item, yesterday)]
    done_today = assignments_done_on(db, [item.id for item in due_today], today)
    done_yesterday = assignments_done_on(db, [item.id for item in due_yesterday], yesterday)

    # When each patient last finished something today.
    start, end = day_bounds(today)
    last_completed = dict(
        db.query(TrainingSession.assignment_id, func.max(TrainingSession.completed_at))
        .filter(
            TrainingSession.assignment_id.in_([item.id for item in due_today]),
            TrainingSession.completed_at >= start,
            TrainingSession.completed_at < end,
        )
        .group_by(TrainingSession.assignment_id)
        .all()
    )

    def build(items: dict, with_time: bool = False) -> list[TodayPatient]:
        rows = []
        for patient_id, entries in items.items():
            times = [
                last_completed[a.id]
                for a in due_today
                if a.patient_id == patient_id and a.id in last_completed
            ]
            rows.append(
                TodayPatient(
                    patient_id=patient_id,
                    patient_name=_patient_name(patients[patient_id]),
                    items=entries,
                    last_completed_at=max(times) if with_time and times else None,
                )
            )
        return sorted(rows, key=lambda row: row.patient_name)

    today_items = _group(due_today, done_today)
    unfinished = {pid: v for pid, v in today_items.items() if not all(i.done for i in v)}
    finished = {pid: v for pid, v in today_items.items() if all(i.done for i in v)}
    missed = _group([item for item in due_yesterday if item.id not in done_yesterday], set())

    active_patients = (
        db.query(func.count(Patient.id)).filter(treated_by(user.id)).scalar() or 0
    )
    not_finished_rows = build(unfinished)
    finished_rows = build(finished, with_time=True)
    missed_rows = build(missed)
    return TodayRead(
        date=today,
        timezone=APP_TIMEZONE.key,
        counters=TodayCounters(
            active_patients=active_patients,
            due_today=len(today_items),
            finished=len(finished_rows),
            not_finished=len(not_finished_rows),
            missed_yesterday=len(missed_rows),
            open_questions=len(list_needs_attention(db, user)),
            new_replies=count_unseen_replies(db, user),
        ),
        not_finished=not_finished_rows,
        finished=finished_rows,
        missed_yesterday=missed_rows,
    )
