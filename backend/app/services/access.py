from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.models.patient import Patient
from app.models.user import User
from app.schemas.patient import PatientRead


def _has_access(patient: Patient, user: User, roles: set[str]) -> bool:
    if Role.ADMIN.value in roles:
        return True

    if Role.THERAPIST.value in roles and any(
        therapist.id == user.id for therapist in patient.therapists
    ):
        return True

    return Role.PATIENT.value in roles and patient.user_id == user.id


def _to_schema(patient: Patient) -> PatientRead:
    return PatientRead(
        id=patient.id,
        user_id=patient.user_id,
        therapist_ids=[therapist.id for therapist in patient.therapists],
        first_name=patient.first_name,
        last_name=patient.last_name,
        date_of_birth=patient.date_of_birth,
        notes=patient.notes,
    )


def can_access_patient_id(
    patient_id: UUID | None,
    user: User,
    roles: set[str],
    db: Session,
) -> bool:
    if Role.ADMIN.value in roles:
        return True

    patient = db.get(Patient, patient_id) if patient_id else None
    return patient is not None and _has_access(patient, user, roles)


def require_patient_access(
    patient_id: UUID,
    user: User,
    roles: set[str],
    db: Session,
) -> PatientRead:
    patient = db.get(Patient, patient_id)

    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    if not _has_access(patient, user, roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return _to_schema(patient)
