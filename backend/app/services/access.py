from uuid import UUID

from fastapi import HTTPException, status

from app.core.roles import Role
from app.models.user import User
from app.schemas.patient import PatientRead
from app.services import demo_store


def _has_access(patient: PatientRead, user: User, roles: set[str]) -> bool:
    if Role.ADMIN.value in roles:
        return True

    if Role.THERAPIST.value in roles and patient.therapist_id == user.id:
        return True

    return Role.PATIENT.value in roles and patient.user_id == user.id


def can_access_patient_id(patient_id: UUID | None, user: User, roles: set[str]) -> bool:
    if Role.ADMIN.value in roles:
        return True

    patient = demo_store.patients.get(patient_id) if patient_id else None
    return patient is not None and _has_access(patient, user, roles)


def require_patient_access(patient_id: UUID, user: User, roles: set[str]) -> PatientRead:
    patient = demo_store.patients.get(patient_id)

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

    return patient
