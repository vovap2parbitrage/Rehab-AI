from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import ensure_patient_access, require_roles
from app.core.roles import Role
from app.schemas.assignment import AssignmentCreate, AssignmentRead

router = APIRouter()
_demo_assignments: dict[UUID, AssignmentRead] = {}


@router.get("/", response_model=list[AssignmentRead])
def list_assignments(
    request: Request,
    patient_id: UUID | None = None,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
) -> list[AssignmentRead]:
    items = list(_demo_assignments.values())
    if patient_id is not None:
        ensure_patient_access(patient_id, request)
        items = [item for item in items if item.patient_id == patient_id]
    return items


@router.post("/", response_model=AssignmentRead, status_code=201)
def create_assignment(
    payload: AssignmentCreate,
    request: Request,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
) -> AssignmentRead:
    ensure_patient_access(payload.patient_id, request)
    assignment = AssignmentRead(**payload.model_dump())
    _demo_assignments[assignment.id] = assignment
    return assignment


@router.get("/{assignment_id}", response_model=AssignmentRead)
def get_assignment(
    assignment_id: UUID,
    request: Request,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
) -> AssignmentRead:
    assignment = _demo_assignments.get(assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    ensure_patient_access(assignment.patient_id, request)
    return assignment
