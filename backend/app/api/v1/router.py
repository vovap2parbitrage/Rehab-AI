from fastapi import APIRouter

from app.api.v1.endpoints import (
    assignments,
    auth,
    comparisons,
    exercises,
    patient_workspace,
    invitations,
    patients,
    sessions,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(patients.router, prefix="/patients", tags=["patients"])
api_router.include_router(
    patient_workspace.router,
    prefix="/patient-workspace",
    tags=["patient workspace"],
)
api_router.include_router(invitations.router, prefix="/invitations", tags=["invitations"])
api_router.include_router(exercises.router, prefix="/exercises", tags=["exercises"])
api_router.include_router(assignments.router, prefix="/assignments", tags=["assignments"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(comparisons.router, prefix="/comparisons", tags=["comparisons"])
