from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PLACEHOLDER_SECRET_PREFIXES = ("dev-secret-key", "replace-this", "change-me")


class Settings(BaseSettings):
    app_name: str = "Rehab AI API"
    environment: str = "production"
    api_v1_prefix: str = "/api/v1"

    secret_key: str = Field(min_length=32)
    access_token_expire_minutes: int = 15

    database_url: str = "postgresql+psycopg://rehab:rehab@localhost:5432/rehab_ai"
    redis_url: str = "redis://localhost:6379/0"

    # S3-compatible video storage (any S3-compatible service).
    s3_endpoint_url: str = "http://localhost:9000"
    # Address clients use to reach storage; defaults to s3_endpoint_url.
    s3_public_endpoint_url: str | None = None
    s3_bucket: str = "rehab-videos"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "us-east-1"
    upload_url_expire_seconds: int = 600
    max_video_mb: int = 100
    max_video_seconds: int = 120

    # Provider that charges plan purchases; "mock" approves every payment without charging.
    payment_provider: str = "mock"

    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173"
    )

    jwt_issuer: str = "rehab-ai"
    jwt_audience: str = "rehab-ai-api"
    refresh_token_expire_days: int = 14
    # A session can be renewed only until this many days after login.
    refresh_token_max_days: int = 30
    # A refresh token that was just rotated may still arrive from a parallel request
    # (two tabs, a double fetch). Within this window it is not treated as theft.
    refresh_reuse_grace_seconds: int = 10
    refresh_cookie_name: str = "rehab_refresh"
    # The refresh cookie is Secure by default; plain-HTTP local runs turn this off.
    cookie_secure: bool = True

    login_max_failures: int = 5
    login_max_failures_per_email: int = 20
    login_max_attempts_per_ip: int = 60
    login_window_seconds: int = 900
    register_max_per_ip: int = 10
    register_window_seconds: int = 3600
    refresh_max_per_ip: int = 120
    refresh_window_seconds: int = 900

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def refresh_cookie_path(self) -> str:
        return f"{self.api_v1_prefix}/auth"

    @model_validator(mode="after")
    def reject_placeholder_secret_in_production(self) -> "Settings":
        if self.environment == "production" and self.secret_key.startswith(
            PLACEHOLDER_SECRET_PREFIXES
        ):
            raise ValueError("SECRET_KEY is a placeholder; set a random secret for production")
        return self

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
