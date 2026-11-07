from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.invitation import TherapistInvitation
from app.models.patient import Patient
from app.models.user import User
from app.schemas.invitation import (
    InvitationCreate,
    InvitationRead,
    PatientInvitationRead,
    PatientInvitationRespond,
)

router = APIRouter()


def _patient_for_user(db: Session, user: User) -> Patient:
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found",
        )
    return patient


def _patient_invitation_read(invitation: TherapistInvitation) -> PatientInvitationRead:
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


@router.post("/", response_model=InvitationRead, status_code=201)
def send_invitation(
    payload: InvitationCreate,
    _claims: dict[str, Any] = Depends(require_roles(Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> InvitationRead:
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
        raise HTTPException(
            status_code=422,
            detail="Patient email is required",
        )
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient with this email was not found")
    if patient.user.role != Role.PATIENT.value:
        raise HTTPException(status_code=400, detail="The specified email is not a patient")
    if any(therapist.id == user.id for therapist in patient.therapists):
        raise HTTPException(status_code=409, detail="Therapist is already assigned")
    invitation_exists = db.query(TherapistInvitation).filter(
        TherapistInvitation.patient_id == patient.id,
        TherapistInvitation.therapist_id == user.id,
        TherapistInvitation.status == "pending",
    ).first()
    if invitation_exists is not None:
        raise HTTPException(status_code=409, detail="Invitation already exists")

    invitation = TherapistInvitation(
        patient_id=patient.id,
        therapist_id=user.id,
        status="pending",
        message=payload.message,
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    return InvitationRead.model_validate(invitation, from_attributes=True)


@router.get("/mine", response_model=list[PatientInvitationRead])
def list_patient_invitations(
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[PatientInvitationRead]:
    patient = _patient_for_user(db, user)
    invitations = (
        db.query(TherapistInvitation)
        .options(joinedload(TherapistInvitation.therapist))
        .filter(TherapistInvitation.patient_id == patient.id)
        .order_by(TherapistInvitation.created_at.desc())
        .all()
    )
    return [_patient_invitation_read(invitation) for invitation in invitations]


@router.patch("/{invitation_id}/response", response_model=PatientInvitationRead)
def respond_to_invitation(
    invitation_id: UUID,
    payload: PatientInvitationRespond,
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending invitations can be answered",
        )

    invitation.status = payload.status
    invitation.responded_at = datetime.now(UTC)
    if payload.status == "accepted" and invitation.therapist not in patient.therapists:
        patient.therapists.append(invitation.therapist)

    db.commit()
    db.refresh(invitation)
    return _patient_invitation_read(invitation)
