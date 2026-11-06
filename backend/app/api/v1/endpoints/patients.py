from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.auth import extract_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.patient import Patient
from app.models.user import User
from app.schemas.patient import PatientCreate, PatientRead
from app.services.access import require_patient_access
from app.services.doctor_access import get_patient_for_therapist

router = APIRouter()


@router.get("/", response_model=list[PatientRead])
def list_patients(
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[PatientRead]:
    query = db.query(Patient)
    if Role.ADMIN.value not in extract_roles(claims):
        query = query.filter(Patient.therapists.any(User.id == user.id))
    return [
        PatientRead(
            id=patient.id,
            user_id=patient.user_id,
            therapist_ids=[therapist.id for therapist in patient.therapists],
            first_name=patient.first_name,
            last_name=patient.last_name,
            date_of_birth=patient.date_of_birth,
            notes=patient.notes,
        )
        for patient in query.all()
    ]


@router.post("/", response_model=PatientRead, status_code=201)
def create_patient(
    payload: PatientCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientRead:
    if db.get(User, payload.user_id) is None:
        raise HTTPException(status_code=404, detail="Patient user not found")
    if db.query(Patient).filter(Patient.user_id == payload.user_id).first():
        raise HTTPException(status_code=409, detail="Patient profile already exists")
    patient = Patient(
        user_id=payload.user_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        date_of_birth=payload.date_of_birth,
        notes=payload.notes,
    )
    therapist_ids = set(payload.therapist_ids)
    if user.role != Role.ADMIN.value:
        therapist_ids.add(user.id)
    if therapist_ids:
        therapists = (
            db.query(User)
            .filter(User.id.in_(therapist_ids), User.role == Role.THERAPIST.value)
            .all()
        )
        if len(therapists) != len(therapist_ids):
            raise HTTPException(status_code=404, detail="Therapist not found")
        patient.therapists = therapists
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return PatientRead(
        id=patient.id,
        user_id=patient.user_id,
        therapist_ids=[therapist.id for therapist in patient.therapists],
        first_name=patient.first_name,
        last_name=patient.last_name,
        date_of_birth=patient.date_of_birth,
        notes=patient.notes,
    )


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(
    patient_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientRead:
    return require_patient_access(patient_id, user, extract_roles(claims), db)


@router.get("/{patient_id}/therapists", response_model=list[dict[str, str]])
def list_patient_therapists(
    patient_id: UUID,
    claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)
    ),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[dict[str, str]]:
    patient = require_patient_access(patient_id, user, extract_roles(claims), db)
    return [
        {"id": str(therapist_id), "role": Role.THERAPIST.value}
        for therapist_id in patient.therapist_ids
    ]


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_patient_from_therapist_list(
    patient_id: UUID,
    _claims: dict[str, Any] = Depends(require_roles(Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> None:
    patient = get_patient_for_therapist(patient_id, user, db)
    patient.therapists = [
        therapist for therapist in patient.therapists if therapist.id != user.id
    ]
    db.commit()
