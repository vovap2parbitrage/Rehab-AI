from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_patients_requires_auth() -> None:
    response = client.get("/api/v1/patients/")
    assert response.status_code == 401


def test_patients_with_bypass_allows_for_admin() -> None:
    response = client.get("/api/v1/patients/", headers={"X-Test-Auth": "bypass"})
    assert response.status_code == 200


def test_create_patient_requires_admin_or_therapist() -> None:
    response = client.post(
        "/api/v1/patients/",
        json={"full_name": "Test", "phone": "+380000000000"},
        headers={"X-Test-Auth": "bypass"},
    )
    assert response.status_code == 201
