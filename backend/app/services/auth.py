import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.roles import Role
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    password_needs_rehash,
    password_problem,
    verify_password,
)
from app.models.patient import Patient
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import AuthSession, RegisterRequest, UserRead


class InvalidCredentials(Exception):
    pass


def invalid_refresh() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired session",
    )


def _require_acceptable_password(password: str, email: str) -> None:
    problem = password_problem(password, email)
    if problem:
        raise HTTPException(status_code=422, detail=problem)


def register_user(db: Session, payload: RegisterRequest) -> User:
    _require_acceptable_password(payload.password, payload.email)

    if db.query(User.id).filter(User.email == payload.email).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        first_name=payload.first_name,
        last_name=payload.last_name,
    )
    db.add(user)
    try:
        db.flush()
        if user.role == Role.PATIENT.value:
            db.add(Patient(user_id=user.id))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email is already registered"
        ) from exc
    db.refresh(user)
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    """The active user with this password; one error for an unknown email and a wrong password."""
    user = db.query(User).filter(User.email == email).first()
    # An unknown email still costs one hash verification, so response time does not tell.
    valid = verify_password(password, user.password_hash if user else DUMMY_PASSWORD_HASH)
    if user is None or not valid:
        raise InvalidCredentials

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        db.commit()
    return user


def _issue_refresh_token(
    db: Session,
    user_id: uuid.UUID,
    family_id: uuid.UUID,
    family_expires_at: datetime,
) -> str:
    raw, token_hash = new_refresh_token()
    now = datetime.now(UTC)
    db.add(
        RefreshToken(
            user_id=user_id,
            family_id=family_id,
            token_hash=token_hash,
            expires_at=min(now + timedelta(days=settings.refresh_token_expire_days), family_expires_at),
            family_expires_at=family_expires_at,
        )
    )
    return raw


def _session_for(user: User) -> AuthSession:
    access_token, expires_in = create_access_token(user.id)
    return AuthSession(
        access_token=access_token,
        expires_in=expires_in,
        user=UserRead.model_validate(user),
    )


def start_session(db: Session, user: User) -> tuple[AuthSession, str]:
    """A new login: an access token and the first refresh token of a new family."""
    now = datetime.now(UTC)
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id, RefreshToken.family_expires_at < now
    ).delete(synchronize_session=False)
    refresh = _issue_refresh_token(
        db, user.id, uuid.uuid4(), now + timedelta(days=settings.refresh_token_max_days)
    )
    db.commit()
    return _session_for(user), refresh


def _revoke_family(db: Session, family_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    db.commit()


def refresh_session(db: Session, raw_token: str) -> tuple[AuthSession, str | None]:
    """Exchange a refresh token for a new access token and a rotated refresh token.

    The second value is None when the token was rotated moments ago by a parallel request:
    the browser already holds the newer token, so only an access token is returned.
    """
    token = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_refresh_token(raw_token))
        .with_for_update()
        .first()
    )
    if token is None:
        raise invalid_refresh()

    now = datetime.now(UTC)
    if token.revoked_at is not None or token.expires_at <= now:
        db.rollback()
        raise invalid_refresh()

    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        _revoke_family(db, token.family_id)
        raise invalid_refresh()

    if token.rotated_at is not None:
        grace = timedelta(seconds=settings.refresh_reuse_grace_seconds)
        if now - token.rotated_at > grace:
            _revoke_family(db, token.family_id)
            raise invalid_refresh()
        db.rollback()
        return _session_for(user), None

    token.rotated_at = now
    refresh = _issue_refresh_token(db, user.id, token.family_id, token.family_expires_at)
    db.commit()
    return _session_for(user), refresh


def end_session(db: Session, raw_token: str | None) -> None:
    """Sign out: revoke the whole family the refresh token belongs to."""
    if not raw_token:
        return
    token = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_refresh_token(raw_token))
        .first()
    )
    if token is not None:
        _revoke_family(db, token.family_id)


def change_password(
    db: Session, user: User, current_password: str, new_password: str
) -> tuple[AuthSession, str]:
    """Set a new password and sign out every other device; this one gets a fresh session."""
    if not verify_password(current_password, user.password_hash):
        raise InvalidCredentials
    _require_acceptable_password(new_password, user.email)
    if verify_password(new_password, user.password_hash):
        raise HTTPException(
            status_code=422,
            detail="The new password must differ from the current one",
        )

    user.password_hash = hash_password(new_password)
    user.password_changed_at = datetime.now(UTC)
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete(synchronize_session=False)
    db.flush()
    return start_session(db, user)
