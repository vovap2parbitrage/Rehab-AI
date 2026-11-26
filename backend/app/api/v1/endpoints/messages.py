from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.message import MessageCreate, MessageRead, MessageReply
from app.services import message

router = APIRouter()


@router.post("/", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
def send_message(
    payload: MessageCreate,
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> MessageRead:
    """Therapist: write to one of their patients."""
    return message.send_message(db, payload, user)


@router.get("/", response_model=list[MessageRead])
def list_sent(
    patient_id: UUID | None = None,
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> list[MessageRead]:
    """Therapist: the messages they sent, newest first, with the patients' replies."""
    return message.list_sent(db, user, patient_id)


@router.get("/mine", response_model=list[MessageRead])
def list_mine(
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
) -> list[MessageRead]:
    """Patient: the messages their therapists sent them, newest first."""
    return message.list_for_patient(db, user)


@router.post("/{message_id}/reply", response_model=MessageRead)
def reply_to_message(
    message_id: UUID,
    payload: MessageReply,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
) -> MessageRead:
    return message.reply(db, message_id, payload, user)


@router.post("/{message_id}/seen", status_code=status.HTTP_204_NO_CONTENT)
def mark_reply_seen(
    message_id: UUID,
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> None:
    message.mark_reply_seen(db, message_id, user)
