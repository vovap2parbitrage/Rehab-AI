from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.models.patient import Patient
from app.models.patient_therapist import patient_therapist_table
from app.models.user import User
from app.schemas.patient import PatientRead


def is_patient_therapist(patient: Patient, user: User) -> bool:
    """True if the user is one of the patient's therapists."""
    return any(therapist.id == user.id for therapist in patient.therapists)


def treated_by(therapist_id: UUID | None):
    """SQL condition: the patient is on this therapist's active list (not archived)."""
    return Patient.therapists.any(
        and_(
            User.id == therapist_id,
            patient_therapist_table.c.archived_at.is_(None),
        )
    )


def archived_by(therapist_id: UUID | None):
    """SQL condition: this therapist has archived the patient."""
    return Patient.therapists.any(
        and_(
            User.id == therapist_id,
            patient_therapist_table.c.archived_at.is_not(None),
        )
    )


def archived_at_for(db: Session, patient_id: UUID, therapist_id: UUID) -> datetime | None:
    """When this therapist archived the patient, or None if not archived (or not linked)."""
    return db.execute(
        select(patient_therapist_table.c.archived_at).where(
            patient_therapist_table.c.patient_id == patient_id,
            patient_therapist_table.c.therapist_id == therapist_id,
        )
    ).scalar_one_or_none()


def require_not_archived(db: Session, patient_id: UUID, user: User) -> None:
    if archived_at_for(db, patient_id, user.id) is not None:
        raise HTTPException(status_code=409, detail="Patient is archived. Restore the patient first")


def get_patient_profile(db: Session, user: User) -> Patient:
    """The patient profile of a logged-in patient, or 404."""
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient profile not found")
    return patient


def _has_access(patient: Patient, user: User, roles: set[str]) -> bool:
    if Role.ADMIN.value in roles:
        return True

    if Role.THERAPIST.value in roles and is_patient_therapist(patient, user):
        return True

    return Role.PATIENT.value in roles and patient.user_id == user.id


def _to_schema(patient: Patient, archived_at: datetime | None = None) -> PatientRead:
    return PatientRead(
        id=patient.id,
        user_id=patient.user_id,
        therapist_ids=[therapist.id for therapist in patient.therapists],
        first_name=patient.first_name,
        last_name=patient.last_name,
        date_of_birth=patient.date_of_birth,
        notes=patient.notes,
        archived_at=archived_at,
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    if not _has_access(patient, user, roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _to_schema(patient, archived_at_for(db, patient.id, user.id))


def get_patient_for_therapist(
    patient_id: UUID,
    user: User,
    db: Session,
) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if user.role != Role.ADMIN.value and not is_patient_therapist(patient, user):
        raise HTTPException(status_code=403, detail="Patient is not assigned to you")
    return patient


def get_patient_for_user(patient_id: UUID, user: User, db: Session) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if user.role == Role.ADMIN.value:
        return patient
    if user.role == Role.THERAPIST.value and is_patient_therapist(patient, user):
        return patient
    if user.role == Role.PATIENT.value and patient.user_id == user.id:
        return patient
    raise HTTPException(status_code=403, detail="Access denied")
