from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import settings
from app.core.security import create_access_token, hash_refresh_token
from app.models.patient import Patient
from app.models.refresh_token import RefreshToken
from app.models.user import User

ORIGIN = {"Origin": "http://localhost:3000"}
PASSWORD = "correct-horse-battery-staple"


def register_payload(**overrides) -> dict:
    payload = {
        "email": "Ivan.Petrenko@Example.com",
        "password": PASSWORD,
        "first_name": " Ivan ",
        "last_name": "Petrenko",
        "role": "patient",
    }
    payload.update(overrides)
    return payload


def bearer(session: dict) -> dict:
    return {"Authorization": f"Bearer {session['access_token']}"}


def register(api, **overrides):
    return api.post("/api/v1/auth/register", json=register_payload(**overrides))


def cookie(api) -> str | None:
    return api.cookies.get(settings.refresh_cookie_name)


def refresh(api, **kwargs):
    return api.post("/api/v1/auth/refresh", headers=ORIGIN, **kwargs)


def test_register_creates_a_patient_and_signs_in(api, db_session):
    response = register(api)

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == settings.access_token_expire_minutes * 60
    assert body["user"]["email"] == "ivan.petrenko@example.com"
    assert body["user"]["first_name"] == "Ivan"
    assert body["user"]["role"] == "patient"
    assert "password" not in str(body)
    assert response.headers["cache-control"] == "no-store"
    user = db_session.query(User).one()
    assert user.password_hash.startswith("$argon2id$")
    assert PASSWORD not in user.password_hash
    assert db_session.query(Patient).filter(Patient.user_id == user.id).count() == 1

    me = api.get("/api/v1/auth/me", headers=bearer(body))
    assert me.status_code == 200
    assert me.json()["id"] == body["user"]["id"]


def test_register_therapist_has_no_patient_profile(api, db_session):
    response = register(api, role="therapist")

    assert response.status_code == 201
    assert response.json()["user"]["role"] == "therapist"
    assert db_session.query(Patient).count() == 0


def test_refresh_cookie_is_httponly_strict_and_scoped(api):
    response = register(api)

    header = response.headers["set-cookie"].lower()
    assert f"{settings.refresh_cookie_name}=" in header
    assert "httponly" in header
    assert "samesite=strict" in header
    assert "path=/api/v1/auth" in header
    assert response.json()["access_token"] not in header


def test_secure_flag_follows_the_setting(api, monkeypatch):
    monkeypatch.setattr(settings, "cookie_secure", True)

    assert "secure" in register(api).headers["set-cookie"].lower()


def test_tokens_are_stored_only_as_hashes(api, db_session):
    register(api)

    stored = db_session.query(RefreshToken).one()
    assert stored.token_hash == hash_refresh_token(cookie(api))
    assert stored.token_hash != cookie(api)


@pytest.mark.parametrize("role", ["admin", "root", ""])
def test_register_cannot_choose_another_role(api, role):
    assert register(api, role=role).status_code == 422


def test_register_ignores_extra_privileged_fields(api, db_session):
    response = api.post(
        "/api/v1/auth/register",
        json=register_payload(is_active=False, plan_code="pro", id="x"),
    )

    assert response.status_code == 201
    user = db_session.query(User).one()
    assert user.plan_code == "free"


@pytest.mark.parametrize(
    "overrides",
    [
        {"password": "short"},
        {"password": "password1234"},
        {"password": "ivan.petrenko-2026"},
        {"email": "not-an-email"},
        {"first_name": "   "},
        {"last_name": ""},
    ],
)
def test_register_validates_input(api, overrides):
    assert register(api, **overrides).status_code == 422


def test_register_rejects_a_taken_email_in_any_case(api):
    assert register(api).status_code == 201

    response = register(api, email="IVAN.PETRENKO@example.com")

    assert response.status_code == 409


def test_login_returns_a_session(api):
    register(api)
    api.cookies.clear()

    response = api.post(
        "/api/v1/auth/login",
        json={"email": "IVAN.PETRENKO@EXAMPLE.COM", "password": PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "patient"
    assert cookie(api)


def test_wrong_password_and_unknown_email_look_the_same(api):
    register(api)
    api.cookies.clear()

    wrong = api.post(
        "/api/v1/auth/login", json={"email": "ivan.petrenko@example.com", "password": "nope-nope"}
    )
    unknown = api.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "nope-nope"}
    )

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert cookie(api) is None


def test_inactive_user_cannot_log_in(api, db_session):
    register(api)
    db_session.query(User).update({"is_active": False})
    db_session.commit()

    response = api.post(
        "/api/v1/auth/login", json={"email": "ivan.petrenko@example.com", "password": PASSWORD}
    )

    assert response.status_code == 403


