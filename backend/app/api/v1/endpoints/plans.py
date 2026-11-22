from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.schemas.plan import PlanRead
from app.services import plan

router = APIRouter()


@router.get("/", response_model=list[PlanRead])
def list_plans(db: Session = Depends(get_db)) -> list[PlanRead]:
    """Public: the price page shows these without a login."""
    return plan.list_plans(db)
