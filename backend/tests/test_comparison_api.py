import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.comparison_auth import require_user_id
from app.api.deps import get_current_active_user
from app.api.v1.endpoints.comparisons import get_comparison_service, get_storage
from app.main import app

USER = "user1"
KEY_B = f"videos/{USER}/{'b' * 32}.mov"

VALID = {"assignment_id": str(uuid.uuid4()), "patient_key": KEY_B}
PREFIX = "/api/v1/comparisons"


class FakeService:
    def submit_comparison(self, req, user_id):
        return "task-1"

    def get_comparison(self, task_id, user_id):
        if task_id == "mine":
            return {"task_id": task_id, "status": "pending"}
        return None


class FakeStorage:
    def create_upload(self, owner_id, content_type):
        return {"key": f"videos/{owner_id}/x", "url": "http://s3.test/b", "fields": {"a": "b"}}


@pytest.fixture
def client():
    app.dependency_overrides[get_comparison_service] = lambda: FakeService()
    app.dependency_overrides[get_storage] = lambda: FakeStorage()
    app.dependency_overrides[require_user_id] = lambda: USER
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id=USER)
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def anonymous_client():
    app.dependency_overrides[get_comparison_service] = lambda: FakeService()
    app.dependency_overrides[get_storage] = lambda: FakeStorage()
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "bad",
    [
        "https://example.com/v.mp4",
        "http://169.254.169.254/latest/meta-data",
        "videos/../etc/passwd",
        f"videos/{USER}/{'a' * 32}.exe",
        "nope",
    ],
)
def test_urls_and_malformed_keys_are_422(client, bad):
    assert client.post(PREFIX, json={**VALID, "patient_key": bad}).status_code == 422


def test_bad_assignment_id_is_422(client):
    assert client.post(PREFIX, json={**VALID, "assignment_id": "x"}).status_code == 422


@pytest.mark.parametrize("pain", [-1, 11])
def test_pain_score_out_of_range_is_422(client, pain):
    assert client.post(PREFIX, json={**VALID, "pain_score": pain}).status_code == 422


def test_get_own_task(client):
    r = client.get(f"{PREFIX}/mine")
    assert r.status_code == 200
    assert r.json()["status"] == "pending"


def test_get_unknown_or_foreign_task_is_404(client):
    assert client.get(f"{PREFIX}/someone-elses").status_code == 404


def test_upload_returns_presigned_target(client):
    r = client.post(f"{PREFIX}/uploads", json={"content_type": "video/mp4"})
    assert r.status_code == 200
    assert r.json()["key"].startswith(f"videos/{USER}/")


def test_upload_rejects_other_content_types(client):
    r = client.post(f"{PREFIX}/uploads", json={"content_type": "application/x-msdownload"})
    assert r.status_code == 422


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("post", PREFIX, VALID),
        ("get", f"{PREFIX}/mine", None),
        ("post", f"{PREFIX}/uploads", {"content_type": "video/mp4"}),
    ],
)
def test_requires_login(anonymous_client, method, path, body):
    r = getattr(anonymous_client, method)(path, **({"json": body} if body else {}))
    assert r.status_code == 401
