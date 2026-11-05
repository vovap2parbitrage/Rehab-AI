from typing import Any

from fastapi import Depends, HTTPException, status

from app.core.auth import extract_roles, get_current_claims, get_current_user
from app.core.roles import Role
from app.models.user import User


def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return user

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
