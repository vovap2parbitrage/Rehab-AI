from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.models.user import User
from app.schemas.exercise import ExerciseCreate, ExerciseRead
from app.services import demo_store

router = APIRouter()


@router.get("/", response_model=list[ExerciseRead])
def list_exercises(
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
) -> list[ExerciseRead]:
    return list(demo_store.exercises.values())


@router.post("/", response_model=ExerciseRead, status_code=201)
def create_exercise(
    payload: ExerciseCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
) -> ExerciseRead:
    exercise = ExerciseRead(**payload.model_dump(), created_by=user.id)
    demo_store.exercises[exercise.id] = exercise
    return exercise


@router.get("/{exercise_id}", response_model=ExerciseRead)
def get_exercise(
    exercise_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
) -> ExerciseRead:
    exercise = demo_store.exercises.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise
