import pytest
from fastapi.testclient import TestClient

from app.api.comparison_auth import require_user_id
from app.api.v1.endpoints.comparisons import get_comparison_service, get_storage
from app.main import app

USER = "user1"
OTHER = "user2"
KEY_A = f"videos/{USER}/{'a' * 32}.mp4"
KEY_B = f"videos/{USER}/{'b' * 32}.mov"
FOREIGN_KEY = f"videos/{OTHER}/{'c' * 32}.mp4"

VALID = {"reference_key": KEY_A, "patient_key": KEY_B, "body_parts": ["right_leg"]}
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
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def anonymous_client():
    app.dependency_overrides[get_comparison_service] = lambda: FakeService()
    app.dependency_overrides[get_storage] = lambda: FakeStorage()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_create_returns_202_and_task_id(client):
    r = client.post(PREFIX, json=VALID)
    assert r.status_code == 202
    assert r.json() == {"task_id": "task-1"}


@pytest.mark.parametrize("field", ["reference_key", "patient_key"])
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
def test_urls_and_malformed_keys_are_422(client, field, bad):
    assert client.post(PREFIX, json={**VALID, field: bad}).status_code == 422


@pytest.mark.parametrize("field", ["reference_key", "patient_key"])
def test_someone_elses_video_is_403(client, field):
    assert client.post(PREFIX, json={**VALID, field: FOREIGN_KEY}).status_code == 403


def test_unknown_body_part_is_422(client):
    assert client.post(PREFIX, json={**VALID, "body_parts": ["head"]}).status_code == 422


def test_empty_body_parts_is_422(client):
    assert client.post(PREFIX, json={**VALID, "body_parts": []}).status_code == 422


def test_repeated_body_parts_is_422(client):
    r = client.post(PREFIX, json={**VALID, "body_parts": ["torso", "torso"]})
    assert r.status_code == 422


def test_too_many_body_parts_is_422(client):
    parts = ["left_arm", "right_arm", "left_leg", "right_leg", "torso", "torso"]
    assert client.post(PREFIX, json={**VALID, "body_parts": parts}).status_code == 422


def test_negative_tolerance_is_422(client):
    r = client.post(PREFIX, json={**VALID, "tolerances_deg": {"r_knee": -5}})
    assert r.status_code == 422


def test_huge_tolerance_is_422(client):
    r = client.post(PREFIX, json={**VALID, "tolerances_deg": {"r_knee": 500}})
    assert r.status_code == 422


def test_unknown_joint_tolerance_is_422(client):
    r = client.post(PREFIX, json={**VALID, "tolerances_deg": {"left_pinky": 5}})
    assert r.status_code == 422


def test_known_joint_tolerance_is_accepted(client):
    r = client.post(PREFIX, json={**VALID, "tolerances_deg": {"r_knee": 5, "torso_tilt": 3}})
    assert r.status_code == 202


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
