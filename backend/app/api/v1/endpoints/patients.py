from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import require_roles
from app.core.roles import Role
from app.schemas.patient import PatientCreate, PatientRead

router = APIRouter()
_demo_patients: dict[UUID, PatientRead] = {}


@router.get("/", response_model=list[PatientRead])
def list_patients(
    request: Request,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
) -> list[PatientRead]:
    return list(_demo_patients.values())


@router.post("/", response_model=PatientRead, status_code=201)
def create_patient(
    payload: PatientCreate,
    request: Request,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
) -> PatientRead:
    patient = PatientRead(**payload.model_dump())
    _demo_patients[patient.id] = patient
    return patient


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(
    patient_id: UUID,
    request: Request,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
) -> PatientRead:
    patient = _demo_patients.get(patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient
