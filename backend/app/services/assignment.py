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
from app.schemas.assignment import (
    AssignmentCreate,
    AssignmentRead,
    AssignmentUpdate,
    PatientAssignmentRead,
)
from app.core.statuses import AssignmentStatus
from app.core.timezones import app_today
from app.services.exercise import current_version
from app.services.schedule import (
    assignments_done_on,
    last_day,
    next_session_day,
    is_session_day,
    planned_session_count,
)
from app.services.patient_access import (
    get_patient_for_therapist,
    get_patient_for_user,
    get_patient_profile,
    require_not_archived,
    treated_by,
)


def complete_finished_assignments(db: Session, assignments: list[Assignment]) -> None:
    today = app_today()
    changed = False
    for item in assignments:
        completed_sessions = (
            db.query(func.count(TrainingSession.id))
            .filter(
                TrainingSession.assignment_id == item.id,
                TrainingSession.completed_at.is_not(None),
            )
            .scalar()
        )
        if item.status == AssignmentStatus.ACTIVE.value and (
            last_day(item) < today or completed_sessions >= planned_session_count(item)
        ):
            item.status = AssignmentStatus.COMPLETED.value
            changed = True
    if changed:
        db.commit()


def list_patient_assignments(db: Session, user: User) -> list[PatientAssignmentRead]:
    patient = get_patient_profile(db, user)
    assignments = (
        db.query(Assignment)
        .options(
            joinedload(Assignment.exercise),
            joinedload(Assignment.exercise_version),
            selectinload(Assignment.sessions),
        )
        .filter(
            Assignment.patient_id == patient.id,
            Assignment.status != AssignmentStatus.CANCELLED.value,
        )
        .order_by(Assignment.starts_on.desc())
        .all()
    )
    complete_finished_assignments(db, assignments)
    today = app_today()
    done_today = assignments_done_on(db, [item.id for item in assignments], today)
    result = []
    for item in assignments:
        assignment = PatientAssignmentRead.model_validate(item, from_attributes=True)
        exercise = assignment.exercise.model_copy(
            update={"body_parts": item.exercise_version.body_parts}
        )
        result.append(
            assignment.model_copy(
                update={
                    "exercise": exercise,
                    "scheduled_today": item.status == AssignmentStatus.ACTIVE.value
                    and is_session_day(item, today),
                    "done_today": item.id in done_today,
                    "next_session_on": next_session_day(item, today)
                    if item.status == AssignmentStatus.ACTIVE.value
                    else None,
                }
            )
        )
    return result


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


def _check_start_date(payload: AssignmentCreate) -> None:
    """The plan starts on a real session day, and not in the past."""
    today = app_today()
    if payload.starts_on < today:
        raise HTTPException(
            status_code=422,
            detail=f"The start date cannot be before today ({today.isoformat()})",
        )
    if payload.starts_on.weekday() not in payload.weekdays:
        raise HTTPException(
            status_code=422,
            detail="The start date must be one of the weekdays of the plan",
        )


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
    exercise = db.get(Exercise, payload.exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if exercise.hidden_at is not None:
        raise HTTPException(status_code=409, detail="The exercise is hidden. Restore it first")

    _check_start_date(payload)

    assignment = Assignment(
        **payload.model_dump(),
        therapist_id=user.id,
        exercise_version_id=current_version(db, exercise).id,
    )
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


def update_assignment(
    db: Session, assignment_id: UUID, payload: AssignmentUpdate, user: User
) -> AssignmentRead:
    assignment = db.get(Assignment, assignment_id)

    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if user.role != Role.ADMIN.value and assignment.therapist_id != user.id:
        raise HTTPException(status_code=403, detail="You can edit only your assignments")
    if assignment.status != AssignmentStatus.ACTIVE.value:
        raise HTTPException(status_code=409, detail="Only active assignments can be edited")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(assignment, field, value)

    db.commit()
    db.refresh(assignment)
    return AssignmentRead.model_validate(assignment, from_attributes=True)
