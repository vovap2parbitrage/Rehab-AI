from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Rehab AI API"
    environment: str = "local"
    api_v1_prefix: str = "/api/v1"

    secret_key: str = Field(min_length=32)
    access_token_expire_minutes: int = 30

    database_url: str = "postgresql+psycopg://rehab:rehab@localhost:5432/rehab_ai"
    redis_url: str = "redis://localhost:6379/0"

    # S3-compatible storage (MinIO locally, any S3 in production).
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

    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
