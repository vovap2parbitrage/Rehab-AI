from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.auth import extract_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.exercise import ExerciseCreate, ExerciseRead
from app.services import exercise

router = APIRouter()


@router.get("/", response_model=list[ExerciseRead])
def list_exercises(
    _claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)
    ),
    db: Session = Depends(get_db),
) -> list[ExerciseRead]:
    return exercise.list_exercises(db)


@router.post("/", response_model=ExerciseRead, status_code=201)
def create_exercise(
    payload: ExerciseCreate,
    _claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ExerciseRead:
    return exercise.create_exercise(db, payload, user)


@router.get("/{exercise_id}", response_model=ExerciseRead)
def get_exercise(
    exercise_id: UUID,
    _claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)
    ),
    db: Session = Depends(get_db),
) -> ExerciseRead:
    return exercise.get_exercise(db, exercise_id)


@router.put("/{exercise_id}", response_model=ExerciseRead)
def update_exercise(
    exercise_id: UUID,
    payload: ExerciseCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ExerciseRead:
    return exercise.update_exercise(
        db, exercise_id, payload, user, extract_roles(claims)
    )


@router.delete("/{exercise_id}", status_code=204)
def delete_exercise(
    exercise_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> None:
    exercise.delete_exercise(
        db, exercise_id, user, extract_roles(claims)
    )
