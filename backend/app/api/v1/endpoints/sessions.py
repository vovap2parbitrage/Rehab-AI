from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import ensure_patient_access, require_roles
from app.core.roles import Role
from app.schemas.session import SessionCreate, SessionRead

router = APIRouter()
_demo_sessions: dict[UUID, SessionRead] = {}


@router.get("/", response_model=list[SessionRead])
def list_sessions(
    request: Request,
    patient_id: UUID | None = None,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
) -> list[SessionRead]:
    items = list(_demo_sessions.values())
    if patient_id is not None:
        ensure_patient_access(patient_id, request)
        items = [item for item in items if item.patient_id == patient_id]
    return items


@router.post("/", response_model=SessionRead, status_code=201)
def create_session(
    payload: SessionCreate,
    request: Request,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
) -> SessionRead:
    ensure_patient_access(payload.patient_id, request)
    session = SessionRead(**payload.model_dump())
    _demo_sessions[session.id] = session
    return session


@router.get("/{session_id}", response_model=SessionRead)
def get_session(
    session_id: UUID,
    request: Request,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
) -> SessionRead:
    session = _demo_sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    ensure_patient_access(session.patient_id, request)
    return session
