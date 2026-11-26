import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import Settings, settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    password_needs_rehash,
    password_problem,
    verify_password,
)


def _forge(payload: dict, key: str | None = None, algorithm: str = "HS256") -> str:
    return jwt.encode(payload, key or settings.secret_key, algorithm=algorithm)


def _claims(**overrides) -> dict:
    now = datetime.now(UTC)
    claims = {
        "sub": str(uuid.uuid4()),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "jti": "abc",
        "typ": "access",
    }
    claims.update(overrides)
    return claims


def test_password_hash_verifies_and_is_salted():
    first = hash_password("correct-horse-battery")
    second = hash_password("correct-horse-battery")

    assert first != second
    assert first.startswith("$argon2id$")
    assert verify_password("correct-horse-battery", first)
    assert not verify_password("wrong-horse-battery", first)
    assert not password_needs_rehash(first)


def test_equivalent_unicode_passwords_match():
    assert verify_password("ｐａｓｓｗｏｒｄ-ｗｉｔｈ-ｗｉｄｅ", hash_password("password-with-wide"))


def test_garbage_hash_never_verifies():
    assert not verify_password("anything", "not-a-hash")


@pytest.mark.parametrize(
    "password",
    ["short", "a" * 129, "password1234", "aaaaaaaaaaaa", "x" * 3 + "ivan.petrenko-1"],
)
def test_weak_passwords_are_rejected(password):
    assert password_problem(password, "ivan.petrenko@example.com") is not None


def test_strong_password_is_accepted():
    assert password_problem("correct-horse-battery", "ivan@example.com") is None


def test_access_token_round_trip():
    user_id = uuid.uuid4()

    token, expires_in = create_access_token(user_id)
    claims = decode_access_token(token)

    assert claims["sub"] == str(user_id)
    assert expires_in == settings.access_token_expire_minutes * 60
    assert "role" not in claims


def test_expired_token_is_rejected():
    expired = datetime.now(UTC) - timedelta(minutes=1)
    token = _forge(_claims(exp=expired, iat=expired - timedelta(minutes=5)))

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


@pytest.mark.parametrize(
    "overrides",
    [{"iss": "someone-else"}, {"aud": "another-api"}, {"typ": "refresh"}],
)
def test_token_for_another_issuer_audience_or_type_is_rejected(overrides):
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(_forge(_claims(**overrides)))


@pytest.mark.parametrize("missing", ["exp", "iat", "sub", "iss", "aud", "jti"])
def test_token_without_a_required_claim_is_rejected(missing):
    claims = _claims()
    del claims[missing]

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(_forge(claims))


def test_token_signed_with_another_key_is_rejected():
    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(_forge(_claims(), key="another-secret-key-0123456789abcdef"))


def test_unsigned_token_is_rejected():
    token = jwt.encode(_claims(), key=None, algorithm="none")

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(token)


def test_other_hmac_algorithm_is_rejected():
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(_forge(_claims(), algorithm="HS512"))


def test_tampered_payload_is_rejected():
    token, _ = create_access_token(uuid.uuid4())
    header, _payload, signature = token.split(".")
    forged = _forge(_claims(sub=str(uuid.uuid4()))).split(".")[1]

    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(f"{header}.{forged}.{signature}")


def test_refresh_tokens_are_random_and_only_the_hash_is_kept():
    first, first_hash = new_refresh_token()
    second, _ = new_refresh_token()

    assert first != second
    assert len(first) >= 64
    assert first not in first_hash
    assert first_hash == hash_refresh_token(first)
    assert len(first_hash) == 64


def test_default_environment_is_production(monkeypatch):
    monkeypatch.delenv("ENVIRONMENT", raising=False)

    assert Settings(_env_file=None, secret_key="x" * 32).environment == "production"


@pytest.mark.parametrize(
    "secret", ["dev-secret-key-change-me-0123456789abcdef", "replace-this-with-a-long-random-secret"]
)
def test_placeholder_secret_is_refused_in_production(secret):
    with pytest.raises(ValueError, match="placeholder"):
        Settings(_env_file=None, secret_key=secret, environment="production")

    assert Settings(_env_file=None, secret_key=secret, environment="local").secret_key == secret

