from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.session import PatientSessionCreate, SessionCreate, SessionRead
from app.services import session_service

router = APIRouter()


@router.get("/", response_model=list[SessionRead])
def list_sessions(
    patient_id: UUID | None = None,
    claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)
    ),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[SessionRead]:
    return session_service.list_sessions(db, user, claims, patient_id)


@router.post("/", response_model=SessionRead, status_code=201)
def create_session(
    payload: SessionCreate,
    claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)
    ),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> SessionRead:
    return session_service.create_session(db, payload, user, claims)


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
    return session_service.complete_assignment_session(db, assignment_id, payload, user)


@router.get("/{session_id}", response_model=SessionRead)
def get_session(
    session_id: UUID,
    claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)
    ),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> SessionRead:
    return session_service.get_session(db, session_id, user, claims)
