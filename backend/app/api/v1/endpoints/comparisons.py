from fastapi import APIRouter, Depends, HTTPException, status

from app.api.comparison_auth import require_user_id
from app.schemas.comparison import (
    ComparisonCreated,
    ComparisonRequest,
    ComparisonResult,
    UploadRequest,
    UploadTarget,
)
from app.services import comparison_service, storage

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
    user_id: str = Depends(require_user_id),
    svc=Depends(get_comparison_service),
):
    # TODO(after merging main): resolve the reference video from the assigned exercise
    # and check the user may access that patient; for now both videos must be the caller's.
    for key in (req.reference_key, req.patient_key):
        if not storage.is_owned_key(key, user_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Video does not belong to you")
    return ComparisonCreated(task_id=svc.submit_comparison(req, user_id))


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
