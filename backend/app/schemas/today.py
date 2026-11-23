from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class TodayItem(BaseModel):
    """One assignment a patient had to do on the day."""

    assignment_id: UUID
    exercise_name: str
    done: bool


class TodayPatient(BaseModel):
    patient_id: UUID
    patient_name: str
    items: list[TodayItem]
    last_completed_at: datetime | None = None


class TodayCounters(BaseModel):
    active_patients: int
    due_today: int
    finished: int
    not_finished: int
    missed_yesterday: int
    open_questions: int


class TodayRead(BaseModel):
    date: date
    timezone: str
    counters: TodayCounters
    # Due today and not everything is done yet; the items say what is still left.
    not_finished: list[TodayPatient]
    # Everything due today is done.
    finished: list[TodayPatient]
    # Had something due yesterday that was not done; the items are the missed ones.
    missed_yesterday: list[TodayPatient]
