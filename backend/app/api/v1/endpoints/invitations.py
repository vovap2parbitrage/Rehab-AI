from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.invitation import (
    InvitationCreate,
    InvitationRead,
    PatientInvitationRead,
    PatientInvitationRespond,
)
from app.services import invitation_service

router = APIRouter()


@router.post("/", response_model=InvitationRead, status_code=201)
def send_invitation(
    payload: InvitationCreate,
    _claims: dict[str, Any] = Depends(require_roles(Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> InvitationRead:
    return invitation_service.send_invitation(db, payload, user)


@router.get("/mine", response_model=list[PatientInvitationRead])
def list_patient_invitations(
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[PatientInvitationRead]:
    return invitation_service.list_patient_invitations(db, user)


@router.patch("/{invitation_id}/response", response_model=PatientInvitationRead)
def respond_to_invitation(
    invitation_id: UUID,
    payload: PatientInvitationRespond,
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientInvitationRead:
    return invitation_service.respond_to_invitation(
        db, invitation_id, payload.status, user
    )
