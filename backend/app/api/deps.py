import uuid
from datetime import UTC

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.roles import Role
from app.core.security import decode_access_token
from app.db.dependencies import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def unauthorized(detail: str = "Invalid authentication credentials") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_active_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """The signed-in user, loaded from the database on every request.

    The role and the active flag are never read from the token, so a role change or a
    blocked account takes effect at once.
    """
    if credentials is None:
        raise unauthorized("Bearer token required")

    try:
        claims = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(claims["sub"])
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise unauthorized("Invalid or expired access token") from exc

    user = db.get(User, user_id)
    if user is None:
        raise unauthorized("Invalid or expired access token")

    changed_at = user.password_changed_at
    if changed_at is not None and claims["iat"] < int(changed_at.astimezone(UTC).timestamp()):
        raise unauthorized("Invalid or expired access token")

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    return user


def require_roles(*allowed_roles: Role):
    allowed = {role.value for role in allowed_roles}

    def dependency(user: User = Depends(get_current_active_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return dependency


def require_trusted_origin(request: Request) -> None:
    """Cookie-authenticated requests must come from one of our own pages (CSRF defence)."""
    if request.headers.get("origin") not in settings.cors_origin_list:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Untrusted origin")


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
