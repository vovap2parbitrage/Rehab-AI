from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.models.patient import Patient
from app.models.user import User
from app.schemas.patient import PatientCreate, PatientRead
from app.services.access import require_patient_access


def _to_read(patient: Patient) -> PatientRead:
    return PatientRead(
        id=patient.id,
        user_id=patient.user_id,
        therapist_ids=[therapist.id for therapist in patient.therapists],
        first_name=patient.first_name,
        last_name=patient.last_name,
        date_of_birth=patient.date_of_birth,
        notes=patient.notes,
    )


def list_patients(db: Session, *, is_admin: bool, therapist_id: UUID | None) -> list[PatientRead]:
    query = db.query(Patient)
    if not is_admin:
        query = query.filter(Patient.therapists.any(User.id == therapist_id))
    return [_to_read(patient) for patient in query.all()]


def create_patient(db: Session, payload: PatientCreate) -> PatientRead:
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
    return _to_read(patient)


def get_patient(
    db: Session,
    patient_id: UUID,
    user: User,
    roles: set[str],
) -> PatientRead:
    return require_patient_access(patient_id, user, roles, db)


def list_patient_therapists(
    db: Session,
    patient_id: UUID,
    user: User,
    roles: set[str],
) -> list[dict[str, str]]:
    patient = require_patient_access(patient_id, user, roles, db)
    return [
        {"id": str(therapist_id), "role": Role.THERAPIST.value}
        for therapist_id in patient.therapist_ids
    ]


def remove_patient_from_therapist(
    db: Session,
    patient_id: UUID,
    user: User,
) -> None:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if user.role != Role.ADMIN.value and not any(
        therapist.id == user.id for therapist in patient.therapists
    ):
        raise HTTPException(status_code=403, detail="Patient is not assigned to you")
    patient.therapists = [
        therapist for therapist in patient.therapists if therapist.id != user.id
    ]
    db.commit()
