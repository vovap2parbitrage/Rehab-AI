from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.comparison_auth import require_user_id
from app.api.deps import get_current_active_user
from app.db.dependencies import get_db
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


@router.post("", response_model=ComparisonCreated, status_code=status.HTTP_202_ACCEPTED)
def create_comparison(
    req: ComparisonRequest,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    svc=Depends(get_comparison_service),
):
    job = prepare_comparison(db, req, user)
    return ComparisonCreated(task_id=svc.submit_comparison(job, str(user.id)))


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
