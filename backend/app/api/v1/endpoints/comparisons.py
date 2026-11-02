from fastapi import APIRouter, Depends, status

from app.schemas.comparison import ComparisonCreated, ComparisonRequest, ComparisonResult
from app.services import video_service

router = APIRouter()


def get_video_service():
    return video_service


@router.post("", response_model=ComparisonCreated, status_code=status.HTTP_202_ACCEPTED)
def create_comparison(req: ComparisonRequest, svc=Depends(get_video_service)):
    return ComparisonCreated(task_id=svc.submit_comparison(req))


@router.get("/{task_id}", response_model=ComparisonResult)
def read_comparison(task_id: str, svc = Depends(get_video_service)):
    return svc.get_comparison(task_id)
