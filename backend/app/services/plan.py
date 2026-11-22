from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import patient_limit_reached
from app.models.invitation import TherapistInvitation
from app.models.patient_therapist import patient_therapist_table
from app.models.plan import Plan, PlanPayment
from app.models.user import User
from app.schemas.plan import PlanPurchaseRead, TherapistPlanRead
from app.services.payments import get_payment_provider


def list_plans(db: Session) -> list[Plan]:
    return db.query(Plan).order_by(Plan.price_uah, Plan.max_active_patients).all()


def _get_plan(db: Session, plan_code: str) -> Plan:
    plan = db.get(Plan, plan_code)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


def count_active_patients(db: Session, therapist_id: UUID) -> int:
    return db.execute(
        select(func.count()).where(
            patient_therapist_table.c.therapist_id == therapist_id,
            patient_therapist_table.c.archived_at.is_(None),
        )
    ).scalar_one()


def count_pending_invitations(
    db: Session,
    therapist_id: UUID,
    exclude_invitation_id: UUID | None = None,
) -> int:
    query = select(func.count()).where(
        TherapistInvitation.therapist_id == therapist_id,
        TherapistInvitation.status == "pending",
    )
    if exclude_invitation_id is not None:
        query = query.where(TherapistInvitation.id != exclude_invitation_id)
    return db.execute(query).scalar_one()


def get_usage(db: Session, therapist: User) -> TherapistPlanRead:
    plan = therapist.plan
    active = count_active_patients(db, therapist.id)
    return TherapistPlanRead(
        plan=plan.code,
        plan_name=plan.name,
        limit=plan.max_active_patients,
        active=active,
        pending=count_pending_invitations(db, therapist.id),
        free=max(plan.max_active_patients - active, 0),
    )


def require_free_slot(
    db: Session,
    therapist_id: UUID,
    exclude_invitation_id: UUID | None = None,
) -> None:
    """Refuse (409 ``patient_limit_reached``) when the therapist has no room for one more patient.

    Active patients and pending invitations both take a slot. When a pending invitation is
    being accepted, pass its id: it already holds the slot it is about to turn into a patient.
    """
    # Lock the therapist's row so that parallel requests are checked one after another.
    therapist = (
        db.query(User)
        .filter(User.id == therapist_id)
        .populate_existing()
        .with_for_update()
        .one()
    )
    plan = db.get(Plan, therapist.plan_code)
    taken = count_active_patients(db, therapist_id) + count_pending_invitations(
        db, therapist_id, exclude_invitation_id
    )
    if taken >= plan.max_active_patients:
        raise patient_limit_reached(
            f"The {plan.name} plan allows {plan.max_active_patients} active patients. "
            "Archive a patient or upgrade the plan"
        )


def assign_plan(db: Session, user_id: UUID, plan_code: str) -> TherapistPlanRead:
    """Set a user's plan by hand (admin); never forces patients out when the limit shrinks."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.plan_code = _get_plan(db, plan_code).code
    db.commit()
    db.refresh(user)
    return get_usage(db, user)


def purchase_plan(db: Session, user: User, plan_code: str) -> PlanPurchaseRead:
    """Buy (or switch to) a plan. Free plans cost nothing, so no payment is taken."""
    plan = _get_plan(db, plan_code)
    user = db.get(User, user.id)
    if user.plan_code == plan.code:
        raise HTTPException(status_code=409, detail="You are already on this plan")

    payment_id = None
    if plan.price_uah > 0:
        provider = get_payment_provider()
        result = provider.charge(user_id=user.id, plan_code=plan.code, amount_uah=plan.price_uah)
        payment = PlanPayment(
            user_id=user.id,
            plan_code=plan.code,
            amount_uah=plan.price_uah,
            status="paid" if result.paid else "failed",
            provider=provider.name,
            provider_reference=result.reference,
        )
        db.add(payment)
        if not result.paid:
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Payment was declined",
            )
        db.flush()
        payment_id = payment.id

    user.plan_code = plan.code
    db.commit()
    db.refresh(user)
    return PlanPurchaseRead(
        payment_id=payment_id,
        amount_uah=plan.price_uah,
        plan=get_usage(db, user),
    )
