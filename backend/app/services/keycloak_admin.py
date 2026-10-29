import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.roles import Role

APP_ROLES: tuple[Role, ...] = (Role.PATIENT, Role.THERAPIST, Role.ADMIN)


class KeycloakAdminError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


_token_cache: dict[str, Any] = {"access_token": None, "expires_at": 0.0}


def clear_token_cache() -> None:
    _token_cache["access_token"] = None
    _token_cache["expires_at"] = 0.0


def _require_admin_config() -> None:
    if not settings.keycloak_enabled:
        raise KeycloakAdminError("Keycloak authentication is disabled")
    if not settings.keycloak_admin_client_id:
        raise KeycloakAdminError("Keycloak admin client id is not configured")
    if not settings.keycloak_admin_client_secret:
        raise KeycloakAdminError("Keycloak admin client secret is not configured")


def get_admin_token(force_refresh: bool = False) -> str:
    _require_admin_config()

    now = time.monotonic()
    cached = _token_cache.get("access_token")
    if not force_refresh and cached and now < _token_cache["expires_at"]:
        return str(cached)

    try:
        response = httpx.post(
            settings.keycloak_token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.keycloak_admin_client_id,
                "client_secret": settings.keycloak_admin_client_secret,
            },
            timeout=settings.keycloak_admin_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise KeycloakAdminError("Unable to reach Keycloak") from exc

    if response.status_code != httpx.codes.OK:
        raise KeycloakAdminError(
            f"Keycloak admin authentication failed ({response.status_code})",
            status_code=response.status_code,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise KeycloakAdminError("Keycloak returned an invalid token response") from exc

    token = payload.get("access_token") if isinstance(payload, dict) else None
    if not isinstance(token, str) or not token:
        raise KeycloakAdminError("Keycloak did not return an access token")

    try:
        expires_in = int(payload.get("expires_in", 60))
    except (TypeError, ValueError):
        expires_in = 60

    _token_cache["access_token"] = token
    _token_cache["expires_at"] = now + max(expires_in - 30, 5)

    return token


def _admin_url(path: str) -> str:
    return (
        f"{settings.keycloak_server_url.rstrip('/')}"
        f"/admin/realms/{settings.keycloak_realm}{path}"
    )


def _request(
    method: str,
    path: str,
    *,
    json: Any | None = None,
) -> httpx.Response:
    token = get_admin_token()

    try:
        response = httpx.request(
            method,
            _admin_url(path),
            headers={"Authorization": f"Bearer {token}"},
            json=json,
            timeout=settings.keycloak_admin_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise KeycloakAdminError("Unable to reach Keycloak Admin API") from exc

    if response.status_code >= httpx.codes.BAD_REQUEST:
        raise KeycloakAdminError(
            f"Keycloak Admin API request failed ({response.status_code})",
            status_code=response.status_code,
        )

    return response


def get_realm_role(role: Role) -> dict[str, Any]:
    response = _request("GET", f"/roles/{role.value}")
    try:
        representation = response.json()
    except ValueError as exc:
        raise KeycloakAdminError("Keycloak returned an invalid role response") from exc

    if not isinstance(representation, dict) or representation.get("name") != role.value:
        raise KeycloakAdminError("Keycloak returned an unexpected role representation")

    return representation


def assign_realm_role(keycloak_user_id: str, role: Role) -> None:
    representation = get_realm_role(role)

    try:
        _request(
            "POST",
            f"/users/{keycloak_user_id}/role-mappings/realm",
            json=[representation],
        )
    except KeycloakAdminError as exc:
        if exc.status_code == httpx.codes.CONFLICT:
            return
        raise


def remove_realm_role(keycloak_user_id: str, role: Role) -> None:
    representation = get_realm_role(role)

    try:
        _request(
            "DELETE",
            f"/users/{keycloak_user_id}/role-mappings/realm",
            json=[representation],
        )
    except KeycloakAdminError as exc:
        if exc.status_code == httpx.codes.NOT_FOUND:
            return
        raise


def replace_app_role(keycloak_user_id: str, role: Role) -> None:
    if role not in APP_ROLES:
        raise KeycloakAdminError(f"Unsupported application role: {role}")

    for existing in APP_ROLES:
        if existing is not role:
            remove_realm_role(keycloak_user_id, existing)

    assign_realm_role(keycloak_user_id, role)
