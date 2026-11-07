from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.models.user import User
from app.schemas.exercise import ExerciseCreate, ExerciseRead


def _to_read(exercise: Exercise) -> ExerciseRead:
    return ExerciseRead.model_validate(exercise, from_attributes=True)


def list_exercises(db: Session) -> list[ExerciseRead]:
    return [_to_read(exercise) for exercise in db.query(Exercise).all()]


def create_exercise(
    db: Session,
    payload: ExerciseCreate,
    user: User,
) -> ExerciseRead:
    exercise = Exercise(created_by=user.id, **payload.model_dump())
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return _to_read(exercise)


def get_exercise(db: Session, exercise_id: UUID) -> ExerciseRead:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return _to_read(exercise)


def update_exercise(
    db: Session,
    exercise_id: UUID,
    payload: ExerciseCreate,
    user: User,
    roles: set[str],
) -> ExerciseRead:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if Role.ADMIN.value not in roles and exercise.created_by != user.id:
        raise HTTPException(status_code=403, detail="You can edit only your exercises")

    for field, value in payload.model_dump().items():
        setattr(exercise, field, value)
    db.commit()
    db.refresh(exercise)
    return _to_read(exercise)


def delete_exercise(
    db: Session,
    exercise_id: UUID,
    user: User,
    roles: set[str],
) -> None:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if Role.ADMIN.value not in roles and exercise.created_by != user.id:
        raise HTTPException(status_code=403, detail="You can delete only your exercises")
    if (
        db.query(Assignment.id)
        .filter(Assignment.exercise_id == exercise.id)
        .first()
        is not None
    ):
        raise HTTPException(
            status_code=409,
            detail="Cannot delete an exercise assigned to a patient",
        )

    db.delete(exercise)
    db.commit()
