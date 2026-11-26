
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.plan import PlanChange, PlanPurchaseRead, TherapistPlanRead
from app.schemas.today import TodayRead
from app.services import plan, today

router = APIRouter()


@router.get("/me/plan", response_model=TherapistPlanRead)
def get_my_plan(
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> TherapistPlanRead:
    return plan.get_usage(db, user)


@router.post("/me/plan/purchase", response_model=PlanPurchaseRead)
def purchase_plan(
    payload: PlanChange,
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> PlanPurchaseRead:
    return plan.purchase_plan(db, user, payload.plan_code)


@router.get("/me/today", response_model=TodayRead)
def get_my_today(
    user: User = Depends(require_roles(Role.THERAPIST)),
    db: Session = Depends(get_db),
) -> TodayRead:
    return today.get_today(db, user)
