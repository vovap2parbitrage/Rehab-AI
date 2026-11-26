from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.pagination import Page
from app.schemas.session import (
    PatientSessionCreate,
    SessionCreate,
    SessionRead,
    SessionVideoRead,
)
from app.services import session

router = APIRouter()


@router.get("/", response_model=Page[SessionRead])
def list_sessions(
    patient_id: UUID | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Page[SessionRead]:
    return session.list_sessions(
        db, user, patient_id, limit=limit, offset=offset
    )


@router.post("/", response_model=SessionRead, status_code=201)
def create_session(
    payload: SessionCreate,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> SessionRead:
    return session.create_session(db, payload, user)


@router.post(
    "/assignments/{assignment_id}",
    response_model=SessionRead,
    status_code=status.HTTP_201_CREATED,
)
def complete_assignment_session(
    assignment_id: UUID,
    payload: PatientSessionCreate,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
) -> SessionRead:
    return session.complete_assignment_session(db, assignment_id, payload, user)


@router.get("/{session_id}", response_model=SessionRead)
def get_session(
    session_id: UUID,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> SessionRead:
    return session.get_session(db, session_id, user)


@router.get("/{session_id}/video", response_model=SessionVideoRead)
def get_session_video(
    session_id: UUID,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> SessionVideoRead:
    return SessionVideoRead(url=session.get_session_video_url(db, session_id, user))
