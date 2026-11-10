from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.roles import Role
from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.models.patient import Patient
from app.models.user import User
from app.schemas.assignment import AssignmentCreate, AssignmentRead, PatientAssignmentRead
from app.services.patient_access import get_patient_for_therapist, get_patient_for_user


def _patient_for_user(db: Session, user: User) -> Patient:
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return patient


def list_patient_assignments(db: Session, user: User) -> list[PatientAssignmentRead]:
    patient = _patient_for_user(db, user)
    return (
        db.query(Assignment)
        .options(joinedload(Assignment.exercise), selectinload(Assignment.sessions))
        .filter(Assignment.patient_id == patient.id)
        .order_by(Assignment.starts_on.desc())
        .all()
    )


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
            .filter(Patient.user_id == user.id)
            .all()
        )
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
