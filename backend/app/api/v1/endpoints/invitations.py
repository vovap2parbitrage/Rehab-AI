from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.invitation import (
    InvitationCreate,
    InvitationRead,
    PatientInvitationRead,
    PatientInvitationRespond,
)
from app.services import invitation

router = APIRouter()


@router.post("/", response_model=InvitationRead, status_code=201)
def send_invitation(
    payload: InvitationCreate,
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> InvitationRead:
    return invitation.send_invitation(db, payload, user)


@router.get("/mine", response_model=list[PatientInvitationRead])
def list_patient_invitations(
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
) -> list[PatientInvitationRead]:
    return invitation.list_patient_invitations(db, user)


@router.patch("/{invitation_id}/response", response_model=PatientInvitationRead)
def respond_to_invitation(
    invitation_id: UUID,
    payload: PatientInvitationRespond,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
) -> PatientInvitationRead:
    return invitation.respond_to_invitation(
        db, invitation_id, payload.status, user
    )
