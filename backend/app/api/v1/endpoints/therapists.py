from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.plan import PlanChange, PlanPurchaseRead, TherapistPlanRead
from app.services import plan

router = APIRouter()


@router.get("/me/plan", response_model=TherapistPlanRead)
def get_my_plan(
    _claims: dict[str, Any] = Depends(require_roles(Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> TherapistPlanRead:
    return plan.get_usage(db, user)


@router.post("/me/plan/purchase", response_model=PlanPurchaseRead)
def purchase_plan(
    payload: PlanChange,
    _claims: dict[str, Any] = Depends(require_roles(Role.THERAPIST)),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PlanPurchaseRead:
    return plan.purchase_plan(db, user, payload.plan_code)


@router.put("/{user_id}/plan", response_model=TherapistPlanRead)
def assign_plan(
    user_id: UUID,
    payload: PlanChange,
    _claims: dict[str, Any] = Depends(require_roles(Role.ADMIN)),
    db: Session = Depends(get_db),
) -> TherapistPlanRead:
    return plan.assign_plan(db, user_id, payload.plan_code)
