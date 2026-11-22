from datetime import date, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.roles import Role
from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.models.patient import Patient
from app.models.session import TrainingSession
from app.models.user import User
from app.schemas.assignment import AssignmentCreate, AssignmentRead, PatientAssignmentRead
from app.core.statuses import AssignmentStatus
from app.services.patient_access import (
    get_patient_for_therapist,
    get_patient_for_user,
    get_patient_profile,
    require_not_archived,
    treated_by,
)


def planned_session_count(assignment: Assignment) -> int:
    return sum(
        day.weekday() in assignment.weekdays
        for day in (
            assignment.starts_on + timedelta(days=offset)
            for offset in range(assignment.duration_weeks * 7)
        )
    )


def complete_finished_assignments(db: Session, assignments: list[Assignment]) -> None:
    today = date.today()
    changed = False
    for item in assignments:
        ends_on = item.starts_on + timedelta(days=item.duration_weeks * 7 - 1)
        completed_sessions = (
            db.query(func.count(TrainingSession.id))
            .filter(
                TrainingSession.assignment_id == item.id,
                TrainingSession.completed_at.is_not(None),
            )
            .scalar()
        )
        if item.status == AssignmentStatus.ACTIVE.value and (
            ends_on < today or completed_sessions >= planned_session_count(item)
        ):
            item.status = AssignmentStatus.COMPLETED.value
            changed = True
    if changed:
        db.commit()


def list_patient_assignments(db: Session, user: User) -> list[PatientAssignmentRead]:
    patient = get_patient_profile(db, user)
    assignments = (
        db.query(Assignment)
        .options(joinedload(Assignment.exercise), selectinload(Assignment.sessions))
        .filter(
            Assignment.patient_id == patient.id,
            Assignment.status != AssignmentStatus.CANCELLED.value,
        )
        .order_by(Assignment.starts_on.desc())
        .all()
    )
    complete_finished_assignments(db, assignments)
    return assignments


def list_assignments(
    db: Session,
    user: User,
    patient_id: UUID | None,
) -> list[AssignmentRead]:
    if patient_id is not None:
        get_patient_for_user(patient_id, user, db)
        assignments = db.query(Assignment).filter(Assignment.patient_id == patient_id).all()
    elif user.role == Role.ADMIN.value:
        assignments = db.query(Assignment).all()
    elif user.role == Role.THERAPIST.value:
        assignments = (
            db.query(Assignment)
            .join(Assignment.patient)
            .filter(treated_by(user.id))
            .all()
        )
    else:
        assignments = (
            db.query(Assignment)
            .join(Assignment.patient)
            .filter(
                Patient.user_id == user.id,
                Assignment.status != AssignmentStatus.CANCELLED.value,
            )
            .all()
        )
    complete_finished_assignments(db, assignments)
    return [AssignmentRead.model_validate(item, from_attributes=True) for item in assignments]


def create_assignment(
    db: Session,
    payload: AssignmentCreate,
    user: User,
) -> AssignmentRead:
    if user.role == Role.ADMIN.value:
        if db.get(Patient, payload.patient_id) is None:
            raise HTTPException(status_code=404, detail="Patient not found")
    else:
        get_patient_for_therapist(payload.patient_id, user, db)
    require_not_archived(db, payload.patient_id, user)
    if db.get(Exercise, payload.exercise_id) is None:
        raise HTTPException(status_code=404, detail="Exercise not found")

    assignment = Assignment(**payload.model_dump(), therapist_id=user.id)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return AssignmentRead.model_validate(assignment, from_attributes=True)


def get_assignment(db: Session, assignment_id: UUID, user: User) -> AssignmentRead:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    get_patient_for_user(assignment.patient_id, user, db)
    return AssignmentRead.model_validate(assignment, from_attributes=True)


def cancel_assignment(db: Session, assignment_id: UUID, user: User) -> None:
    assignment = db.get(Assignment, assignment_id)

    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if user.role != Role.ADMIN.value and assignment.therapist_id != user.id:
        raise HTTPException(status_code=403, detail="You can cancel only your assignments")
    if assignment.status != AssignmentStatus.ACTIVE.value:
        raise HTTPException(status_code=403, detail="You can cancel only active assignments")

    assignment.status = AssignmentStatus.CANCELLED.value

    db.commit()
