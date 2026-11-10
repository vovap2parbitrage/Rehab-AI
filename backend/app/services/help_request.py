from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Query, Session, joinedload

from app.core.roles import Role
from app.models.assignment import Assignment
from app.models.help_request import HelpRequest
from app.models.patient import Patient
from app.models.session import TrainingSession
from app.models.user import User
from app.schemas.help_request import HelpRequestCreate, HelpRequestRead
from app.services.patient_access import get_patient_for_therapist


def _query(db: Session) -> Query:
    return (
        db.query(HelpRequest)
        .join(HelpRequest.session)
        .join(TrainingSession.assignment)
        .options(
            joinedload(HelpRequest.patient),
            joinedload(HelpRequest.replier),
            joinedload(HelpRequest.session)
            .joinedload(TrainingSession.assignment)
            .joinedload(Assignment.exercise),
        )
    )


def _for_therapist(query: Query, user: User) -> Query:
    """A therapist sees questions about their own assignments of their current patients."""
    if user.role == Role.ADMIN.value:
        return query
    return query.filter(
        Assignment.therapist_id == user.id,
        HelpRequest.patient.has(Patient.therapists.any(User.id == user.id)),
    )


def _to_read(help_request: HelpRequest) -> HelpRequestRead:
    session = help_request.session
    patient = help_request.patient
    return HelpRequestRead(
        id=help_request.id,
        session_id=help_request.session_id,
        assignment_id=session.assignment_id,
        patient_id=help_request.patient_id,
        patient_name=f"{patient.first_name} {patient.last_name}",
        exercise_name=session.assignment.exercise.name,
        pain_score=session.pain_score,
        message=help_request.message,
        reply=help_request.reply,
        replied_by_email=help_request.replier.email if help_request.replier else None,
        created_at=help_request.created_at,
        replied_at=help_request.replied_at,
    )


def create_help_request(
    db: Session,
    payload: HelpRequestCreate,
    user: User,
) -> HelpRequestRead:
    session = (
        db.query(TrainingSession)
        .join(TrainingSession.assignment)
        .join(Assignment.patient)
        .filter(TrainingSession.id == payload.session_id, Patient.user_id == user.id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    help_request = HelpRequest(
        session_id=session.id,
        patient_id=session.assignment.patient_id,
        message=payload.message,
    )
    db.add(help_request)
    db.commit()
    return _to_read(_query(db).filter(HelpRequest.id == help_request.id).one())


def list_patient_help_requests(db: Session, user: User) -> list[HelpRequestRead]:
    help_requests = (
        _query(db)
        .filter(HelpRequest.patient.has(Patient.user_id == user.id))
        .order_by(HelpRequest.created_at.desc())
        .all()
    )
    return [_to_read(item) for item in help_requests]


def list_needs_attention(db: Session, user: User) -> list[HelpRequestRead]:
    """Unanswered questions addressed to this therapist (all of them for an admin)."""
    query = _for_therapist(_query(db).filter(HelpRequest.reply.is_(None)), user)
    return [_to_read(item) for item in query.order_by(HelpRequest.created_at).all()]


def list_for_patient(db: Session, patient_id: UUID, user: User) -> list[HelpRequestRead]:
    """All questions of one patient with replies, newest first (the therapist's history)."""
    get_patient_for_therapist(patient_id, user, db)
    query = _for_therapist(_query(db).filter(HelpRequest.patient_id == patient_id), user)
    return [_to_read(item) for item in query.order_by(HelpRequest.created_at.desc()).all()]


def reply_to_help_request(
    db: Session,
    help_request_id: UUID,
    reply: str,
    user: User,
) -> HelpRequestRead:
    help_request = _query(db).filter(HelpRequest.id == help_request_id).first()
    if help_request is None:
        raise HTTPException(status_code=404, detail="Help request not found")
    get_patient_for_therapist(help_request.patient_id, user, db)
    if (
        user.role != Role.ADMIN.value
        and help_request.session.assignment.therapist_id != user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Only the therapist who assigned the exercise can reply",
        )
    if help_request.reply is not None:
        raise HTTPException(status_code=409, detail="Help request already has a reply")

    help_request.reply = reply
    help_request.replied_by = user.id
    help_request.replied_at = datetime.now(UTC)
    db.commit()
    db.refresh(help_request)
    return _to_read(help_request)
