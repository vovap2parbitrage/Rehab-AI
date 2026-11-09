import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-0123456789abcdef")

import uuid  # noqa: E402

import psycopg  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.core.config import settings  # noqa: E402


def _test_database_url() -> str:
    """Tests never touch the dev database: use TEST_DATABASE_URL or "<name>_test"."""
    explicit = os.environ.get("TEST_DATABASE_URL")
    if explicit:
        return explicit
    url = make_url(settings.database_url)
    if not (url.database or "").endswith("_test"):
        url = url.set(database=f"{url.database}_test")
    return url.render_as_string(hide_password=False)


# Must happen before the engine is created (app.db.session reads settings on import).
settings.database_url = _test_database_url()

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

# Modules that never need a database: they run without one.
NO_DATABASE_MODULES = {
    "test_angles",
    "test_comparison_api",
    "test_comparison_task",
    "test_dtw",
    "test_health",
    "test_jwt",
    "test_pose",
    "test_repetitions",
    "test_scoring",
    "test_signal_utils",
    "test_storage",
    "test_video_checks",
    "test_auth",
}

_database_ready = False


def _ensure_test_database() -> None:
    """Create the "<name>_test" database on first use, then the tables."""
    global _database_ready
    if _database_ready:
        return
    url = make_url(settings.database_url)
    assert (url.database or "").endswith("_test"), "refusing to run tests on a non-test database"
    admin_url = url.set(drivername="postgresql", database="postgres")
    with psycopg.connect(admin_url.render_as_string(hide_password=False), autocommit=True) as conn:
        exists = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (url.database,)
        ).fetchone()
        if not exists:
            conn.execute(f'CREATE DATABASE "{url.database}"')
    # Fresh schema every run, so model changes are never hidden by a stale test database.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    _database_ready = True


@pytest.fixture(autouse=True)
def clean_database(request: pytest.FixtureRequest):
    if request.module.__name__.rsplit(".", 1)[-1] in NO_DATABASE_MODULES:
        yield
        return

    if "db" in request.fixturenames:
        yield
        return

    _ensure_test_database()
    with SessionLocal() as db:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    yield


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
            therapist_id=patient.therapist_ids[0],
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
