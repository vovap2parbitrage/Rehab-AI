from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.services import storage

from app.core.roles import Role
from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.models.patient import Patient
from app.models.user import User
from app.schemas.exercise import ExerciseCreate, ExerciseRead


def _to_read(exercise: Exercise) -> ExerciseRead:
    return ExerciseRead.model_validate(exercise, from_attributes=True)


def _check_video_key(key: str | None, user: User, roles: set[str]) -> None:
    if key is None:
        raise HTTPException(status_code=422, detail="A reference video is required")
    if not storage.is_valid_key(key):
        raise HTTPException(status_code=422, detail="Invalid reference video key")
    if (
        Role.ADMIN.value not in roles
        and not storage.is_owned_key(key, str(user.id))
    ):
        raise HTTPException(status_code=403, detail="Video does not belong to you")


def _delete_video_if_unreferenced(db: Session, key: str | None) -> None:
    if not key or not storage.is_valid_key(key):
        return
    referenced = (
        db.query(Exercise.id)
        .filter(Exercise.reference_video_key == key)
        .first()
    )
    if referenced is not None:
        return
    try:
        storage.delete_video(key)
    except storage.StorageError as exc:
        raise HTTPException(
            status_code=502,
            detail="Exercise was saved, but the previous video could not be deleted",
        ) from exc


def list_exercises(db: Session) -> list[ExerciseRead]:
    return [_to_read(exercise) for exercise in db.query(Exercise).all()]


def create_exercise(
    db: Session,
    payload: ExerciseCreate,
    user: User,
    roles: set[str],
) -> ExerciseRead:
    _check_video_key(payload.reference_video_key, user, roles)
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
    old_video_key = exercise.reference_video_key
    if payload.reference_video_key is None:
        raise HTTPException(status_code=422, detail="A reference video is required")
    if payload.reference_video_key != exercise.reference_video_key:
        _check_video_key(payload.reference_video_key, user, roles)

    for field, value in payload.model_dump().items():
        setattr(exercise, field, value)
    db.commit()
    db.refresh(exercise)
    if old_video_key != exercise.reference_video_key:
        _delete_video_if_unreferenced(db, old_video_key)
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
    if exercise.reference_video_key:
        storage.delete_video(exercise.reference_video_key)

    db.delete(exercise)
    db.commit()


def get_exercise_video_url(
    db: Session,
    exercise_id: UUID,
    user: User,
    roles: set[str],
) -> str:
    exercise = db.get(Exercise, exercise_id)

    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")

    if Role.ADMIN.value not in roles:
        if Role.PATIENT.value in roles:
            patient = db.query(Patient).filter(Patient.user_id == user.id).first()
            if patient is None:
                raise HTTPException(status_code=404, detail="Patient profile not found")
            assigned = (
                db.query(Assignment.id)
                .filter(
                    Assignment.patient_id == patient.id,
                    Assignment.exercise_id == exercise.id,
                )
                .first()
            )
            if assigned is None:
                raise HTTPException(
                    status_code=403,
                    detail="You can view only exercises assigned to you",
                )
        elif exercise.created_by != user.id:
            raise HTTPException(status_code=403, detail="You cannot view this exercise")

    if not exercise.reference_video_key:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        return storage.create_video_url(exercise.reference_video_key)
    except storage.StorageError as exc:
        raise HTTPException(status_code=502, detail="Could not open video") from exc