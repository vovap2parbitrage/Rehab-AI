import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-0123456789abcdef")

import uuid  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.deps import get_current_active_user  # noqa: E402
from app.core.auth import get_current_claims  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.assignment import AssignmentRead  # noqa: E402
from app.schemas.patient import PatientRead  # noqa: E402
from app.schemas.session import SessionRead  # noqa: E402
from app.services import demo_store  # noqa: E402


@pytest.fixture(autouse=True)
def clean_demo_store():
    stores = (
        demo_store.patients,
        demo_store.exercises,
        demo_store.assignments,
        demo_store.sessions,
    )
    for store in stores:
        store.clear()
    yield
    for store in stores:
        store.clear()


@pytest.fixture
def api():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def make_user(role: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"{role}-{uuid.uuid4().hex[:6]}@example.com",
        role=role,
        keycloak_sub=f"sub-{uuid.uuid4()}",
        is_active=True,
        is_verified=True,
    )


@pytest.fixture
def login():
    """Authenticate requests as the given user (claims carry only that user's role)."""

    def _login(user: User) -> User:
        app.dependency_overrides[get_current_active_user] = lambda: user
        app.dependency_overrides[get_current_claims] = lambda: {
            "sub": user.keycloak_sub,
            "realm_access": {"roles": [user.role]},
        }
        return user

    return _login


@pytest.fixture
def admin():
    return make_user("admin")


@pytest.fixture
def therapist():
    return make_user("therapist")


@pytest.fixture
def other_therapist():
    return make_user("therapist")


@pytest.fixture
def patient_user():
    return make_user("patient")


@pytest.fixture
def other_patient_user():
    return make_user("patient")


@pytest.fixture
def seed_patient():
    def _seed(owner: User, therapist: User) -> PatientRead:
        patient = PatientRead(
            user_id=owner.id,
            therapist_id=therapist.id,
            first_name="Ivan",
            last_name="Petrenko",
        )
        demo_store.patients[patient.id] = patient
        return patient

    return _seed


@pytest.fixture
def seed_assignment():
    def _seed(patient: PatientRead) -> AssignmentRead:
        assignment = AssignmentRead(
            patient_id=patient.id,
            exercise_id=uuid.uuid4(),
            sessions_per_week=3,
            repetitions=10,
            starts_on="2026-01-01",
        )
        demo_store.assignments[assignment.id] = assignment
        return assignment

    return _seed


@pytest.fixture
def seed_session():
    def _seed(assignment: AssignmentRead) -> SessionRead:
        session = SessionRead(assignment_id=assignment.id, pain_score=2)
        demo_store.sessions[session.id] = session
        return session

    return _seed
