from typing import Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import extract_roles, get_current_claims, get_current_user
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.patient import Patient
from app.models.user import User


def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return user

def get_patient_for_user(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
) -> Patient | None:
    return db.query(Patient).filter(Patient.user_id == user.id).first()


def require_patient_record(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
) -> Patient:
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patient record not found",
        )
    return patient

def require_roles(*allowed_roles: Role | str):
    allowed = {
        role.value if isinstance(role, Role) else role
        for role in allowed_roles
    }

    def dependency(
        claims: dict[str, Any] = Depends(get_current_claims),
    ) -> dict[str, Any]:
        user_roles = extract_roles(claims)

        if not allowed.intersection(user_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        return claims

    return dependency

def ensure_patient_access(
    patient_id: UUID,
    db: Session = Depends(get_db),
    claims: dict = Depends(get_current_claims),
) -> Patient:
    roles = extract_roles(claims)

    patient = db.query(Patient).filter(
        Patient.id == patient_id
    ).first()

    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    if Role.ADMIN.value in roles:
        return patient

    user = get_current_user(db=db, claims=claims)

    if Role.THERAPIST.value in roles and patient.therapist_id == user.id:
        return patient

    if Role.PATIENT.value in roles and patient.user_id == user.id:
        return patient

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied",
    )

