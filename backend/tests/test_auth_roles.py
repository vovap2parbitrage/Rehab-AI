import uuid

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.core.auth import get_current_claims
from app.core.roles import Role
from app.db.dependencies import get_db
from app.main import app
from app.models.user import User
from app.services import keycloak_admin

BYPASS = {"X-Test-Auth": "bypass"}


class FakeQuery:
    def __init__(self, items):
        self._items = items

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        return self._items


class FakeSession:
    def __init__(self, users=()):
        self.users = {user.id: user for user in users}
        self.committed = False

    def get(self, model, primary_key):
        return self.users.get(primary_key)

    def query(self, model):
        return FakeQuery(list(self.users.values()))

    def add(self, obj):
        self.users[obj.id] = obj

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        return obj


def make_user(role: str = "patient", **overrides) -> User:
    values = {
        "id": uuid.uuid4(),
        "email": f"{role}-{uuid.uuid4().hex[:6]}@example.com",
        "role": role,
        "keycloak_sub": f"sub-{uuid.uuid4()}",
        "is_active": True,
        "is_verified": True,
        "pending_role": None,
    }
    values.update(overrides)
    return User(**values)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user():
    return make_user("admin")


@pytest.fixture
def patient_user():
    return make_user("patient")


def as_user(user: User, claims: dict | None = None) -> None:
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_current_claims] = lambda: claims or {
        "sub": user.keycloak_sub,
        "realm_access": {"roles": [user.role]},
    }


def as_admin(admin: User) -> None:
    as_user(admin, {"sub": admin.keycloak_sub, "realm_access": {"roles": ["admin"]}})


def as_patient(patient: User) -> None:
    as_user(patient, {"sub": patient.keycloak_sub, "realm_access": {"roles": ["patient"]}})


def test_me_returns_authenticated_user(client, patient_user):
    as_patient(patient_user)

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(patient_user.id)
    assert body["role"] == "patient"


def test_role_endpoint_requires_authentication(client):
    response = client.put(
        f"/api/v1/auth/users/{uuid.uuid4()}/role",
        json={"role": "therapist"},
    )

    assert response.status_code == 401


