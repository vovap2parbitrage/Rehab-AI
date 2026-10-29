"""Temporary in-memory storage shared by the demo endpoints.

Replace with database access once the endpoints are connected to PostgreSQL.
"""

from uuid import UUID

from app.schemas.assignment import AssignmentRead
from app.schemas.exercise import ExerciseRead
from app.schemas.patient import PatientRead
from app.schemas.session import SessionRead

patients: dict[UUID, PatientRead] = {}
exercises: dict[UUID, ExerciseRead] = {}
assignments: dict[UUID, AssignmentRead] = {}
sessions: dict[UUID, SessionRead] = {}
