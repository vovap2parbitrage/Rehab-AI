from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.session import SessionCreate, SessionRead

router = APIRouter()
_demo_sessions: dict[UUID, SessionRead] = {}


@router.get("/", response_model=list[SessionRead])
def list_sessions(patient_id: UUID | None = None) -> list[SessionRead]:
    items = list(_demo_sessions.values())
    if patient_id is not None:
        items = [item for item in items if item.patient_id == patient_id]
    return items


@router.post("/", response_model=SessionRead, status_code=201)
def create_session(payload: SessionCreate) -> SessionRead:
    # This endpoint stores only analysis output/angles, never patient video.
    session = SessionRead(**payload.model_dump())
    _demo_sessions[session.id] = session
    return session


@router.get("/{session_id}", response_model=SessionRead)
def get_session(session_id: UUID) -> SessionRead:
    session = _demo_sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
