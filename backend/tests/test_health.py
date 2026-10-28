from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_and_get_patient() -> None:
    created = client.post(
        "/api/v1/patients/",
        json={"full_name": "Тестовий Пацієнт", "phone": "+380000000000"},
        headers={"X-Test-Auth": "bypass"},
    )
    assert created.status_code == 201
    patient_id = created.json()["id"]

    fetched = client.get(f"/api/v1/patients/{patient_id}", headers={"X-Test-Auth": "bypass"})
    assert fetched.status_code == 200
    assert fetched.json()["full_name"] == "Тестовий Пацієнт"
