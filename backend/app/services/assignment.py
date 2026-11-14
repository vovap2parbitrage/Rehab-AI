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
from app.services.patient_access import get_patient_for_therapist, get_patient_for_user


def _patient_for_user(db: Session, user: User) -> Patient:
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return patient


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
        if item.status == "active" and (
            ends_on < today or completed_sessions >= planned_session_count(item)
        ):
            item.status = "completed"
            changed = True
    if changed:
        db.commit()


def list_patient_assignments(db: Session, user: User) -> list[PatientAssignmentRead]:
    patient = _patient_for_user(db, user)
    assignments = (
        db.query(Assignment)
        .options(joinedload(Assignment.exercise), selectinload(Assignment.sessions))
        .filter(Assignment.patient_id == patient.id)
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
            .filter(Patient.therapists.any(User.id == user.id))
            .all()
        )
    else:
        assignments = (
            db.query(Assignment)
            .join(Assignment.patient)
            .filter(Patient.user_id == user.id and Assignment.status != "canceled")
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
    if assignment.status != "active":
        raise HTTPException(status_code=403, detail="You can cancel only cancel active assignments")

    assignment.status = "cancelled"

    db.commit()