def test_patient_cannot_assign_roles(client, patient_user):
    target = make_user()
    as_patient(patient_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([patient_user, target])

    response = client.put(
        f"/api/v1/auth/users/{target.id}/role",
        json={"role": "admin"},
    )

    assert response.status_code == 403


def test_admin_assigns_role_through_keycloak(
    client, admin_user, monkeypatch
):
    target = make_user("patient", pending_role="therapist")
    session = FakeSession([admin_user, target])
    calls = []

    def fake_replace(keycloak_sub, role):
        calls.append((keycloak_sub, role))

    monkeypatch.setattr(keycloak_admin, "replace_app_role", fake_replace)
    as_admin(admin_user)
    app.dependency_overrides[get_db] = lambda: session

    response = client.put(
        f"/api/v1/auth/users/{target.id}/role",
        json={"role": "therapist"},
    )

    assert response.status_code == 200
    assert response.json()["role"] == "therapist"
    assert target.role == "therapist"
    assert target.pending_role is None
    assert session.committed is True
    assert calls == [(target.keycloak_sub, Role.THERAPIST)]


def test_admin_cannot_change_own_role(client, admin_user, monkeypatch):
    monkeypatch.setattr(
        keycloak_admin,
        "replace_app_role",
        lambda *args: pytest.fail("Keycloak must not be called"),
    )
    as_admin(admin_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([admin_user])

    response = client.put(
        f"/api/v1/auth/users/{admin_user.id}/role",
        json={"role": "patient"},
    )

    assert response.status_code == 400


def test_unknown_target_returns_404(client, admin_user, monkeypatch):
    monkeypatch.setattr(
        keycloak_admin,
        "replace_app_role",
        lambda *args: pytest.fail("Keycloak must not be called"),
    )
    as_admin(admin_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([admin_user])

    response = client.put(
        f"/api/v1/auth/users/{uuid.uuid4()}/role",
        json={"role": "therapist"},
    )

    assert response.status_code == 404


def test_unlinked_user_cannot_receive_role(client, admin_user, monkeypatch):
    target = make_user("patient", keycloak_sub=None)
    monkeypatch.setattr(
        keycloak_admin,
        "replace_app_role",
        lambda *args: pytest.fail("Keycloak must not be called"),
    )
    as_admin(admin_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([admin_user, target])

    response = client.put(
        f"/api/v1/auth/users/{target.id}/role",
        json={"role": "therapist"},
    )

    assert response.status_code == 409


def test_invalid_role_is_rejected(client, admin_user):
    target = make_user()
    as_admin(admin_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([admin_user, target])

    response = client.put(
        f"/api/v1/auth/users/{target.id}/role",
        json={"role": "superuser"},
    )

    assert response.status_code == 422


def test_keycloak_failure_returns_502(client, admin_user, monkeypatch):
    target = make_user()

    def fake_replace(*args):
        raise keycloak_admin.KeycloakAdminError("upstream failure", status_code=500)

    monkeypatch.setattr(keycloak_admin, "replace_app_role", fake_replace)
    as_admin(admin_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([admin_user, target])

    response = client.put(
        f"/api/v1/auth/users/{target.id}/role",
        json={"role": "therapist"},
    )

    assert response.status_code == 502
    assert target.role == "patient"


def test_unconfigured_keycloak_returns_503(client, admin_user, monkeypatch):
    target = make_user()

    def fake_replace(*args):
        raise keycloak_admin.KeycloakAdminError("not configured")

    monkeypatch.setattr(keycloak_admin, "replace_app_role", fake_replace)
    as_admin(admin_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([admin_user, target])

    response = client.put(
        f"/api/v1/auth/users/{target.id}/role",
        json={"role": "therapist"},
    )

    assert response.status_code == 503


def test_patient_can_request_therapist_role(client, patient_user):
    as_patient(patient_user)
    session = FakeSession([patient_user])
    app.dependency_overrides[get_db] = lambda: session

    response = client.post(
        "/api/v1/auth/role-requests",
        json={"role": "therapist"},
    )

    assert response.status_code == 202
    assert response.json()["pending_role"] == "therapist"
    assert patient_user.pending_role == "therapist"
    assert session.committed is True


def test_user_cannot_request_admin_role(client, patient_user):
    as_patient(patient_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([patient_user])

    response = client.post(
        "/api/v1/auth/role-requests",
        json={"role": "admin"},
    )

    assert response.status_code == 422
    assert patient_user.pending_role is None


def test_admin_cannot_request_another_role(client, admin_user):
    as_admin(admin_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([admin_user])

    response = client.post(
        "/api/v1/auth/role-requests",
        json={"role": "therapist"},
    )

    assert response.status_code == 400


def test_requesting_existing_role_returns_409(client, patient_user):
    as_patient(patient_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([patient_user])

    response = client.post(
        "/api/v1/auth/role-requests",
        json={"role": "patient"},
    )

    assert response.status_code == 409


def test_admin_lists_pending_role_requests(client, admin_user):
    pending = make_user("patient", pending_role="therapist")
    as_admin(admin_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([pending])

    response = client.get("/api/v1/auth/role-requests")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == str(pending.id)
    assert body[0]["pending_role"] == "therapist"


def test_patient_cannot_list_role_requests(client, patient_user):
    as_patient(patient_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([patient_user])

    response = client.get("/api/v1/auth/role-requests")

    assert response.status_code == 403


def test_admin_rejects_role_request(client, admin_user):
    pending = make_user("patient", pending_role="therapist")
    as_admin(admin_user)
    app.dependency_overrides[get_db] = lambda: FakeSession([admin_user, pending])

    response = client.delete(f"/api/v1/auth/role-requests/{pending.id}")

    assert response.status_code == 204
    assert pending.pending_role is None
