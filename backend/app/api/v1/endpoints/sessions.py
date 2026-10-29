from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_active_user, require_roles
from app.core.auth import extract_roles
from app.core.roles import Role
from app.models.user import User
from app.schemas.session import SessionCreate, SessionRead
from app.services import demo_store
from app.services.access import can_access_patient_id, require_patient_access

router = APIRouter()


def _patient_id_of(session: SessionRead) -> UUID | None:
    assignment = demo_store.assignments.get(session.assignment_id)
    return assignment.patient_id if assignment is not None else None


@router.get("/", response_model=list[SessionRead])
def list_sessions(
    patient_id: UUID | None = None,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
) -> list[SessionRead]:
    roles = extract_roles(claims)
    if patient_id is not None:
        require_patient_access(patient_id, user, roles)
    return [
        item
        for item in demo_store.sessions.values()
        if (patient_id is None or _patient_id_of(item) == patient_id)
        and can_access_patient_id(_patient_id_of(item), user, roles)
    ]


@router.post("/", response_model=SessionRead, status_code=201)
def create_session(
    payload: SessionCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
) -> SessionRead:
    assignment = demo_store.assignments.get(payload.assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    require_patient_access(assignment.patient_id, user, extract_roles(claims))
    session = SessionRead(**payload.model_dump())
    demo_store.sessions[session.id] = session
    return session


@router.get("/{session_id}", response_model=SessionRead)
def get_session(
    session_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
) -> SessionRead:
    session = demo_store.sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    patient_id = _patient_id_of(session)
    if patient_id is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    require_patient_access(patient_id, user, extract_roles(claims))
    return session
