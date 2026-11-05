"""S3-compatible object storage for videos.

Clients never send us URLs. They upload straight to the bucket using a short-lived
presigned POST that we sign, then refer to the file by its object key. The worker
reads the object from the one configured bucket, so nothing user-supplied is ever
fetched over HTTP.
"""

import re
import uuid
from pathlib import Path
from typing import Any

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

ALLOWED_CONTENT_TYPES = {"video/mp4": "mp4", "video/quicktime": "mov"}
KEY_RE = re.compile(r"^videos/(?P<owner>[A-Za-z0-9_-]{1,64})/[0-9a-f]{32}\.(mp4|mov)$")
CHUNK_SIZE = 1024 * 1024


class StorageError(Exception):
    """Safe-to-show storage failure (never contains secrets or internal details)."""


def _client(endpoint_url: str) -> Any:
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            connect_timeout=10,
            read_timeout=30,
            retries={"max_attempts": 3},
        ),
    )


def max_video_bytes() -> int:
    return settings.max_video_mb * 1024 * 1024


def new_video_key(owner_id: str, content_type: str) -> str:
    extension = ALLOWED_CONTENT_TYPES[content_type]
    return f"videos/{owner_id}/{uuid.uuid4().hex}.{extension}"


def is_owned_key(key: str, owner_id: str) -> bool:
    """True only for well-formed video keys that live under the caller's own prefix."""
    match = KEY_RE.match(key)
    return match is not None and match.group("owner") == owner_id


def create_upload(owner_id: str, content_type: str) -> dict[str, Any]:
    """Presigned POST: the bucket itself enforces size, type and expiry."""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("Unsupported content type")
    key = new_video_key(owner_id, content_type)
    public_url = settings.s3_public_endpoint_url or settings.s3_endpoint_url
    post = _client(public_url).generate_presigned_post(
        Bucket=settings.s3_bucket,
        Key=key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, max_video_bytes()],
        ],
        ExpiresIn=settings.upload_url_expire_seconds,
    )
    return {"key": key, "url": post["url"], "fields": post["fields"]}


def download_video(key: str, dest: Path) -> None:
    """Copy one object to `dest`, refusing anything over the size limit."""
    limit = max_video_bytes()
    client = _client(settings.s3_endpoint_url)
    try:
        head = client.head_object(Bucket=settings.s3_bucket, Key=key)
        if head["ContentLength"] > limit:
            raise StorageError("Video file is too large.")
        body = client.get_object(Bucket=settings.s3_bucket, Key=key)["Body"]
        size = 0
        with dest.open("wb") as out:
            for chunk in body.iter_chunks(CHUNK_SIZE):
                size += len(chunk)
                if size > limit:
                    raise StorageError("Video file is too large.")
                out.write(chunk)
    except (ClientError, BotoCoreError) as exc:
        raise StorageError("Could not download the video.") from exc
