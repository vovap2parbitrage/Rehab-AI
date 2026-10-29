from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_active_user, require_roles
from app.core.auth import extract_roles
from app.core.roles import Role
from app.models.user import User
from app.schemas.assignment import AssignmentCreate, AssignmentRead
from app.services import demo_store
from app.services.access import can_access_patient_id, require_patient_access

router = APIRouter()


@router.get("/", response_model=list[AssignmentRead])
def list_assignments(
    patient_id: UUID | None = None,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
) -> list[AssignmentRead]:
    roles = extract_roles(claims)
    if patient_id is not None:
        require_patient_access(patient_id, user, roles)
    return [
        item
        for item in demo_store.assignments.values()
        if (patient_id is None or item.patient_id == patient_id)
        and can_access_patient_id(item.patient_id, user, roles)
    ]


@router.post("/", response_model=AssignmentRead, status_code=201)
def create_assignment(
    payload: AssignmentCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
) -> AssignmentRead:
    require_patient_access(payload.patient_id, user, extract_roles(claims))
    assignment = AssignmentRead(**payload.model_dump())
    demo_store.assignments[assignment.id] = assignment
    return assignment


@router.get("/{assignment_id}", response_model=AssignmentRead)
def get_assignment(
    assignment_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
) -> AssignmentRead:
    assignment = demo_store.assignments.get(assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    require_patient_access(assignment.patient_id, user, extract_roles(claims))
    return assignment
