from fastapi import APIRouter, Depends, status

from app.schemas.comparison import ComparisonCreated, ComparisonRequest, ComparisonResult
from app.services import video_service

router = APIRouter()