from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.auth import extract_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.exercise import ExerciseCreate, ExerciseRead, ExerciseUpdate, ScoringOptions
from app.schemas.pagination import Page
from app.services import exercise

router = APIRouter()


@router.get("/", response_model=Page[ExerciseRead])
def list_exercises(
    q: str | None = None,
    hidden: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST)
    ),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Page[ExerciseRead]:
    return exercise.list_exercises(
        db, user, extract_roles(claims), q=q, hidden=hidden, limit=limit, offset=offset
    )


@router.get("/scoring-options", response_model=ScoringOptions)
def scoring_options(
    _claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
) -> ScoringOptions:
    return exercise.scoring_options()

@router.post("/", response_model=ExerciseRead, status_code=201)
def create_exercise(
    payload: ExerciseCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ExerciseRead:
    return exercise.create_exercise(db, payload, user, extract_roles(claims))


@router.get("/{exercise_id}", response_model=ExerciseRead)
def get_exercise(
    exercise_id: UUID,
    claims: dict[str, Any] = Depends(
            require_roles(Role.ADMIN, Role.THERAPIST)
        ),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> ExerciseRead:
    return exercise.get_exercise(db, exercise_id, user, extract_roles(claims))


@router.put("/{exercise_id}", response_model=ExerciseRead)
def update_exercise(
    exercise_id: UUID,
    payload: ExerciseUpdate,
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

@router.get("/{exercise_id}/video")
def get_exercise_video(
    exercise_id: UUID,
    claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)
    ),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    return {
        "url": exercise.get_exercise_video_url(
            db, exercise_id, user, extract_roles(claims)
        )
    }


@router.post("/{exercise_id}/hide", status_code=status.HTTP_204_NO_CONTENT)
def hide_exercise(
    exercise_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> None:
    exercise.hide_exercise(db, exercise_id, user, extract_roles(claims))


@router.post("/{exercise_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_exercise(
    exercise_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> None:
    exercise.restore_exercise(db, exercise_id, user, extract_roles(claims))
