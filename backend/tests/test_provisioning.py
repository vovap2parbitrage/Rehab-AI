import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - register every mapper before querying
from app.core.auth import get_current_user
from app.models.user import User


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.__table__.create(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def claims(**overrides):
    values = {
        "sub": "kc-sub-1",
        "email": "new@example.com",
        "email_verified": True,
        "realm_access": {"roles": []},
    }
    values.update(overrides)
    return values


def test_first_login_provisions_patient(db):
    user = get_current_user(claims=claims(), db=db)

    assert user.keycloak_sub == "kc-sub-1"
    assert user.email == "new@example.com"
    assert user.role == "patient"
    assert user.is_verified is True
    assert user.hashed_password is None
    assert db.query(User).count() == 1


def test_existing_sub_is_reused(db):
    first = get_current_user(claims=claims(), db=db)
    second = get_current_user(claims=claims(email="changed@example.com"), db=db)

    assert second.id == first.id
    assert db.query(User).count() == 1


def test_role_from_signed_token_is_applied_on_creation(db):
    user = get_current_user(
        claims=claims(
            sub="kc-doctor",
            email="doctor@example.com",
            realm_access={"roles": ["therapist"]},
        ),
        db=db,
    )

    assert user.role == "therapist"


def test_admin_role_wins_when_multiple_roles_are_present(db):
    user = get_current_user(
        claims=claims(
            sub="kc-admin",
            email="admin@example.com",
            realm_access={"roles": ["patient", "therapist", "admin"]},
        ),
        db=db,
    )

    assert user.role == "admin"


def test_preprovisioned_user_is_linked_by_verified_email(db):
    preprovisioned = User(
        email="therapist@example.com",
        hashed_password=None,
        role="therapist",
        is_active=True,
        is_verified=False,
    )
    db.add(preprovisioned)
    db.commit()
    db.refresh(preprovisioned)

    user = get_current_user(
        claims=claims(sub="kc-therapist", email="therapist@example.com"),
        db=db,
    )

    assert user.id == preprovisioned.id
    assert user.keycloak_sub == "kc-therapist"
    assert user.role == "therapist"
    assert user.is_verified is True


def test_unverified_email_cannot_be_linked_to_existing_user(db):
    preprovisioned = User(
        email="therapist@example.com",
        hashed_password=None,
        role="therapist",
        is_active=True,
        is_verified=False,
    )
    db.add(preprovisioned)
    db.commit()
    db.refresh(preprovisioned)

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(
            claims=claims(
                sub="kc-attacker",
                email="therapist@example.com",
                email_verified=False,
            ),
            db=db,
        )

    assert exc_info.value.status_code == 403
    assert preprovisioned.keycloak_sub is None


def test_new_user_can_register_without_verified_email(db):
    user = get_current_user(
        claims=claims(sub="kc-new", email="unverified@example.com", email_verified=False),
        db=db,
    )

    assert user.keycloak_sub == "kc-new"
    assert user.is_verified is False


def test_email_linked_to_another_identity_is_rejected(db):
    other = User(
        email="taken@example.com",
        hashed_password=None,
        keycloak_sub="other-keycloak-sub",
        role="patient",
        is_active=True,
        is_verified=True,
    )
    db.add(other)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(
            claims=claims(sub="kc-other", email="taken@example.com"),
            db=db,
        )

    assert exc_info.value.status_code == 403
    assert db.query(User).count() == 1


def test_inactive_user_is_rejected(db):
    inactive = User(
        email="inactive@example.com",
        hashed_password=None,
        keycloak_sub="kc-inactive",
        role="patient",
        is_active=False,
        is_verified=True,
    )
    db.add(inactive)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(
            claims=claims(sub="kc-inactive", email="inactive@example.com"),
            db=db,
        )

    assert exc_info.value.status_code == 403


def test_email_falls_back_to_preferred_username(db):
    user = get_current_user(
        claims={"sub": "kc-username", "preferred_username": "jdoe", "email_verified": False},
        db=db,
    )

    assert user.email == "jdoe@keycloak.local"
