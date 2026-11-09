from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.roles import Role
from app.models.invitation import TherapistInvitation
from app.models.patient import Patient
from app.models.user import User
from app.schemas.invitation import (
    InvitationCreate,
    InvitationRead,
    PatientInvitationRead,
)


def _to_patient_read(invitation: TherapistInvitation) -> PatientInvitationRead:
    return PatientInvitationRead(
        id=invitation.id,
        patient_id=invitation.patient_id,
        therapist_id=invitation.therapist_id,
        therapist_email=invitation.therapist.email,
        status=invitation.status,
        message=invitation.message,
        created_at=invitation.created_at,
        responded_at=invitation.responded_at,
    )


def _patient_for_user(db: Session, user: User) -> Patient:
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found",
        )
    return patient


def send_invitation(db: Session, payload: InvitationCreate, therapist: User) -> InvitationRead:
    if payload.email:
        patient = (
            db.query(Patient)
            .join(Patient.user)
            .filter(func.lower(User.email) == payload.email.strip().lower())
            .first()
        )
    elif payload.patient_id:
        patient = db.get(Patient, payload.patient_id)
    else:
        raise HTTPException(status_code=422, detail="Patient email is required")

    if patient is None:
        raise HTTPException(status_code=404, detail="Patient with this email was not found")
    if patient.user.role != Role.PATIENT.value:
        raise HTTPException(status_code=400, detail="The specified email is not a patient")
    if any(item.id == therapist.id for item in patient.therapists):
        raise HTTPException(status_code=409, detail="Therapist is already assigned")
    exists = db.query(TherapistInvitation).filter(
        TherapistInvitation.patient_id == patient.id,
        TherapistInvitation.therapist_id == therapist.id,
        TherapistInvitation.status == "pending",
    ).first()
    if exists is not None:
        raise HTTPException(status_code=409, detail="Invitation already exists")

    invitation = TherapistInvitation(
        patient_id=patient.id,
        therapist_id=therapist.id,
        status="pending",
        message=payload.message,
    )
    db.add(invitation)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Invitation already exists") from exc
    db.refresh(invitation)
    return InvitationRead.model_validate(invitation, from_attributes=True)


def list_patient_invitations(db: Session, user: User) -> list[PatientInvitationRead]:
    patient = _patient_for_user(db, user)
    invitations = (
        db.query(TherapistInvitation)
        .options(joinedload(TherapistInvitation.therapist))
        .filter(TherapistInvitation.patient_id == patient.id)
        .order_by(TherapistInvitation.created_at.desc())
        .all()
    )
    return [_to_patient_read(invitation) for invitation in invitations]


def respond_to_invitation(
    db: Session,
    invitation_id: UUID,
    response_status: str,
    user: User,
) -> PatientInvitationRead:
    patient = _patient_for_user(db, user)
    invitation = (
        db.query(TherapistInvitation)
        .options(joinedload(TherapistInvitation.therapist))
        .filter(
            TherapistInvitation.id == invitation_id,
            TherapistInvitation.patient_id == patient.id,
        )
        .first()
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.status != "pending":
        raise HTTPException(
            status_code=409,
            detail="Only pending invitations can be answered",
        )

    invitation.status = response_status
    invitation.responded_at = datetime.now(UTC)
    if response_status == "accepted" and invitation.therapist not in patient.therapists:
        patient.therapists.append(invitation.therapist)

    db.commit()
    db.refresh(invitation)
    return _to_patient_read(invitation)
