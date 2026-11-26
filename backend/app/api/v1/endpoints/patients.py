from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.history import HistoryPeriod, PatientHistoryRead
from app.schemas.pagination import Page
from app.schemas.patient import PatientCreate, PatientRead
from app.services import history, patient

router = APIRouter()


@router.get("/", response_model=Page[PatientRead])
def list_patients(
    archived: bool = False,
    q: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> Page[PatientRead]:
    return patient.list_patients(
        db,
        therapist_id=user.id,
        archived=archived,
        q=q,
        limit=limit,
        offset=offset,
    )


@router.post("/", response_model=PatientRead, status_code=201)
def create_patient(
    payload: PatientCreate,
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> PatientRead:
    return patient.create_patient(db, payload, user)


@router.get("/me/history", response_model=PatientHistoryRead)
def get_my_history(
    period: HistoryPeriod = HistoryPeriod.last_30_days,
    user: User = Depends(require_roles(Role.PATIENT)),
    db: Session = Depends(get_db),
) -> PatientHistoryRead:
    return history.get_my_history(db, user, period)


@router.get("/{patient_id}/history", response_model=PatientHistoryRead)
def get_patient_history(
    patient_id: UUID,
    period: HistoryPeriod = HistoryPeriod.last_30_days,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientHistoryRead:
    return history.get_patient_history(db, patient_id, user, period)


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(
    patient_id: UUID,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientRead:
    return patient.get_patient(db, patient_id, user)


@router.get("/{patient_id}/therapists", response_model=list[dict[str, str]])
def list_patient_therapists(
    patient_id: UUID,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[dict[str, str]]:
    return patient.list_patient_therapists(db, patient_id, user)


@router.post("/{patient_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_patient(
    patient_id: UUID,
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> None:
    patient.archive_patient(db, patient_id, user)


@router.post("/{patient_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_patient(
    patient_id: UUID,
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> None:
    patient.restore_patient(db, patient_id, user)
