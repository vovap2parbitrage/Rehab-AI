from fastapi.testclient import TestClient

from app.api.v1.endpoints.comparisons import get_video_service
from app.main import app


class FakeService:
    def submit_comparison(self, req):
        return "task-1"

    def get_comparison(self, task_id):
        return {"task_id": task_id, "status": "pending"}


client = TestClient(app)
app.dependency_overrides[get_video_service] = lambda: FakeService()

VALID = {
    "reference_url": "https://example.com/ref.mp4",
    "patient_url": "https://example.com/pat.mp4",
    "body_parts": ["right_leg"],
}
PREFIX = "/api/v1/comparisons"


def test_create_returns_202_and_task_id():
    r = client.post(PREFIX, json=VALID)
    print(r.json())
    assert r.status_code == 202
    assert r.json() == {"task_id": "task-1"}


def test_unknown_body_part_is_422():
    r = client.post(PREFIX, json={**VALID, "body_parts": ["head"]})
    assert r.status_code == 422


def test_empty_body_parts_is_422():
    assert client.post(PREFIX, json={**VALID, "body_parts": []}).status_code == 422


def test_bad_url_is_422():
    assert client.post(PREFIX, json={**VALID, "patient_url": "nope"}).status_code == 422


def test_negative_tolerance_is_422():
    r = client.post(PREFIX, json={**VALID, "tolerances_deg": {"r_knee": -5}})
    assert r.status_code == 422


def test_get_returns_status():
    r = client.get(f"{PREFIX}/abc")
    assert r.status_code == 200
    assert r.json()["status"] == "pending"
