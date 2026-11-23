from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.auth import extract_roles
from app.core.roles import Role
from app.core.statuses import AssignmentStatus
from app.models.assignment import Assignment
from app.models.session import TrainingSession
from app.models.user import User
from app.schemas.session import PatientSessionCreate, SessionCreate, SessionRead
from app.services import storage
from app.services.patient_access import can_access_patient_id, require_patient_access
from app.services.schedule import require_session_today
from app.services.assignment import complete_finished_assignments


def _patient_id_of(session: TrainingSession) -> UUID:
    return session.assignment.patient_id


def list_sessions(
    db: Session,
    user: User,
    claims: dict,
    patient_id: UUID | None,
) -> list[SessionRead]:
    roles = extract_roles(claims)
    if patient_id is not None:
        require_patient_access(patient_id, user, roles, db)
    query = db.query(TrainingSession)
    if patient_id is not None:
        query = query.join(TrainingSession.assignment).filter(
            Assignment.patient_id == patient_id
        )
    return [
        SessionRead.model_validate(item, from_attributes=True)
        for item in query.all()
        if can_access_patient_id(_patient_id_of(item), user, roles, db)
    ]


def create_session(
    db: Session,
    payload: SessionCreate,
    user: User,
    claims: dict,
) -> SessionRead:
    assignment = db.get(Assignment, payload.assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    require_patient_access(assignment.patient_id, user, extract_roles(claims), db)
    if user.role == Role.PATIENT.value:
        require_session_today(db, assignment)
    session = TrainingSession(**payload.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return SessionRead.model_validate(session, from_attributes=True)


def complete_assignment_session(
    db: Session,
    assignment_id: UUID,
    payload: PatientSessionCreate,
    user: User,
) -> SessionRead:
    assignment = (
        db.query(Assignment)
        .filter(Assignment.id == assignment_id, Assignment.patient.has(user_id=user.id))
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.status != AssignmentStatus.ACTIVE.value:
        raise HTTPException(status_code=409, detail="Assignment is not active")
    require_session_today(db, assignment)

    session = TrainingSession(
        assignment_id=assignment.id,
        pain_score=payload.pain_score,
        completed_at=datetime.now(UTC),
    )
    db.add(session)
    db.flush()
    complete_finished_assignments(db, [assignment])
    db.commit()
    db.refresh(session)
    return SessionRead.model_validate(session, from_attributes=True)


def get_session_video_url(
    db: Session,
    session_id: UUID,
    user: User,
    claims: dict,
) -> str:
    session = db.get(TrainingSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    require_patient_access(_patient_id_of(session), user, extract_roles(claims), db)
    if session.video_key is None:
        raise HTTPException(status_code=404, detail="Video not found")
    try:
        return storage.create_video_url(session.video_key)
    except storage.StorageError as exc:
        raise HTTPException(status_code=502, detail="Could not open video") from exc


def get_session(
    db: Session,
    session_id: UUID,
    user: User,
    claims: dict,
) -> SessionRead:
    session = db.get(TrainingSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    require_patient_access(_patient_id_of(session), user, extract_roles(claims), db)
    return SessionRead.model_validate(session, from_attributes=True)
