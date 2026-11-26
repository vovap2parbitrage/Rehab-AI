import hashlib
import secrets
import unicodedata
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import settings

ACCESS_TOKEN_TYPE = "access"
PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128

_COMMON_PASSWORDS = frozenset(
    {
        "123456789012",
        "1234567890123",
        "password1234",
        "password12345",
        "passwordpassword",
        "qwertyuiop12",
        "qwertyuiopas",
        "qwertyuiop123",
        "1q2w3e4r5t6y",
        "iloveyou1234",
        "administrator",
        "letmein123456",
        "welcome12345",
        "000000000000",
        "111111111111",
        "aaaaaaaaaaaa",
    }
)

_hasher = PasswordHasher()


def _normalize(password: str) -> str:
    return unicodedata.normalize("NFKC", password)


def hash_password(password: str) -> str:
    return _hasher.hash(_normalize(password))


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, _normalize(password))
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# Checked when the account does not exist, so a missing account takes as long as a wrong password.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(16))


def password_problem(password: str, email: str | None = None) -> str | None:
    """Why the password is not acceptable, or None when it is."""
    normalized = _normalize(password)
    if len(normalized) < PASSWORD_MIN_LENGTH:
        return f"Password must be at least {PASSWORD_MIN_LENGTH} characters long"
    if len(normalized) > PASSWORD_MAX_LENGTH:
        return f"Password must be at most {PASSWORD_MAX_LENGTH} characters long"
    lowered = normalized.casefold()
    if lowered in _COMMON_PASSWORDS or len(set(lowered)) < 4:
        return "Password is too easy to guess"
    if email:
        local_part = email.split("@", 1)[0].casefold()
        if len(local_part) >= 4 and local_part in lowered:
            return "Password must not contain your email"
    return None


def create_access_token(user_id: uuid.UUID) -> tuple[str, int]:
    """A signed access token and its lifetime in seconds."""
    now = datetime.now(UTC)
    lifetime = timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "exp": now + lifetime,
        "jti": uuid.uuid4().hex,
        "typ": ACCESS_TOKEN_TYPE,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm="HS256")
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> dict:
    """The verified claims; raises ``jwt.InvalidTokenError`` for anything not valid."""
    claims = jwt.decode(
        token,
        settings.secret_key,
        algorithms=["HS256"],
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
        options={"require": ["exp", "iat", "sub", "iss", "aud", "jti"]},
    )
    if claims.get("typ") != ACCESS_TOKEN_TYPE:
        raise jwt.InvalidTokenError("Not an access token")
    return claims


def new_refresh_token() -> tuple[str, str]:
    """A random refresh token and the hash that is stored instead of it."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
