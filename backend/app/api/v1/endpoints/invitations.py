from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.invitation import TherapistInvitation
from app.models.patient import Patient
from app.models.user import User
from app.schemas.invitation import InvitationCreate, InvitationRead

router = APIRouter()


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
