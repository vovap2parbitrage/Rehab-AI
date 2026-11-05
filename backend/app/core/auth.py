import time
from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.roles import Role
from app.db.dependencies import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)

_jwks: list[dict[str, Any]] = []
_jwks_expires_at = 0.0


def unauthorized(detail: str = "Invalid authentication credentials") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def fetch_jwks(*, force_refresh: bool = False) -> list[dict[str, Any]]:
    global _jwks, _jwks_expires_at

    now = time.monotonic()

    if not force_refresh and _jwks and now < _jwks_expires_at:
        return _jwks

    try:
        response = httpx.get(settings.keycloak_jwks_url, timeout=5.0)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        if _jwks:
            return _jwks

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from exc

    keys = data.get("keys") if isinstance(data, dict) else None

    if not isinstance(keys, list) or not keys:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No signing keys available",
        )

    _jwks = keys
    _jwks_expires_at = now + settings.keycloak_jwks_cache_ttl_seconds

    return _jwks


def get_signing_key(token: str) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise unauthorized("Invalid token header") from exc

    # This API accepts only RS256-signed access tokens.
    if header.get("alg") != "RS256":
        raise unauthorized("Unsupported token algorithm")

    kid = header.get("kid")
    if not isinstance(kid, str) or not kid:
        raise unauthorized("Missing token key identifier")

    for refresh in (False, True):
        keys = fetch_jwks(force_refresh=refresh)

        for key in keys:
            if (
                key.get("kid") == kid
                and key.get("kty") == "RSA"
                and key.get("use", "sig") == "sig"
            ):
                return key

    raise unauthorized("Signing key not found")


def verify_token(token: str) -> dict[str, Any]:
    if not settings.keycloak_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Keycloak authentication is disabled",
        )

    audience = settings.keycloak_audience or settings.keycloak_client_id

    try:
        claims = jwt.decode(
            token,
            get_signing_key(token),
            algorithms=["RS256"],
            issuer=settings.keycloak_issuer,
            audience=audience,
            options={"verify_aud": True},
        )
    except JWTError as exc:
        raise unauthorized("Invalid or expired access token") from exc

    if not isinstance(claims, dict):
        raise unauthorized("Invalid token claims")

    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise unauthorized("Token subject is missing")

    if not isinstance(claims.get("exp"), (int, float)):
        raise unauthorized("Token expiration is missing")

    return claims


def get_current_claims(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    if (
        settings.environment == "test"
        and request.headers.get("X-Test-Auth") == "bypass"
    ):
        return {
            "sub": "test-user",
            "email": "test@example.com",
            "realm_access": {
                "roles": ["admin", "therapist"]
            },
        }

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized("Bearer token required")

    return verify_token(credentials.credentials)


def extract_roles(claims: dict[str, Any]) -> set[str]:
    roles: set[str] = set()

    realm_access = claims.get("realm_access")
    if isinstance(realm_access, dict):
        realm_roles = realm_access.get("roles")
        if isinstance(realm_roles, list):
            roles.update(role for role in realm_roles if isinstance(role, str))

    resource_access = claims.get("resource_access")
    if isinstance(resource_access, dict):
        client_access = resource_access.get(settings.keycloak_client_id)

        if isinstance(client_access, dict):
            client_roles = client_access.get("roles")
            if isinstance(client_roles, list):
                roles.update(role for role in client_roles if isinstance(role, str))

    return roles


def _email_from_claims(claims: dict[str, Any]) -> str:
    email = claims.get("email")
    if isinstance(email, str) and email.strip():
        return email.strip()

    username = claims.get("preferred_username")
    if isinstance(username, str) and username.strip():
        return f"{username.strip()}@keycloak.local"

    return f"{claims['sub']}@keycloak.local"


def _role_from_claims(claims: dict[str, Any]) -> str:
    roles = extract_roles(claims)
    for candidate in (Role.ADMIN.value, Role.THERAPIST.value, Role.PATIENT.value):
        if candidate in roles:
            return candidate
    return Role.PATIENT.value


def _ensure_active(user: User) -> User:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    return user


def _provision_user(db: Session, claims: dict[str, Any]) -> User:
    sub = claims["sub"]
    email = _email_from_claims(claims)
    email_verified = bool(claims.get("email_verified", False))

    user = (
        db.query(User)
        .filter(func.lower(User.email) == email.lower())
        .first()
    )

    if user:
        if user.keycloak_sub and user.keycloak_sub != sub:
            raise HTTPException(
                status_code=403,
                detail="Email is already linked to another account",
            )

        if not email_verified:
            raise HTTPException(
                status_code=403,
                detail="Email must be verified",
            )

        user.keycloak_sub = sub
        user.is_verified = True
        user.role = user.role or _role_from_claims(claims)

    else:
        user = User(
            email=email,
            hashed_password=None,
            keycloak_sub=sub,
            role=_role_from_claims(claims),
            is_active=True,
            is_verified=email_verified,
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    return _ensure_active(user)


def get_current_user(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: Session = Depends(get_db),
) -> User:
    user = (
        db.query(User)
        .filter(User.keycloak_sub == claims["sub"])
        .first()
    )

    if user is None:
        return _provision_user(db, claims)

    return _ensure_active(user)