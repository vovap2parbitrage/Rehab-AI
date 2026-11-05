from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_roles
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.auth import RoleAssignment, RoleRequest, UserRead
from app.services import keycloak_admin
from app.services.keycloak_admin import KeycloakAdminError

router = APIRouter()


def _keycloak_failure(exc: KeycloakAdminError) -> HTTPException:
    if exc.status_code is None:
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Role assignment service is unavailable",
        )

    if exc.status_code == status.HTTP_404_NOT_FOUND:
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Keycloak user or role not found",
        )

    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Keycloak role assignment failed",
    )


@router.get("/me", response_model=UserRead)
def read_current_user(
    user: User = Depends(get_current_active_user),
) -> User:
    return user


@router.post(
    "/role-requests",
    response_model=UserRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_role(
    payload: RoleRequest,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> User:
    if user.role == Role.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot request another role",
        )

    if user.role == payload.role:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Role is already assigned",
        )

    user.pending_role = payload.role
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.get("/role-requests", response_model=list[UserRead])
def list_role_requests(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_roles(Role.ADMIN)),
) -> list[User]:
    return (
        db.query(User)
        .filter(User.pending_role.is_not(None))
        .order_by(User.created_at)
        .all()
    )


@router.delete(
    "/role-requests/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reject_role_request(
    user_id: UUID,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_roles(Role.ADMIN)),
) -> Response:
    user = db.get(User, user_id)
    if user is None or user.pending_role is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending role request not found",
        )

    user.pending_role = None
    db.add(user)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/users/{user_id}/role", response_model=UserRead)
def assign_user_role(
    user_id: UUID,
    payload: RoleAssignment,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_active_user),
    _admin_claims: dict = Depends(require_roles(Role.ADMIN)),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.id == admin.id and user.role != payload.role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot change their own role",
        )

    if not user.keycloak_sub:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is not linked to a Keycloak account",
        )

    try:
        keycloak_admin.replace_app_role(user.keycloak_sub, Role(payload.role))
    except KeycloakAdminError as exc:
        raise _keycloak_failure(exc) from exc

    user.role = payload.role
    user.pending_role = None
    db.add(user)
    db.commit()
    db.refresh(user)

    return user
