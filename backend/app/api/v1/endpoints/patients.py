from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.auth import extract_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.history import HistoryPeriod, PatientHistoryRead
from app.schemas.patient import PatientCreate, PatientRead
from app.services import history, patient

router = APIRouter()


@router.get("/", response_model=list[PatientRead])
def list_patients(
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[PatientRead]:
    return patient.list_patients(
        db,
        is_admin=Role.ADMIN.value in extract_roles(claims),
        therapist_id=user.id,
    )


@router.post("/", response_model=PatientRead, status_code=201)
def create_patient(
    payload: PatientCreate,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientRead:
    return patient.create_patient(db, payload)


@router.get("/me/history", response_model=PatientHistoryRead)
def get_my_history(
    period: HistoryPeriod = HistoryPeriod.last_30_days,
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientHistoryRead:
    return history.get_my_history(db, user, period)


@router.get("/{patient_id}/history", response_model=PatientHistoryRead)
def get_patient_history(
    patient_id: UUID,
    period: HistoryPeriod = HistoryPeriod.last_30_days,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientHistoryRead:
    return history.get_patient_history(db, patient_id, user, extract_roles(claims), period)


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(
    patient_id: UUID,
    claims: dict[str, Any] = Depends(require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientRead:
    return patient.get_patient(db, patient_id, user, extract_roles(claims))


@router.get("/{patient_id}/therapists", response_model=list[dict[str, str]])
def list_patient_therapists(
    patient_id: UUID,
    claims: dict[str, Any] = Depends(
        require_roles(Role.ADMIN, Role.THERAPIST, Role.PATIENT)
    ),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[dict[str, str]]:
    return patient.list_patient_therapists(
        db, patient_id, user, extract_roles(claims)
    )


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_patient_from_therapist_list(
    patient_id: UUID,
    _claims: dict[str, Any] = Depends(require_roles(Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> None:
    patient.remove_patient_from_therapist(db, patient_id, user)
