from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.assignment import AssignmentCreate, AssignmentRead

router = APIRouter()
_demo_assignments: dict[UUID, AssignmentRead] = {}


@router.get("/", response_model=list[AssignmentRead])
def list_assignments(patient_id: UUID | None = None) -> list[AssignmentRead]:
    items = list(_demo_assignments.values())
    if patient_id is not None:
        items = [item for item in items if item.patient_id == patient_id]
    return items


@router.post("/", response_model=AssignmentRead, status_code=201)
def create_assignment(payload: AssignmentCreate) -> AssignmentRead:
    assignment = AssignmentRead(**payload.model_dump())
    _demo_assignments[assignment.id] = assignment
    return assignment


@router.get("/{assignment_id}", response_model=AssignmentRead)
def get_assignment(assignment_id: UUID) -> AssignmentRead:
    assignment = _demo_assignments.get(assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment
