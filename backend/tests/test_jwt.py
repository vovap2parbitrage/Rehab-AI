import time

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from jose import jwk, jwt

from app.core import auth
from app.core.config import settings

KID = "test-key-1"


def _pem(key) -> tuple[str, str]:
    private = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private, public


@pytest.fixture(scope="module")
def signing_key():
    private, public = _pem(rsa.generate_private_key(public_exponent=65537, key_size=2048))
    public_jwk = jwk.construct(public, "RS256").to_dict()
    public_jwk.update({"kid": KID, "use": "sig", "kty": "RSA"})
    return {"private_pem": private, "jwk": public_jwk}


@pytest.fixture(autouse=True)
def jwt_settings(monkeypatch):
    monkeypatch.setattr(settings, "keycloak_enabled", True)
    monkeypatch.setattr(settings, "keycloak_server_url", "http://keycloak.test:8080")
    monkeypatch.setattr(settings, "keycloak_issuer_url", None)
    monkeypatch.setattr(settings, "keycloak_realm", "rehab-ai")
    monkeypatch.setattr(settings, "keycloak_client_id", "rehab-ai-backend")
    monkeypatch.setattr(settings, "keycloak_audience", "rehab-ai-backend")
    monkeypatch.setattr(settings, "keycloak_jwks_cache_ttl_seconds", 300)
    monkeypatch.setattr(auth, "_jwks", [])
    monkeypatch.setattr(auth, "_jwks_expires_at", 0.0)


