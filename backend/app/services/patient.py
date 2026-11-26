from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, update
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.core.statuses import AssignmentStatus
from app.models.assignment import Assignment
from app.models.patient import Patient
from app.models.patient_therapist import patient_therapist_table
from app.models.user import User
from app.schemas.pagination import Page
from app.schemas.patient import PatientCreate, PatientRead
from app.services.patient_access import (
    archived_at_for,
    archived_by,
    get_patient_for_therapist,
    require_patient_access,
    treated_by,
)
from app.services.plan import require_free_slot


def _to_read(patient: Patient, archived_at: datetime | None = None) -> PatientRead:
    return PatientRead(
        id=patient.id,
        user_id=patient.user_id,
        therapist_ids=[therapist.id for therapist in patient.therapists],
        first_name=patient.user.first_name,
        last_name=patient.user.last_name,
        date_of_birth=patient.user.date_of_birth,
        notes=patient.notes,
        archived_at=archived_at,
    )


def list_patients(
    db: Session,
    *,
    therapist_id: UUID,
    archived: bool = False,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> Page[PatientRead]:
    """Active patients, or with ``archived`` the ones this therapist has archived."""
    query = db.query(Patient)
    query = query.filter(archived_by(therapist_id) if archived else treated_by(therapist_id))

    # Names live on the user, so the search and the order both need the join.
    query = query.join(Patient.user)
    terms = q.strip().split() if q else []
    for term in terms:
        pattern = f"%{term}%"
        query = query.filter(
            or_(
                User.first_name.ilike(pattern),
                User.last_name.ilike(pattern),
                User.email.ilike(pattern),
            )
        )

    total = query.count()
    patients = (
        query.order_by(
            func.lower(User.first_name),
            func.lower(User.last_name),
            Patient.id,
        )
        .offset(offset)
        .limit(limit)
        .all()
    )
    if archived:
        archived_at = {
            patient.id: archived_at_for(db, patient.id, therapist_id) for patient in patients
        }
        items = [_to_read(patient, archived_at[patient.id]) for patient in patients]
    else:
        items = [_to_read(patient) for patient in patients]
    return Page(items=items, total=total, limit=limit, offset=offset)


def create_patient(
    db: Session,
    payload: PatientCreate,
    actor: User,
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
        notes=payload.notes,
    )
    # A therapist may only create a profile for themselves, never for other therapists.
    if set(payload.therapist_ids) - {actor.id}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Therapists can only assign themselves to a patient",
        )
    require_free_slot(db, actor.id)
    patient.therapists = [db.get(User, actor.id)]

    db.add(patient)
    db.commit()
    db.refresh(patient)
    return _to_read(patient)


def get_patient(
    db: Session,
    patient_id: UUID,
    user: User,
) -> PatientRead:
    return require_patient_access(patient_id, user, db)


def list_patient_therapists(
    db: Session,
    patient_id: UUID,
    user: User,
) -> list[dict[str, str]]:
    patient = require_patient_access(patient_id, user, db)
    return [
        {"id": str(therapist_id), "role": Role.THERAPIST.value}
        for therapist_id in patient.therapist_ids
    ]


def _link(patient_id: UUID, therapist_id: UUID):
    return and_(
        patient_therapist_table.c.patient_id == patient_id,
        patient_therapist_table.c.therapist_id == therapist_id,
    )


def archive_patient(db: Session, patient_id: UUID, user: User) -> None:
    """Move the patient off this therapist's active list and cancel their active assignments.

    Only this therapist's link and assignments change; other therapists are unaffected.
    """
    get_patient_for_therapist(patient_id, user, db)
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
    get_patient_for_therapist(patient_id, user, db)
    if archived_at_for(db, patient_id, user.id) is None:
        return
    require_free_slot(db, user.id)
    db.execute(
        update(patient_therapist_table)
        .where(_link(patient_id, user.id))
        .values(archived_at=None)
    )
    db.commit()
