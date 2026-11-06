from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_active_user, require_roles
from app.core.auth import extract_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.exercise import Exercise
from app.models.user import User
from app.schemas.exercise import ExerciseCreate, ExerciseRead
from sqlalchemy.orm import Session

router = APIRouter()


@router.get("/", response_model=list[ExerciseRead])
def list_exercises(
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    db: Session = Depends(get_db),
) -> list[ExerciseRead]:
    return [
        ExerciseRead(
            id=exercise.id,
            created_by=exercise.created_by,
            name=exercise.name,
            description=exercise.description,
            reference_video_key=exercise.reference_video_key,
            joint_tolerances=exercise.joint_tolerances,
        )
        for exercise in db.query(Exercise).all()
    ]


@router.post("/", response_model=ExerciseRead, status_code=201)
def create_exercise(
    payload: ExerciseCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ExerciseRead:
    exercise = Exercise(created_by=user.id, **payload.model_dump())
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return ExerciseRead.model_validate(exercise, from_attributes=True)


@router.get("/{exercise_id}", response_model=ExerciseRead)
def get_exercise(
    exercise_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    db: Session = Depends(get_db),
) -> ExerciseRead:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return ExerciseRead.model_validate(exercise, from_attributes=True)


@router.put("/{exercise_id}", response_model=ExerciseRead)
def update_exercise(
    exercise_id: UUID,
    payload: ExerciseCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ExerciseRead:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if Role.ADMIN.value not in extract_roles(claims) and exercise.created_by != user.id:
        raise HTTPException(status_code=403, detail="You can edit only your exercises")

    for field, value in payload.model_dump().items():
        setattr(exercise, field, value)
    db.commit()
    db.refresh(exercise)
    return ExerciseRead.model_validate(exercise, from_attributes=True)


@router.delete("/{exercise_id}", status_code=204)
def delete_exercise(
    exercise_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> None:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if Role.ADMIN.value not in extract_roles(claims) and exercise.created_by != user.id:
        raise HTTPException(status_code=403, detail="You can delete only your exercises")

    db.delete(exercise)
    db.commit()
