from fastapi import APIRouter

from app.api.v1.endpoints import assignments, auth, exercises, patients, sessions

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(patients.router, prefix="/patients", tags=["patients"])
api_router.include_router(exercises.router, prefix="/exercises", tags=["exercises"])
api_router.include_router(assignments.router, prefix="/assignments", tags=["assignments"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