class FakeResponse:
    def __init__(self, payload=None, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("GET", "http://keycloak.test")
            raise httpx.HTTPStatusError(
                "error",
                request=request,
                response=httpx.Response(self.status_code, request=request),
            )

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


@pytest.fixture
def jwks_endpoint(monkeypatch, signing_key):
    state = {"calls": 0, "keys": [signing_key["jwk"]], "error": None}

    def fake_get(url, timeout=None):
        state["calls"] += 1
        state["url"] = url
        if state["error"] is not None:
            raise state["error"]
        return FakeResponse({"keys": state["keys"]})

    monkeypatch.setattr(auth.httpx, "get", fake_get)
    return state


def make_token(signing_key, *, kid=KID, alg="RS256", key=None, **claim_overrides) -> str:
    claims = {
        "sub": "kc-sub-1",
        "iss": settings.keycloak_issuer,
        "aud": "rehab-ai-backend",
        "exp": int(time.time()) + 300,
    }
    claims.update(claim_overrides)
    claims = {name: value for name, value in claims.items() if value is not None}
    return jwt.encode(
        claims,
        key or signing_key["private_pem"],
        algorithm=alg,
        headers={"kid": kid},
    )


def assert_unauthorized(token: str, detail_part: str | None = None) -> None:
    with pytest.raises(HTTPException) as exc_info:
        auth.verify_token(token)

    assert exc_info.value.status_code == 401
    if detail_part is not None:
        assert detail_part in exc_info.value.detail


def test_valid_token_is_accepted(signing_key, jwks_endpoint):
    claims = auth.verify_token(make_token(signing_key))

    assert claims["sub"] == "kc-sub-1"
    assert jwks_endpoint["url"] == settings.keycloak_jwks_url


def test_expired_token_is_rejected(signing_key, jwks_endpoint):
    assert_unauthorized(make_token(signing_key, exp=int(time.time()) - 60))


def test_wrong_audience_is_rejected(signing_key, jwks_endpoint):
    assert_unauthorized(make_token(signing_key, aud="another-client"))


def test_wrong_issuer_is_rejected(signing_key, jwks_endpoint):
    assert_unauthorized(make_token(signing_key, iss="http://evil.test/realms/rehab-ai"))


def test_token_signed_with_another_key_is_rejected(signing_key, jwks_endpoint):
    other_private, _ = _pem(rsa.generate_private_key(public_exponent=65537, key_size=2048))

    assert_unauthorized(make_token(signing_key, key=other_private))


def test_missing_subject_is_rejected(signing_key, jwks_endpoint):
    assert_unauthorized(make_token(signing_key, sub=None), "subject")


def test_non_rs256_algorithm_is_rejected(signing_key, jwks_endpoint):
    token = make_token(signing_key, alg="HS256", key="shared-secret")

    assert_unauthorized(token, "Unsupported token algorithm")
    assert jwks_endpoint["calls"] == 0


def test_garbage_token_is_rejected(jwks_endpoint):
    assert_unauthorized("not-a-jwt", "Invalid token header")


def test_token_without_kid_is_rejected(signing_key, jwks_endpoint):
    token = jwt.encode(
        {"sub": "x", "iss": settings.keycloak_issuer, "aud": "rehab-ai-backend"},
        signing_key["private_pem"],
        algorithm="RS256",
    )

    assert_unauthorized(token, "Missing token key identifier")


def test_unknown_kid_refreshes_jwks_once_then_fails(signing_key, jwks_endpoint):
    assert_unauthorized(make_token(signing_key, kid="rotated-key"), "Signing key not found")

    assert jwks_endpoint["calls"] == 2


def test_rotated_key_is_picked_up_after_refresh(signing_key, jwks_endpoint):
    stale = {**signing_key["jwk"], "kid": "old-key"}
    jwks_endpoint["keys"] = [stale]
    auth.fetch_jwks()
    jwks_endpoint["keys"] = [signing_key["jwk"]]

    claims = auth.verify_token(make_token(signing_key))

    assert claims["sub"] == "kc-sub-1"
    assert jwks_endpoint["calls"] == 2


def test_jwks_is_cached_within_ttl(signing_key, jwks_endpoint):
    auth.verify_token(make_token(signing_key))
    auth.verify_token(make_token(signing_key))

    assert jwks_endpoint["calls"] == 1


def test_jwks_is_refetched_after_ttl(signing_key, jwks_endpoint, monkeypatch):
    auth.fetch_jwks()
    monkeypatch.setattr(auth, "_jwks_expires_at", time.monotonic() - 1)

    auth.fetch_jwks()

    assert jwks_endpoint["calls"] == 2


def test_stale_jwks_is_used_when_keycloak_is_down(signing_key, jwks_endpoint, monkeypatch):
    auth.fetch_jwks()
    monkeypatch.setattr(auth, "_jwks_expires_at", time.monotonic() - 1)
    jwks_endpoint["error"] = httpx.ConnectError("down")

    claims = auth.verify_token(make_token(signing_key))

    assert claims["sub"] == "kc-sub-1"


def test_unavailable_keycloak_without_cache_returns_503(signing_key, jwks_endpoint):
    jwks_endpoint["error"] = httpx.ConnectError("down")

    with pytest.raises(HTTPException) as exc_info:
        auth.verify_token(make_token(signing_key))

    assert exc_info.value.status_code == 503


def test_empty_jwks_returns_503(signing_key, jwks_endpoint):
    jwks_endpoint["keys"] = []

    with pytest.raises(HTTPException) as exc_info:
        auth.fetch_jwks()

    assert exc_info.value.status_code == 503


def test_audience_falls_back_to_client_id(signing_key, jwks_endpoint, monkeypatch):
    monkeypatch.setattr(settings, "keycloak_audience", None)

    assert auth.verify_token(make_token(signing_key))["sub"] == "kc-sub-1"
    assert_unauthorized(make_token(signing_key, aud="another-client"))


def test_disabled_keycloak_returns_503(signing_key, jwks_endpoint, monkeypatch):
    monkeypatch.setattr(settings, "keycloak_enabled", False)

    with pytest.raises(HTTPException) as exc_info:
        auth.verify_token(make_token(signing_key))

    assert exc_info.value.status_code == 503


def test_realm_and_client_roles_are_merged():
    roles = auth.extract_roles(
        {
            "realm_access": {"roles": ["patient", 7]},
            "resource_access": {
                "rehab-ai-backend": {"roles": ["therapist"]},
                "other-client": {"roles": ["admin"]},
            },
        }
    )

    assert roles == {"patient", "therapist"}


def test_extract_roles_ignores_malformed_claims():
    assert auth.extract_roles({"realm_access": "oops", "resource_access": []}) == set()


def test_get_current_claims_requires_bearer_header(api):
    assert api.get("/api/v1/auth/me").status_code == 401
    assert api.get("/api/v1/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401
