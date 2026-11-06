from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.assignment import Assignment
from app.models.invitation import TherapistInvitation
from app.models.patient import Patient
from app.models.session import TrainingSession
from app.models.user import User
from app.schemas.patient_workspace import (
    PatientAssignmentRead,
    PatientDoctorRead,
    PatientInvitationRead,
    PatientInvitationRespond,
    PatientSessionCreate,
    PatientSessionRead,
)

router = APIRouter()


def _patient_for_user(db: Session, user: User) -> Patient:
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found",
        )
    return patient


@router.get("/doctors", response_model=list[PatientDoctorRead])
def list_doctors(
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    _user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[PatientDoctorRead]:
    doctors = (
        db.query(User)
        .filter(
            User.role == Role.THERAPIST.value,
            User.is_active.is_(True),
        )
        .order_by(User.email)
        .all()
    )
    return [PatientDoctorRead(id=doctor.id, email=doctor.email) for doctor in doctors]


@router.get("/invitations", response_model=list[PatientInvitationRead])
def list_invitations(
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[PatientInvitationRead]:
    patient = _patient_for_user(db, user)
    invitations = (
        db.query(TherapistInvitation)
        .options(joinedload(TherapistInvitation.therapist))
        .filter(TherapistInvitation.patient_id == patient.id)
        .order_by(TherapistInvitation.created_at.desc())
        .all()
    )
    return [
        PatientInvitationRead(
            id=invitation.id,
            patient_id=invitation.patient_id,
            therapist_id=invitation.therapist_id,
            therapist_email=invitation.therapist.email,
            status=invitation.status,
            message=invitation.message,
            created_at=invitation.created_at,
            responded_at=invitation.responded_at,
        )
        for invitation in invitations
    ]


@router.patch(
    "/invitations/{invitation_id}",
    response_model=PatientInvitationRead,
)
def respond_to_invitation(
    invitation_id: UUID,
    payload: PatientInvitationRespond,
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientInvitationRead:
    patient = _patient_for_user(db, user)
    invitation = (
        db.query(TherapistInvitation)
        .options(joinedload(TherapistInvitation.therapist))
        .filter(
            TherapistInvitation.id == invitation_id,
            TherapistInvitation.patient_id == patient.id,
        )
        .first()
    )
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending invitations can be answered",
        )

    invitation.status = payload.status
    invitation.responded_at = datetime.now(UTC)
    if payload.status == "accepted" and invitation.therapist not in patient.therapists:
        patient.therapists.append(invitation.therapist)

    db.commit()
    db.refresh(invitation)
    return PatientInvitationRead(
        id=invitation.id,
        patient_id=invitation.patient_id,
        therapist_id=invitation.therapist_id,
        therapist_email=invitation.therapist.email,
        status=invitation.status,
        message=invitation.message,
        created_at=invitation.created_at,
        responded_at=invitation.responded_at,
    )


@router.get("/assignments", response_model=list[PatientAssignmentRead])
def list_assignments(
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[PatientAssignmentRead]:
    patient = _patient_for_user(db, user)
    return (
        db.query(Assignment)
        .options(
            joinedload(Assignment.exercise),
            selectinload(Assignment.sessions),
        )
        .filter(Assignment.patient_id == patient.id)
        .order_by(Assignment.starts_on.desc())
        .all()
    )


@router.post(
    "/assignments/{assignment_id}/sessions",
    response_model=PatientSessionRead,
    status_code=status.HTTP_201_CREATED,
)
def complete_assignment_session(
    assignment_id: UUID,
    payload: PatientSessionCreate,
    _claims: dict[str, Any] = Depends(require_roles(Role.PATIENT)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PatientSessionRead:
    patient = _patient_for_user(db, user)
    assignment = (
        db.query(Assignment)
        .filter(
            Assignment.id == assignment_id,
            Assignment.patient_id == patient.id,
        )
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    if assignment.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Assignment is not active",
        )

    session = TrainingSession(
        assignment_id=assignment.id,
        pain_score=payload.pain_score,
        completed_at=datetime.now(UTC),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return PatientSessionRead(
        id=session.id,
        assignment_id=session.assignment_id,
        pain_score=session.pain_score,
        completed_at=session.completed_at,
        score=session.score,
        joint_deviations=session.joint_deviations,
        created_at=session.created_at,
    )
