import httpx
import pytest

from app.core.config import settings
from app.core.roles import Role
from app.services import keycloak_admin


@pytest.fixture(autouse=True)
def keycloak_settings(monkeypatch):
    keycloak_admin.clear_token_cache()
    monkeypatch.setattr(settings, "keycloak_enabled", True)
    monkeypatch.setattr(settings, "keycloak_server_url", "http://keycloak.test:8080")
    monkeypatch.setattr(settings, "keycloak_realm", "rehab-ai")
    monkeypatch.setattr(settings, "keycloak_admin_client_id", "rehab-ai-admin")
    monkeypatch.setattr(settings, "keycloak_admin_client_secret", "test-secret")
    yield
    keycloak_admin.clear_token_cache()


class FakeResponse:
    def __init__(self, status_code: int, payload=None) -> None:
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


def test_admin_token_is_requested_and_cached(monkeypatch):
    calls = []

    def fake_post(url, data=None, timeout=None):
        calls.append({"url": url, "data": data})
        return FakeResponse(200, {"access_token": "admin-token", "expires_in": 300})

    monkeypatch.setattr(keycloak_admin.httpx, "post", fake_post)

    assert keycloak_admin.get_admin_token() == "admin-token"
    assert keycloak_admin.get_admin_token() == "admin-token"

    assert len(calls) == 1
    assert calls[0]["url"] == (
        "http://keycloak.test:8080/realms/rehab-ai/protocol/openid-connect/token"
    )
    assert calls[0]["data"]["grant_type"] == "client_credentials"
    assert calls[0]["data"]["client_id"] == "rehab-ai-admin"
    assert calls[0]["data"]["client_secret"] == "test-secret"


def test_admin_token_requires_client_secret(monkeypatch):
    monkeypatch.setattr(settings, "keycloak_admin_client_secret", None)

    with pytest.raises(keycloak_admin.KeycloakAdminError) as exc_info:
        keycloak_admin.get_admin_token()

    assert exc_info.value.status_code is None


def test_admin_token_failure_is_reported(monkeypatch):
    monkeypatch.setattr(
        keycloak_admin.httpx,
        "post",
        lambda *args, **kwargs: FakeResponse(401),
    )

    with pytest.raises(keycloak_admin.KeycloakAdminError) as exc_info:
        keycloak_admin.get_admin_token()

    assert exc_info.value.status_code == 401


def test_replace_app_role_assigns_only_requested_role(monkeypatch):
    calls = []

    def fake_request(method, path, json=None):
        calls.append({"method": method, "path": path, "json": json})
        if method == "GET":
            role_name = path.rsplit("/", 1)[-1]
            return FakeResponse(200, {"id": f"id-{role_name}", "name": role_name})
        return FakeResponse(204)

    monkeypatch.setattr(keycloak_admin, "_request", fake_request)

    keycloak_admin.replace_app_role("keycloak-user-1", Role.THERAPIST)

    methods_and_paths = [(call["method"], call["path"]) for call in calls]
    assert ("GET", "/roles/patient") in methods_and_paths
    assert ("DELETE", "/users/keycloak-user-1/role-mappings/realm") in methods_and_paths
    assert ("GET", "/roles/admin") in methods_and_paths
    assert ("GET", "/roles/therapist") in methods_and_paths
    assert ("POST", "/users/keycloak-user-1/role-mappings/realm") in methods_and_paths

    assert all(
        not (call["method"] == "DELETE" and call["json"][0]["name"] == "therapist")
        for call in calls
    )

    post_call = next(
        call
        for call in calls
        if call["method"] == "POST" and call["path"].endswith("/role-mappings/realm")
    )
    assert post_call["json"] == [{"id": "id-therapist", "name": "therapist"}]


def test_assign_realm_role_tolerates_conflict(monkeypatch):
    def fake_request(method, path, json=None):
        if method == "GET":
            return FakeResponse(200, {"id": "id-patient", "name": "patient"})
        return FakeResponse(409)

    monkeypatch.setattr(keycloak_admin, "_request", fake_request)

    # Already assigned: should not raise.
    keycloak_admin.assign_realm_role("keycloak-user-1", Role.PATIENT)


def test_remove_realm_role_tolerates_missing_mapping(monkeypatch):
    def fake_request(method, path, json=None):
        if method == "GET":
            return FakeResponse(200, {"id": "id-patient", "name": "patient"})
        return FakeResponse(404)

    monkeypatch.setattr(keycloak_admin, "_request", fake_request)

    keycloak_admin.remove_realm_role("keycloak-user-1", Role.PATIENT)


def test_httpx_errors_are_wrapped(monkeypatch):
    def exploding_request(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(keycloak_admin.httpx, "request", exploding_request)
    monkeypatch.setattr(keycloak_admin, "get_admin_token", lambda: "token")

    with pytest.raises(keycloak_admin.KeycloakAdminError) as exc_info:
        keycloak_admin.get_realm_role(Role.PATIENT)

    assert exc_info.value.status_code is None
