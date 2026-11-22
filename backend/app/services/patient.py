from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, update
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.core.statuses import AssignmentStatus
from app.models.assignment import Assignment
from app.models.patient import Patient
from app.models.patient_therapist import patient_therapist_table
from app.models.user import User
from app.schemas.patient import PatientCreate, PatientRead
from app.services.patient_access import (
    archived_at_for,
    archived_by,
    is_patient_therapist,
    require_patient_access,
    treated_by,
)
from app.services.plan import require_free_slot


def _to_read(patient: Patient, archived_at: datetime | None = None) -> PatientRead:
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


def list_patients(
    db: Session,
    *,
    is_admin: bool,
    therapist_id: UUID | None,
    archived: bool = False,
) -> list[PatientRead]:
    """Active patients, or with ``archived`` the ones this therapist has archived."""
    if archived:
        patients = db.query(Patient).filter(archived_by(therapist_id)).all()
        archived_at = {
            patient.id: archived_at_for(db, patient.id, therapist_id) for patient in patients
        }
        return [_to_read(patient, archived_at[patient.id]) for patient in patients]
    query = db.query(Patient)
    if not is_admin:
        query = query.filter(treated_by(therapist_id))
    return [_to_read(patient) for patient in query.all()]


def create_patient(
    db: Session,
    payload: PatientCreate,
    actor: User,
    *,
    is_admin: bool,
) -> PatientRead:
    patient_user = db.get(User, payload.user_id)
    if patient_user is None:
        raise HTTPException(status_code=404, detail="Patient user not found")
    if patient_user.role != Role.PATIENT.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The specified user is not a patient",
        )
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
    if not is_admin:
        # A therapist may only create a profile for themselves, never for other therapists.
        if therapist_ids - {actor.id}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Therapists can only assign themselves to a patient",
            )
        therapist_ids = {actor.id}
    if therapist_ids:
        therapists = (
            db.query(User)
            .filter(User.id.in_(therapist_ids), User.role == Role.THERAPIST.value)
            .all()
        )
        if len(therapists) != len(therapist_ids):
            raise HTTPException(status_code=404, detail="Therapist not found")
        for therapist in therapists:
            require_free_slot(db, therapist.id)
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


def _own_patient(db: Session, patient_id: UUID, user: User) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not is_patient_therapist(patient, user):
        raise HTTPException(status_code=403, detail="Patient is not assigned to you")
    return patient


def _link(patient_id: UUID, therapist_id: UUID):
    return and_(
        patient_therapist_table.c.patient_id == patient_id,
        patient_therapist_table.c.therapist_id == therapist_id,
    )


def archive_patient(db: Session, patient_id: UUID, user: User) -> None:
    """Move the patient off this therapist's active list and cancel their active assignments.

    Only this therapist's link and assignments change; other therapists are unaffected.
    """
    _own_patient(db, patient_id, user)
    db.execute(
        update(patient_therapist_table)
        .where(_link(patient_id, user.id), patient_therapist_table.c.archived_at.is_(None))
        .values(archived_at=datetime.now(UTC))
    )
    db.execute(
        update(Assignment)
        .where(
            Assignment.patient_id == patient_id,
            Assignment.therapist_id == user.id,
            Assignment.status == AssignmentStatus.ACTIVE.value,
        )
        .values(status=AssignmentStatus.CANCELLED.value)
    )
    db.commit()


def restore_patient(db: Session, patient_id: UUID, user: User) -> None:
    """Return an archived patient to this therapist's active list."""
    _own_patient(db, patient_id, user)
    if archived_at_for(db, patient_id, user.id) is None:
        return
    require_free_slot(db, user.id)
    db.execute(
        update(patient_therapist_table)
        .where(_link(patient_id, user.id))
        .values(archived_at=None)
    )
    db.commit()
