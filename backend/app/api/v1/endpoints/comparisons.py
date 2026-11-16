from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.comparison_auth import require_user_id
from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.exercise import Exercise
from app.models.user import User
from app.schemas.comparison import (
    ComparisonCreated,
    ComparisonRequest,
    ComparisonResult,
    UploadRequest,
    UploadTarget,
)
from app.services import comparison_service, storage
from app.services.comparison_assignment import prepare_comparison

router = APIRouter()


def get_comparison_service():
    return comparison_service


def get_storage():
    return storage


@router.post("/uploads", response_model=UploadTarget)
def create_upload(
    req: UploadRequest,
    user_id: str = Depends(require_user_id),
    store=Depends(get_storage),
):
    """Presigned POST so the client uploads the video straight to storage."""
    return store.create_upload(user_id, req.content_type)


@router.delete("/uploads", status_code=status.HTTP_204_NO_CONTENT)
def delete_unreferenced_upload(
    key: str,
    _claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
    store=Depends(get_storage),
) -> None:
    if not store.is_owned_key(key, user_id):
        raise HTTPException(status_code=403, detail="Video does not belong to you")

    referenced = (
        db.query(Exercise.id)
        .filter(Exercise.reference_video_key == key)
        .first()
    )
    if referenced is not None:
        raise HTTPException(status_code=409, detail="Video is already in use")

    try:
        store.delete_video(key)
    except store.StorageError as exc:
        raise HTTPException(
            status_code=502, detail="Could not delete the uploaded video"
        ) from exc


@router.post("", response_model=ComparisonCreated, status_code=status.HTTP_202_ACCEPTED)
def create_comparison(
    req: ComparisonRequest,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    svc=Depends(get_comparison_service),
    store=Depends(get_storage),
):
    try:
        job = prepare_comparison(db, req, user)
    except HTTPException:
        # The request was refused, so the patient's upload will never be used.
        _discard_upload(store, req.patient_key, str(user.id))
        raise
    return ComparisonCreated(task_id=svc.submit_comparison(job, str(user.id)))


def _discard_upload(store, key: str, user_id: str) -> None:
    """Delete the caller's own unused upload; failures are not worth reporting."""
    if not store.is_owned_key(key, user_id):
        return
    try:
        store.delete_video(key)
    except store.StorageError:
        pass


@router.get("/{task_id}", response_model=ComparisonResult)
def read_comparison(
    task_id: str,
    user_id: str = Depends(require_user_id),
    svc=Depends(get_comparison_service),
):
    result = svc.get_comparison(task_id, user_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comparison not found")
    return result
