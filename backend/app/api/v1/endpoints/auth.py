import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_current_active_user, require_trusted_origin
from app.core.config import settings
from app.core.rate_limit import RateLimiter, get_rate_limiter, too_many_requests
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.auth import (
    AuthSession,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    UserRead,
)
from app.services import auth as auth_service

router = APIRouter()


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:32]


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.refresh_cookie_name,
        token,
        max_age=settings.refresh_token_max_days * 86400,
        path=settings.refresh_cookie_path,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _require_free(limiter: RateLimiter, key: str, limit: int) -> None:
    retry_after = limiter.retry_after(key, limit)
    if retry_after is not None:
        raise too_many_requests(retry_after)


@router.post("/register", response_model=AuthSession, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_rate_limiter),
) -> AuthSession:
    if (
        limiter.hit(f"register:ip:{client_ip(request)}", settings.register_window_seconds)
        > settings.register_max_per_ip
    ):
        raise too_many_requests(settings.register_window_seconds)

    user = auth_service.register_user(db, payload)
    session, refresh_token = auth_service.start_session(db, user)
    _set_refresh_cookie(response, refresh_token)
    _no_store(response)
    return session


@router.post("/login", response_model=AuthSession)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_rate_limiter),
) -> AuthSession:
    ip = client_ip(request)
    window = settings.login_window_seconds
    if limiter.hit(f"login:ip:{ip}", window) > settings.login_max_attempts_per_ip:
        raise too_many_requests(window)

    email = _digest(payload.email)
    pair_key = f"login:fail:{ip}:{email}"
    email_key = f"login:fail:{email}"
    _require_free(limiter, pair_key, settings.login_max_failures)
    _require_free(limiter, email_key, settings.login_max_failures_per_email)

    try:
        user = auth_service.authenticate(db, payload.email, payload.password)
    except auth_service.InvalidCredentials:
        limiter.hit(pair_key, window)
        limiter.hit(email_key, window)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        ) from None

    limiter.reset(pair_key)
    session, refresh_token = auth_service.start_session(db, user)
    _set_refresh_cookie(response, refresh_token)
    _no_store(response)
    return session


@router.post(
    "/refresh",
    response_model=AuthSession,
    dependencies=[Depends(require_trusted_origin)],
)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_rate_limiter),
) -> AuthSession | JSONResponse:
    if (
        limiter.hit(f"refresh:ip:{client_ip(request)}", settings.refresh_window_seconds)
        > settings.refresh_max_per_ip
    ):
        raise too_many_requests(settings.refresh_window_seconds)

    raw_token = request.cookies.get(settings.refresh_cookie_name)
    try:
        if not raw_token:
            raise auth_service.invalid_refresh()
        session, new_token = auth_service.refresh_session(db, raw_token)
    except HTTPException as exc:
        failure = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        _clear_refresh_cookie(failure)
        _no_store(failure)
        return failure

    if new_token is not None:
        _set_refresh_cookie(response, new_token)
    _no_store(response)
    return session


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_trusted_origin)],
)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    auth_service.end_session(db, request.cookies.get(settings.refresh_cookie_name))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@router.post("/change-password", response_model=AuthSession)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_rate_limiter),
) -> AuthSession:
    key = f"password:fail:{user.id}"
    _require_free(limiter, key, settings.login_max_failures)

    try:
        session, refresh_token = auth_service.change_password(
            db, user, payload.current_password, payload.new_password
        )
    except auth_service.InvalidCredentials:
        limiter.hit(key, settings.login_window_seconds)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        ) from None

    _set_refresh_cookie(response, refresh_token)
    _no_store(response)
    return session


@router.get("/me", response_model=UserRead)
def read_current_user(user: User = Depends(get_current_active_user)) -> User:
    return user
