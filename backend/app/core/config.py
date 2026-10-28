from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Rehab AI API"
    environment: str = "test"
    api_v1_prefix: str = "/api/v1"

    secret_key: str = Field(min_length=32)
    access_token_expire_minutes: int = 30

    database_url: str = "postgresql+psycopg://rehab:rehab@localhost:5432/rehab_ai"
    redis_url: str = "redis://localhost:6379/0"

    cors_origins: str = (
        "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173"
    )

    keycloak_enabled: bool = True
    keycloak_server_url: str = "http://localhost:8080"
    keycloak_realm: str = "rehab-ai"
    keycloak_client_id: str = "rehab-ai-backend"
    keycloak_audience: str | None = None
    keycloak_verify_audience: bool = True
    keycloak_jwks_cache_ttl_seconds: int = 300

    # Confidential service-account client used only for Keycloak Admin API calls.
    keycloak_admin_client_id: str = "rehab-ai-admin"
    keycloak_admin_client_secret: str | None = None
    keycloak_admin_timeout_seconds: float = 10.0

    @property
    def keycloak_issuer(self) -> str:
        return f"{self.keycloak_server_url.rstrip('/')}/realms/{self.keycloak_realm}"

    @property
    def keycloak_jwks_url(self) -> str:
        return f"{self.keycloak_issuer}/protocol/openid-connect/certs"

    @property
    def keycloak_token_url(self) -> str:
        return f"{self.keycloak_issuer}/protocol/openid-connect/token"

    @property
    def keycloak_auth_url(self) -> str:
        return f"{self.keycloak_issuer}/protocol/openid-connect/auth"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
