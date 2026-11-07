from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.assignment import AssignmentCreate, AssignmentRead, PatientAssignmentRead
from app.services import assignment_service

router = APIRouter()


@router.get("/mine", response_model=list[PatientAssignmentRead])
def list_patient_assignments(
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[PatientAssignmentRead]:
    return assignment_service.list_patient_assignments(db, user)


@router.get("/", response_model=list[AssignmentRead])
def list_assignments(
    patient_id: UUID | None = None,
    _claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)
    ),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[AssignmentRead]:
    return assignment_service.list_assignments(db, user, patient_id)


@router.post("/", response_model=AssignmentRead, status_code=201)
def create_assignment(
    payload: AssignmentCreate,
    _claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> AssignmentRead:
    return assignment_service.create_assignment(db, payload, user)


@router.get("/{assignment_id}", response_model=AssignmentRead)
def get_assignment(
    assignment_id: UUID,
    _claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)
    ),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> AssignmentRead:
    return assignment_service.get_assignment(db, assignment_id, user)
