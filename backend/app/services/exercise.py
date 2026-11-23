import copy
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.core.statuses import AssignmentStatus
from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.models.exercise_version import ExerciseVersion
from app.models.session import TrainingSession
from app.models.user import User
from app.schemas.comparison import MAX_TOLERANCE_DEG
from app.schemas.exercise import ExerciseCreate, ExerciseRead, ExerciseUpdate, ScoringOptions
from app.schemas.pagination import Page
from app.services.comparison.angles import BODY_PARTS
from app.services.comparison.scoring import DEFAULT_TOLERANCE
from app.services import storage
from app.services.patient_access import get_patient_profile

# What a video analysis is scored against. A change to any of these makes a new version.
SCORING_FIELDS = ("reference_video_key", "body_parts", "joint_tolerances")


def _read_many(db: Session, exercises: list[Exercise]) -> list[ExerciseRead]:
    """Exercises with their current version, assignment counts and hidden flag."""
    ids = [exercise.id for exercise in exercises]
    versions = dict(
        db.query(ExerciseVersion.exercise_id, func.max(ExerciseVersion.version))
        .filter(ExerciseVersion.exercise_id.in_(ids))
        .group_by(ExerciseVersion.exercise_id)
        .all()
    )
    active = dict(
        db.query(Assignment.exercise_id, func.count(Assignment.id))
        .filter(
            Assignment.exercise_id.in_(ids),
            Assignment.status == AssignmentStatus.ACTIVE.value,
        )
        .group_by(Assignment.exercise_id)
        .all()
    )
    totals = dict(
        db.query(Assignment.exercise_id, func.count(Assignment.id))
        .filter(Assignment.exercise_id.in_(ids))
        .group_by(Assignment.exercise_id)
        .all()
    )
    return [
        ExerciseRead.model_validate(exercise, from_attributes=True).model_copy(
            update={
                # An exercise nobody has used yet may not have a version row.
                "version": versions.get(exercise.id, 1),
                "active_assignments": active.get(exercise.id, 0),
                "assignments_total": totals.get(exercise.id, 0),
            }
        )
        for exercise in exercises
    ]


def _read_one(db: Session, exercise: Exercise) -> ExerciseRead:
    return _read_many(db, [exercise])[0]


def _latest_version(db: Session, exercise: Exercise) -> ExerciseVersion | None:
    return (
        db.query(ExerciseVersion)
        .filter(ExerciseVersion.exercise_id == exercise.id)
        .order_by(ExerciseVersion.version.desc())
        .first()
    )


def _add_version(db: Session, exercise: Exercise, number: int) -> ExerciseVersion:
    version = ExerciseVersion(
        exercise_id=exercise.id,
        version=number,
        **{field: copy.deepcopy(getattr(exercise, field)) for field in SCORING_FIELDS},
    )
    db.add(version)
    db.flush()
    return version


def current_version(db: Session, exercise: Exercise) -> ExerciseVersion:
    """The newest version of the exercise (version 1 is created if there is none yet)."""
    return _latest_version(db, exercise) or _add_version(db, exercise, 1)


def video_in_use(db: Session, key: str) -> bool:
    """True if the exercise or any of its versions still uses this reference video."""
    return (
        db.query(Exercise.id).filter(Exercise.reference_video_key == key).first() is not None
        or db.query(ExerciseVersion.id)
        .filter(ExerciseVersion.reference_video_key == key)
        .first()
        is not None
    )


def _prune_unused_versions(db: Session, exercise: Exercise, keep: ExerciseVersion) -> set[str]:
    """Drop older versions no assignment or session uses; returns their video keys."""
    older = (
        db.query(ExerciseVersion)
        .filter(ExerciseVersion.exercise_id == exercise.id, ExerciseVersion.id != keep.id)
        .all()
    )
    ids = [version.id for version in older]
    if not ids:
        return set()
    in_use = {
        row[0]
        for row in db.query(Assignment.exercise_version_id).filter(
            Assignment.exercise_version_id.in_(ids)
        )
    } | {
        row[0]
        for row in db.query(TrainingSession.exercise_version_id).filter(
            TrainingSession.exercise_version_id.in_(ids)
        )
    }
    keys: set[str] = set()
    for version in older:
        if version.id not in in_use:
            if version.reference_video_key:
                keys.add(version.reference_video_key)
            db.delete(version)
    return keys


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
    if video_in_use(db, key):
        return
    try:
        storage.delete_video(key)
    except storage.StorageError as exc:
        raise HTTPException(
            status_code=502,
            detail="Exercise was saved, but the previous video could not be deleted",
        ) from exc


