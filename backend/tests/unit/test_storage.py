from pathlib import Path

import pytest
from botocore.exceptions import ClientError

from app.services import storage
from app.services.storage import StorageError

OWNER = "user1"


@pytest.fixture(autouse=True)
def _s3_settings(monkeypatch):
    monkeypatch.setattr(storage.settings, "s3_endpoint_url", "http://s3.test:9000")
    monkeypatch.setattr(storage.settings, "s3_public_endpoint_url", None)
    monkeypatch.setattr(storage.settings, "s3_bucket", "test-bucket")
    monkeypatch.setattr(storage.settings, "s3_access_key", "test-access")
    monkeypatch.setattr(storage.settings, "s3_secret_key", "test-secret")


def test_new_keys_are_owned_and_unique():
    a = storage.new_video_key(OWNER, "video/mp4")
    b = storage.new_video_key(OWNER, "video/mp4")
    assert a != b
    assert storage.is_owned_key(a, OWNER)
    assert not storage.is_owned_key(a, "user2")


@pytest.mark.parametrize(
    "key",
    [
        "videos/user1/../user2/" + "a" * 32 + ".mp4",
        "other/user1/" + "a" * 32 + ".mp4",
        "videos/user1/" + "a" * 32 + ".exe",
        "videos/user1/short.mp4",
        "http://evil/x.mp4",
    ],
)
def test_malformed_keys_are_not_owned(key):
    assert not storage.is_owned_key(key, OWNER)


def test_presigned_upload_limits_size_and_type():
    upload = storage.create_upload(OWNER, "video/mp4")
    assert upload["url"].startswith("http://s3.test:9000/test-bucket")
    assert storage.is_owned_key(upload["key"], OWNER)
    assert upload["fields"]["Content-Type"] == "video/mp4"
    assert "policy" in upload["fields"] and "x-amz-signature" in upload["fields"]


def test_upload_rejects_unknown_content_type():
    with pytest.raises(ValueError):
        storage.create_upload(OWNER, "text/html")


class _Body:
    def __init__(self, data: bytes):
        self.data = data

    def iter_chunks(self, n):
        yield self.data


class _Client:
    def __init__(self, size_header: int, data: bytes, fail: bool = False):
        self.size_header, self.data, self.fail = size_header, data, fail

    def head_object(self, **kw):
        if self.fail:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return {"ContentLength": self.size_header}

    def get_object(self, **kw):
        return {"Body": _Body(self.data)}


def _use(monkeypatch, client, limit=10):
    monkeypatch.setattr(storage, "_client", lambda url: client)
    monkeypatch.setattr(storage, "max_video_bytes", lambda: limit)


def test_download_writes_file(monkeypatch, tmp_path: Path):
    _use(monkeypatch, _Client(5, b"hello"))
    storage.download_video("k", tmp_path / "v")
    assert (tmp_path / "v").read_bytes() == b"hello"


def test_download_rejects_declared_oversize(monkeypatch, tmp_path: Path):
    _use(monkeypatch, _Client(11, b"x"))
    with pytest.raises(StorageError):
        storage.download_video("k", tmp_path / "v")


def test_download_rejects_actual_oversize(monkeypatch, tmp_path: Path):
    _use(monkeypatch, _Client(5, b"x" * 11))
    with pytest.raises(StorageError):
        storage.download_video("k", tmp_path / "v")


def test_missing_object_is_safe_error(monkeypatch, tmp_path: Path):
    _use(monkeypatch, _Client(0, b"", fail=True))
    with pytest.raises(StorageError, match="Could not download"):
        storage.download_video("k", tmp_path / "v")
