from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.auth import extract_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.assignment import Assignment
from app.models.session import TrainingSession
from app.models.user import User
from app.schemas.session import PatientSessionCreate, SessionCreate, SessionRead
from app.services.access import can_access_patient_id, require_patient_access

router = APIRouter()


def _patient_id_of(session: TrainingSession) -> UUID:
    return session.assignment.patient_id


@router.get("/", response_model=list[SessionRead])
def list_sessions(
    patient_id: UUID | None = None,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[SessionRead]:
    roles = extract_roles(claims)
    if patient_id is not None:
        require_patient_access(patient_id, user, roles, db)
    query = db.query(TrainingSession)
    if patient_id is not None:
        query = query.join(TrainingSession.assignment).filter(
            Assignment.patient_id == patient_id
        )
    sessions = query.all()
    return [
        SessionRead.model_validate(item, from_attributes=True)
        for item in sessions
        if can_access_patient_id(_patient_id_of(item), user, roles, db)
    ]


@router.post("/", response_model=SessionRead, status_code=201)
def create_session(
    payload: SessionCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> SessionRead:
    assignment = db.get(Assignment, payload.assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    require_patient_access(assignment.patient_id, user, extract_roles(claims), db)
    session = TrainingSession(**payload.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return SessionRead.model_validate(session, from_attributes=True)


@router.post(
    "/assignments/{assignment_id}",
    response_model=SessionRead,
    status_code=status.HTTP_201_CREATED,
)
def complete_assignment_session(
    assignment_id: UUID,
    payload: PatientSessionCreate,
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> SessionRead:
    assignment = (
        db.query(Assignment)
        .filter(Assignment.id == assignment_id, Assignment.patient.has(user_id=user.id))
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.status != "active":
        raise HTTPException(status_code=409, detail="Assignment is not active")

    session = TrainingSession(
        assignment_id=assignment.id,
        pain_score=payload.pain_score,
        completed_at=datetime.now(UTC),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return SessionRead.model_validate(session, from_attributes=True)


@router.get("/{session_id}", response_model=SessionRead)
def get_session(
    session_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> SessionRead:
    session = db.get(TrainingSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    require_patient_access(_patient_id_of(session), user, extract_roles(claims), db)
    return SessionRead.model_validate(session, from_attributes=True)
