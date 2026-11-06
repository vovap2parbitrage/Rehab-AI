import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-0123456789abcdef")

import uuid  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.deps import get_current_active_user  # noqa: E402
from app.core.auth import get_current_claims  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.assignment import Assignment  # noqa: E402
from app.models.exercise import Exercise  # noqa: E402
from app.models.patient import Patient  # noqa: E402
from app.models.session import TrainingSession  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.assignment import AssignmentRead  # noqa: E402
from app.schemas.patient import PatientRead  # noqa: E402
from app.schemas.session import SessionRead  # noqa: E402
from app.services import demo_store  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    stores = (
        demo_store.patients,
        demo_store.exercises,
        demo_store.assignments,
        demo_store.sessions,
        demo_store.invitations,
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
def admin(db_session):
    user = make_user("admin")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def therapist(db_session):
    user = make_user("therapist")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def other_therapist(db_session):
    user = make_user("therapist")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def patient_user(db_session):
    user = make_user("patient")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def other_patient_user(db_session):
    user = make_user("patient")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def seed_patient(db_session):
    def _seed(owner: User, therapist: User) -> PatientRead:
        db_patient = Patient(
            user_id=owner.id,
            first_name="Ivan",
            last_name="Petrenko",
            therapists=[therapist],
        )
        db_session.add(db_patient)
        db_session.commit()
        db_session.refresh(db_patient)
        patient = PatientRead(
            user_id=owner.id,
            therapist_ids=[therapist.id],
            first_name="Ivan",
            last_name="Petrenko",
        )
        patient.id = db_patient.id
        return patient

    return _seed


@pytest.fixture
def seed_assignment(db_session):
    def _seed(patient: PatientRead) -> AssignmentRead:
        exercise = Exercise(
            name="Test exercise",
            created_by=patient.therapist_ids[0],
        )
        db_session.add(exercise)
        db_session.flush()
        assignment = AssignmentRead(
            patient_id=patient.id,
            exercise_id=exercise.id,
            sessions_per_week=3,
            repetitions=10,
            starts_on="2026-01-01",
        )
        db_assignment = Assignment(**assignment.model_dump())
        db_session.add(db_assignment)
        db_session.commit()
        db_session.refresh(db_assignment)
        assignment.id = db_assignment.id
        return assignment

    return _seed


@pytest.fixture
def seed_session(db_session):
    def _seed(assignment: AssignmentRead) -> SessionRead:
        session = SessionRead(assignment_id=assignment.id, pain_score=2)
        db_session.add(TrainingSession(**session.model_dump()))
        db_session.commit()
        return session

    return _seed


@pytest.fixture
def db_session():
    with SessionLocal() as db:
        yield db
