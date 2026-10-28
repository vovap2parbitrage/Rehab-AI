from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_roles
from app.core.roles import Role
from app.schemas.exercise import ExerciseCreate, ExerciseRead

router = APIRouter()
_demo_exercises: dict[UUID, ExerciseRead] = {}


@router.get("/", response_model=list[ExerciseRead])
def list_exercises(
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
) -> list[ExerciseRead]:
    return list(_demo_exercises.values())


@router.post("/", response_model=ExerciseRead, status_code=201)
def create_exercise(
    payload: ExerciseCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
) -> ExerciseRead:
    exercise = ExerciseRead(**payload.model_dump())
    _demo_exercises[exercise.id] = exercise
    return exercise


@router.get("/{exercise_id}", response_model=ExerciseRead)
def get_exercise(
    exercise_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
) -> ExerciseRead:
    exercise = _demo_exercises.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise
