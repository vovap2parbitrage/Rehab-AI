import uuid

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app

client = TestClient(app)


def test_patients_requires_auth() -> None:
    response = client.get("/api/v1/patients/")
    assert response.status_code == 401


def test_test_auth_header_does_not_bypass_authentication() -> None:
    response = client.get("/api/v1/patients/", headers={"X-Test-Auth": "bypass"})
    assert response.status_code == 401


def test_create_patient_requires_authentication() -> None:
    response = client.post(
        "/api/v1/patients/",
        json={
            "user_id": str(uuid.uuid4()),
            "therapist_ids": [str(uuid.uuid4())],
            "first_name": "Test",
            "last_name": "Patient",
        },
        headers={"X-Test-Auth": "bypass"},
    )
    assert response.status_code == 401


def test_default_environment_is_production(monkeypatch) -> None:
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    assert Settings(_env_file=None, secret_key="x" * 32).environment == "production"
