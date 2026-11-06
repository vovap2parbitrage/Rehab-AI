from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.models.patient import Patient
from app.models.user import User


def get_patient_for_therapist(
    patient_id: UUID,
    user: User,
    db: Session,
) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if user.role != Role.ADMIN.value and not any(
        therapist.id == user.id for therapist in patient.therapists
    ):
        raise HTTPException(status_code=403, detail="Patient is not assigned to you")
    return patient


def get_patient_for_user(patient_id: UUID, user: User, db: Session) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if user.role == Role.ADMIN.value:
        return patient
    if user.role == Role.THERAPIST.value and any(
        therapist.id == user.id for therapist in patient.therapists
    ):
        return patient
    if user.role == Role.PATIENT.value and patient.user_id == user.id:
        return patient
    raise HTTPException(status_code=403, detail="Access denied")
