"""Messages from a therapist to a patient, and the patient's one answer."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.patient import Patient
from app.models.therapist_message import TherapistMessage
from app.models.user import User
from app.schemas.message import MessageCreate, MessageRead, MessageReply
from app.services.patient_access import (
    get_patient_for_therapist,
    get_patient_profile,
    require_not_archived,
)


def _full_name(user: User, fallback: str = "") -> str:
    return " ".join(name for name in (user.first_name, user.last_name) if name) or fallback


def _query(db: Session):
    return db.query(TherapistMessage).options(
        joinedload(TherapistMessage.therapist),
        joinedload(TherapistMessage.patient).joinedload(Patient.user),
    )


def _to_read(message: TherapistMessage) -> MessageRead:
    return MessageRead(
        id=message.id,
        patient_id=message.patient_id,
        patient_name=_full_name(message.patient.user),
        therapist_name=_full_name(message.therapist, fallback=message.therapist.email),
        message=message.message,
        created_at=message.created_at,
        reply=message.reply,
        replied_at=message.replied_at,
        reply_seen=message.reply_seen_at is not None,
    )


def send_message(db: Session, payload: MessageCreate, user: User) -> MessageRead:
    get_patient_for_therapist(payload.patient_id, user, db)
    require_not_archived(db, payload.patient_id, user)
    message = TherapistMessage(
        therapist_id=user.id, patient_id=payload.patient_id, message=payload.message
    )
    db.add(message)
    db.commit()
    return _to_read(_query(db).filter(TherapistMessage.id == message.id).one())


def list_sent(db: Session, user: User, patient_id: UUID | None) -> list[MessageRead]:
    query = _query(db).filter(TherapistMessage.therapist_id == user.id)
    if patient_id is not None:
        query = query.filter(TherapistMessage.patient_id == patient_id)
    return [_to_read(item) for item in query.order_by(TherapistMessage.created_at.desc()).all()]


def list_for_patient(db: Session, user: User) -> list[MessageRead]:
    patient = get_patient_profile(db, user)
    query = _query(db).filter(TherapistMessage.patient_id == patient.id)
    return [_to_read(item) for item in query.order_by(TherapistMessage.created_at.desc()).all()]


def reply(db: Session, message_id: UUID, payload: MessageReply, user: User) -> MessageRead:
    patient = get_patient_profile(db, user)
    message = _query(db).filter(
        TherapistMessage.id == message_id, TherapistMessage.patient_id == patient.id
    ).first()
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.reply is not None:
        raise HTTPException(status_code=409, detail="You have already replied to this message")
    message.reply = payload.reply
    message.replied_at = datetime.now(UTC)
    db.commit()
    return _to_read(message)


def mark_reply_seen(db: Session, message_id: UUID, user: User) -> None:
    message = db.get(TherapistMessage, message_id)
    if message is None or message.therapist_id != user.id:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.reply is not None and message.reply_seen_at is None:
        message.reply_seen_at = datetime.now(UTC)
        db.commit()


def count_unseen_replies(db: Session, user: User) -> int:
    return (
        db.query(TherapistMessage)
        .filter(
            TherapistMessage.therapist_id == user.id,
            TherapistMessage.reply.is_not(None),
            TherapistMessage.reply_seen_at.is_(None),
        )
        .count()
    )
