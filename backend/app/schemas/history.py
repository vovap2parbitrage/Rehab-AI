from datetime import date, datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class HistoryPeriod(str, Enum):
    last_30_days = "30d"
    last_90_days = "90d"
    all_time = "all"


class HistoryKpis(BaseModel):
    total_sessions: int
    planned_sessions: int
    adherence_pct: float | None = None
    avg_pain: float | None = None
    pain_trend: float | None = None
    avg_score: float | None = None
    last_session_at: datetime | None = None


class HistoryPoint(BaseModel):
    session_id: UUID
    completed_at: datetime
    value: float
    assignment_id: UUID
    exercise_name: str


class AdherenceWeek(BaseModel):
    week_start: date
    completed: int
    planned: int


class PatientHistoryRead(BaseModel):
    patient_id: UUID
    period: HistoryPeriod
    date_from: date
    date_to: date
    kpis: HistoryKpis
    pain_series: list[HistoryPoint]
    score_series: list[HistoryPoint]
    adherence_weeks: list[AdherenceWeek]
