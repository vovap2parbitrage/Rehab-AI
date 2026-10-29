from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request

from app.api.deps import get_current_active_user, require_roles
from app.core.auth import extract_roles
from app.core.roles import Role
from app.models.user import User
from app.schemas.patient import PatientCreate, PatientRead
from app.services import demo_store
from app.services.access import require_patient_access

router = APIRouter()


@router.get("/", response_model=list[PatientRead])
def list_patients(
    request: Request,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
) -> list[PatientRead]:
    return list(demo_store.patients.values())


@router.post("/", response_model=PatientRead, status_code=201)
def create_patient(
    payload: PatientCreate,
    request: Request,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
) -> PatientRead:
    patient = PatientRead(**payload.model_dump())
    demo_store.patients[patient.id] = patient
    return patient


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(
    patient_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
) -> PatientRead:
    return require_patient_access(patient_id, user, extract_roles(claims))