def test_login_is_blocked_after_repeated_failures(api):
    register(api)
    attempt = {"email": "ivan.petrenko@example.com", "password": "wrong-wrong-wrong"}

    for _ in range(settings.login_max_failures):
        assert api.post("/api/v1/auth/login", json=attempt).status_code == 401

    blocked = api.post(
        "/api/v1/auth/login",
        json={"email": "ivan.petrenko@example.com", "password": PASSWORD},
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0


def test_a_successful_login_resets_the_failure_counter(api):
    register(api)
    good = {"email": "ivan.petrenko@example.com", "password": PASSWORD}
    bad = {**good, "password": "wrong-wrong-wrong"}

    for _ in range(settings.login_max_failures - 1):
        api.post("/api/v1/auth/login", json=bad)
    assert api.post("/api/v1/auth/login", json=good).status_code == 200

    for _ in range(settings.login_max_failures - 1):
        assert api.post("/api/v1/auth/login", json=bad).status_code == 401


def test_registration_is_rate_limited_per_address(api):
    for number in range(settings.register_max_per_ip):
        assert register(api, email=f"user{number}@example.com").status_code == 201

    assert register(api, email="one-more@example.com").status_code == 429


def test_protected_endpoints_need_a_valid_bearer_token(api):
    assert api.get("/api/v1/auth/me").status_code == 401
    assert api.get("/api/v1/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert api.get("/api/v1/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401


def test_refresh_cookie_is_not_an_access_token(api):
    register(api)

    response = api.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {cookie(api)}"})

    assert response.status_code == 401


def test_token_of_a_deleted_user_is_rejected(api, db_session):
    session = register(api).json()
    db_session.query(RefreshToken).delete()
    db_session.query(Patient).delete()
    db_session.query(User).delete()
    db_session.commit()

    assert api.get("/api/v1/auth/me", headers=bearer(session)).status_code == 401


def test_role_comes_from_the_database_not_the_token(api, db_session):
    session = register(api).json()
    assert api.get("/api/v1/patients/", headers=bearer(session)).status_code == 403

    db_session.query(Patient).delete()
    db_session.query(User).update({"role": "therapist"})
    db_session.commit()

    assert api.get("/api/v1/patients/", headers=bearer(session)).status_code == 200


def test_blocking_a_user_stops_a_token_that_is_still_valid(api, db_session):
    session = register(api).json()
    db_session.query(User).update({"is_active": False})
    db_session.commit()

    assert api.get("/api/v1/auth/me", headers=bearer(session)).status_code == 403


def test_refresh_rotates_the_token(api):
    register(api)
    old = cookie(api)

    response = refresh(api)

    assert response.status_code == 200
    assert response.json()["access_token"]
    assert cookie(api) and cookie(api) != old
    assert api.get("/api/v1/auth/me", headers=bearer(response.json())).status_code == 200


def test_refresh_without_a_cookie_is_unauthorized(api):
    assert refresh(api).status_code == 401


def test_refresh_with_an_unknown_token_is_unauthorized_and_clears_the_cookie(api):
    api.cookies.set(settings.refresh_cookie_name, "forged", path="/api/v1/auth")

    response = refresh(api)

    assert response.status_code == 401
    cleared = response.headers["set-cookie"].lower()
    assert f"{settings.refresh_cookie_name}=\"\"" in cleared
    assert "max-age=0" in cleared


@pytest.mark.parametrize("headers", [{}, {"Origin": "https://evil.example"}])
def test_refresh_and_logout_reject_foreign_origins(api, headers):
    register(api)
    before = cookie(api)

    assert api.post("/api/v1/auth/refresh", headers=headers).status_code == 403
    assert api.post("/api/v1/auth/logout", headers=headers).status_code == 403
    assert cookie(api) == before


def test_reusing_a_rotated_token_revokes_the_whole_session(api, db_session):
    register(api)
    stolen = cookie(api)
    assert refresh(api).status_code == 200
    rotated = cookie(api)
    db_session.query(RefreshToken).filter(
        RefreshToken.token_hash == hash_refresh_token(stolen)
    ).update({"rotated_at": datetime.now(UTC) - timedelta(minutes=5)})
    db_session.commit()

    api.cookies.set(settings.refresh_cookie_name, stolen, path="/api/v1/auth")
    assert refresh(api).status_code == 401

    api.cookies.set(settings.refresh_cookie_name, rotated, path="/api/v1/auth")
    assert refresh(api).status_code == 401
    assert all(token.revoked_at for token in db_session.query(RefreshToken).all())


def test_a_parallel_refresh_inside_the_grace_window_is_not_treated_as_theft(api):
    register(api)
    first = cookie(api)
    assert refresh(api).status_code == 200
    newest = cookie(api)

    api.cookies.set(settings.refresh_cookie_name, first, path="/api/v1/auth")
    parallel = refresh(api)

    assert parallel.status_code == 200
    assert parallel.json()["access_token"]
    assert "set-cookie" not in parallel.headers
    api.cookies.set(settings.refresh_cookie_name, newest, path="/api/v1/auth")
    assert refresh(api).status_code == 200


def test_expired_refresh_token_is_rejected(api, db_session):
    register(api)
    db_session.query(RefreshToken).update(
        {"expires_at": datetime.now(UTC) - timedelta(seconds=1)}
    )
    db_session.commit()

    assert refresh(api).status_code == 401


def test_a_session_cannot_be_renewed_past_its_absolute_limit(api, db_session):
    register(api)
    db_session.query(RefreshToken).update(
        {"family_expires_at": datetime.now(UTC) + timedelta(hours=1)}
    )
    db_session.commit()

    assert refresh(api).status_code == 200

    newest = db_session.query(RefreshToken).filter(RefreshToken.rotated_at.is_(None)).one()
    assert newest.expires_at <= newest.family_expires_at


def test_blocked_user_cannot_refresh(api, db_session):
    register(api)
    db_session.query(User).update({"is_active": False})
    db_session.commit()

    assert refresh(api).status_code == 401


def test_logout_revokes_the_session_and_clears_the_cookie(api, db_session):
    register(api)
    token = cookie(api)

    response = api.post("/api/v1/auth/logout", headers=ORIGIN)

    assert response.status_code == 204
    assert cookie(api) is None
    api.cookies.set(settings.refresh_cookie_name, token, path="/api/v1/auth")
    assert refresh(api).status_code == 401
    assert db_session.query(RefreshToken).one().revoked_at is not None


def test_logout_without_a_session_is_harmless(api):
    assert api.post("/api/v1/auth/logout", headers=ORIGIN).status_code == 204


def test_change_password_signs_other_sessions_out(api, db_session):
    first = register(api).json()
    other_device = cookie(api)
    api.cookies.clear()
    api.post(
        "/api/v1/auth/login", json={"email": "ivan.petrenko@example.com", "password": PASSWORD}
    )

    response = api.post(
        "/api/v1/auth/change-password",
        headers=bearer(first),
        json={"current_password": PASSWORD, "new_password": "a-brand-new-passphrase"},
    )

    assert response.status_code == 200
    assert api.get("/api/v1/auth/me", headers=bearer(response.json())).status_code == 200
    assert refresh(api).status_code == 200
    api.cookies.set(settings.refresh_cookie_name, other_device, path="/api/v1/auth")
    assert refresh(api).status_code == 401


def test_change_password_rejects_old_access_tokens(api, db_session):
    session = register(api).json()
    user = db_session.query(User).one()
    user.password_changed_at = datetime.now(UTC) + timedelta(seconds=5)
    db_session.commit()

    assert api.get("/api/v1/auth/me", headers=bearer(session)).status_code == 401

    fresh, _ = create_access_token(user.id)
    assert api.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {fresh}"}).status_code == 401


def test_new_password_works_and_the_old_one_does_not(api):
    session = register(api).json()
    api.post(
        "/api/v1/auth/change-password",
        headers=bearer(session),
        json={"current_password": PASSWORD, "new_password": "a-brand-new-passphrase"},
    )
    api.cookies.clear()
    login = {"email": "ivan.petrenko@example.com"}

    assert api.post("/api/v1/auth/login", json={**login, "password": PASSWORD}).status_code == 401
    assert (
        api.post(
            "/api/v1/auth/login", json={**login, "password": "a-brand-new-passphrase"}
        ).status_code
        == 200
    )


@pytest.mark.parametrize(
    ("current", "new", "status"),
    [
        ("wrong-password-here", "a-brand-new-passphrase", 400),
        (PASSWORD, PASSWORD, 422),
        (PASSWORD, "short", 422),
    ],
)
def test_change_password_checks_both_passwords(api, current, new, status):
    session = register(api).json()

    response = api.post(
        "/api/v1/auth/change-password",
        headers=bearer(session),
        json={"current_password": current, "new_password": new},
    )

    assert response.status_code == status


def test_change_password_guesses_are_limited(api):
    session = register(api).json()
    guess = {"current_password": "wrong-password-here", "new_password": "a-brand-new-passphrase"}

    for _ in range(settings.login_max_failures):
        api.post("/api/v1/auth/change-password", headers=bearer(session), json=guess)

    response = api.post(
        "/api/v1/auth/change-password",
        headers=bearer(session),
        json={**guess, "current_password": PASSWORD},
    )
    assert response.status_code == 429


def test_change_password_requires_a_login(api):
    response = api.post(
        "/api/v1/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "a-brand-new-passphrase"},
    )

    assert response.status_code == 401


def test_removed_keycloak_and_role_endpoints_are_gone(api):
    session = register(api).json()

    for method, path in [
        ("POST", "/api/v1/auth/me/role"),
        ("POST", "/api/v1/auth/role-requests"),
        ("GET", "/api/v1/auth/role-requests"),
        ("PUT", "/api/v1/auth/users/00000000-0000-0000-0000-000000000000/role"),
    ]:
        response = api.request(
            method, path, headers=bearer(session), json={"role": "therapist"}
        )
        assert response.status_code in (404, 405)

