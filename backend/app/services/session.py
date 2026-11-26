from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.core.statuses import AssignmentStatus
from app.models.assignment import Assignment
from app.models.patient import Patient
from app.models.session import TrainingSession
from app.models.user import User
from app.schemas.pagination import Page
from app.schemas.session import PatientSessionCreate, SessionCreate, SessionRead
from app.services import storage
from app.services.assignment import complete_finished_assignments
from app.services.patient_access import require_patient_access
from app.services.schedule import require_session_today


def _patient_id_of(session: TrainingSession) -> UUID:
    return session.assignment.patient_id


def list_sessions(
    db: Session,
    user: User,
    patient_id: UUID | None,
    *,
    limit: int = 20,
    offset: int = 0,
) -> Page[SessionRead]:
    if patient_id is not None:
        require_patient_access(patient_id, user, db)
    query = db.query(TrainingSession).join(TrainingSession.assignment).join(Assignment.patient)
    if patient_id is not None:
        query = query.filter(Assignment.patient_id == patient_id)
    elif user.role == Role.THERAPIST.value:
        query = query.filter(Patient.therapists.any(User.id == user.id))
    else:
        query = query.filter(Patient.user_id == user.id)

    total = query.count()
    sessions = (
        query.order_by(
            func.coalesce(TrainingSession.completed_at, TrainingSession.created_at).desc(),
            TrainingSession.created_at.desc(),
            TrainingSession.id,
        )
        .offset(offset)
        .limit(limit)
        .all()
    )
    return Page(
        items=[SessionRead.model_validate(item, from_attributes=True) for item in sessions],
        total=total,
        limit=limit,
        offset=offset,
    )


def create_session(
    db: Session,
    payload: SessionCreate,
    user: User,
) -> SessionRead:
    assignment = db.get(Assignment, payload.assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    require_patient_access(assignment.patient_id, user, db)
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
) -> str:
    session = db.get(TrainingSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    require_patient_access(_patient_id_of(session), user, db)
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
) -> SessionRead:
    session = db.get(TrainingSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    require_patient_access(_patient_id_of(session), user, db)
    return SessionRead.model_validate(session, from_attributes=True)
