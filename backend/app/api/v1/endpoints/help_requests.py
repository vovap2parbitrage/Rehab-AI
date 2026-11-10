from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.help_request import HelpRequestCreate, HelpRequestRead, HelpRequestReply
from app.services import help_request

router = APIRouter()


@router.post("/", response_model=HelpRequestRead, status_code=status.HTTP_201_CREATED)
def create_help_request(
    payload: HelpRequestCreate,
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> HelpRequestRead:
    return help_request.create_help_request(db, payload, user)


@router.get("/mine", response_model=list[HelpRequestRead])
def list_my_help_requests(
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[HelpRequestRead]:
    return help_request.list_patient_help_requests(db, user)


@router.get("/needs-attention", response_model=list[HelpRequestRead])
def list_needs_attention(
    _claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[HelpRequestRead]:
    return help_request.list_needs_attention(db, user)


@router.get("/", response_model=list[HelpRequestRead])
def list_patient_help_requests(
    patient_id: UUID,
    _claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[HelpRequestRead]:
    return help_request.list_for_patient(db, patient_id, user)


@router.patch("/{help_request_id}/reply", response_model=HelpRequestRead)
def reply_to_help_request(
    help_request_id: UUID,
    payload: HelpRequestReply,
    _claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> HelpRequestRead:
    return help_request.reply_to_help_request(db, help_request_id, payload.reply, user)