def list_exercises(
    db: Session,
    user: User,
    roles: set[str],
    *,
    q: str | None = None,
    hidden: bool = False,
    limit: int = 20,
    offset: int = 0,
) -> Page[ExerciseRead]:
    """The library, or with ``hidden=True`` the exercises the therapist has hidden."""
    query = db.query(Exercise)
    if Role.ADMIN.value not in roles:
        query = query.filter(Exercise.created_by == user.id)
    query = query.filter(
        Exercise.hidden_at.is_not(None) if hidden else Exercise.hidden_at.is_(None)
    )
    if q and q.strip():
        query = query.filter(Exercise.name.ilike(f"%{q.strip()}%"))
    total = query.count()
    exercises = (
        query.order_by(func.lower(Exercise.name), Exercise.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return Page(
        items=_read_many(db, exercises),
        total=total,
        limit=limit,
        offset=offset,
    )


def create_exercise(
    db: Session,
    payload: ExerciseCreate,
    user: User,
    roles: set[str],
) -> ExerciseRead:
    _check_video_key(payload.reference_video_key, user, roles)
    exercise = Exercise(created_by=user.id, **payload.model_dump())
    db.add(exercise)
    db.flush()
    _add_version(db, exercise, 1)
    db.commit()
    db.refresh(exercise)
    return _read_one(db, exercise)


def get_exercise(
    db: Session,
    exercise_id: UUID,
    user: User,
    roles: set[str],
) -> ExerciseRead:
    exercise = db.get(Exercise, exercise_id)
    
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if Role.ADMIN.value not in roles and exercise.created_by != user.id:
        raise HTTPException(status_code=403, detail="You can see only your exercises")

    return _read_one(db, exercise)

def update_exercise(
    db: Session,
    exercise_id: UUID,
    payload: ExerciseUpdate,
    user: User,
    roles: set[str],
) -> ExerciseRead:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if Role.ADMIN.value not in roles and exercise.created_by != user.id:
        raise HTTPException(status_code=403, detail="You can edit only your exercises")
    if payload.reference_video_key is None:
        raise HTTPException(status_code=422, detail="A reference video is required")
    if payload.reference_video_key != exercise.reference_video_key:
        _check_video_key(payload.reference_video_key, user, roles)

    latest = current_version(db, exercise)  # the state before this edit
    old_video_key = exercise.reference_video_key

    for field, value in payload.model_dump(exclude={"apply_to_active_assignments"}).items():
        setattr(exercise, field, value)

    # Name and description are fixed in place; a change to what the analysis is scored
    # against starts a new version.
    if any(getattr(exercise, field) != getattr(latest, field) for field in SCORING_FIELDS):
        latest = _add_version(db, exercise, latest.version + 1)
    if payload.apply_to_active_assignments:
        db.query(Assignment).filter(
            Assignment.exercise_id == exercise.id,
            Assignment.status == AssignmentStatus.ACTIVE.value,
        ).update({"exercise_version_id": latest.id}, synchronize_session=False)

    unused_keys = _prune_unused_versions(db, exercise, keep=latest)
    db.commit()
    db.refresh(exercise)
    for key in unused_keys | {old_video_key}:
        if key != exercise.reference_video_key:
            _delete_video_if_unreferenced(db, key)
    return _read_one(db, exercise)


def _own_exercise(db: Session, exercise_id: UUID, user: User, roles: set[str]) -> Exercise:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if Role.ADMIN.value not in roles and exercise.created_by != user.id:
        raise HTTPException(status_code=403, detail="You can change only your exercises")
    return exercise


def hide_exercise(db: Session, exercise_id: UUID, user: User, roles: set[str]) -> None:
    """Take the exercise out of the library. Existing assignments keep working."""
    exercise = _own_exercise(db, exercise_id, user, roles)
    if exercise.hidden_at is None:
        exercise.hidden_at = datetime.now(UTC)
        db.commit()


def restore_exercise(db: Session, exercise_id: UUID, user: User, roles: set[str]) -> None:
    exercise = _own_exercise(db, exercise_id, user, roles)
    if exercise.hidden_at is not None:
        exercise.hidden_at = None
        db.commit()


def scoring_options() -> ScoringOptions:
    return ScoringOptions(
        joints_by_body_part={part: list(joints) for part, joints in BODY_PARTS.items()},
        default_tolerance_deg=DEFAULT_TOLERANCE,
        max_tolerance_deg=MAX_TOLERANCE_DEG,
    )


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
    keys = {exercise.reference_video_key} | {v.reference_video_key for v in exercise.versions}
    for key in keys - {None}:
        storage.delete_video(key)

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

    video_key = exercise.reference_video_key
    if Role.ADMIN.value not in roles:
        # Keycloak gives every account the default "patient" role, so a therapist's
        # token carries both roles. Check the higher role first, like login does.
        if Role.THERAPIST.value in roles:
            if exercise.created_by != user.id:
                raise HTTPException(status_code=403, detail="You cannot view this exercise")
        else:
            patient = get_patient_profile(db, user)
            # The patient sees the video their own assignment is scored against: the
            # active one if there is one, otherwise the most recent.
            assigned = (
                db.query(Assignment)
                .filter(
                    Assignment.patient_id == patient.id,
                    Assignment.exercise_id == exercise.id,
                )
                .order_by(
                    (Assignment.status == AssignmentStatus.ACTIVE.value).desc(),
                    Assignment.starts_on.desc(),
                )
                .first()
            )
            if assigned is None:
                raise HTTPException(
                    status_code=403,
                    detail="You can view only exercises assigned to you",
                )
            video_key = assigned.exercise_version.reference_video_key

    if not video_key:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        return storage.create_video_url(video_key)
    except storage.StorageError as exc:
        raise HTTPException(status_code=502, detail="Could not open video") from exc