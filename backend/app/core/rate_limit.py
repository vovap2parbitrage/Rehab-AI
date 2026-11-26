import redis
from fastapi import HTTPException, status

from app.core.config import settings


def _unavailable() -> HTTPException:
    # Failing open would let a Redis outage switch brute-force protection off.
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Service temporarily unavailable",
    )


class RateLimiter:
    """Fixed-window counters kept in Redis."""

    def __init__(self, client: redis.Redis) -> None:
        self._client = client

    def retry_after(self, key: str, limit: int) -> int | None:
        """Seconds until ``key`` may be used again, or None while it is under ``limit``."""
        try:
            count = self._client.get(key)
            if count is None or int(count) < limit:
                return None
            return max(self._client.ttl(key), 1)
        except redis.RedisError as exc:
            raise _unavailable() from exc

    def hit(self, key: str, window_seconds: int) -> int:
        """Count one event in the window and return the new count."""
        try:
            count = self._client.incr(key)
            if count == 1 or self._client.ttl(key) < 0:
                self._client.expire(key, window_seconds)
            return count
        except redis.RedisError as exc:
            raise _unavailable() from exc

    def reset(self, key: str) -> None:
        try:
            self._client.delete(key)
        except redis.RedisError as exc:
            raise _unavailable() from exc


def too_many_requests(retry_after: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many attempts. Try again later",
        headers={"Retry-After": str(retry_after)},
    )


_limiter: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter(redis.Redis.from_url(settings.redis_url, socket_timeout=2))
    return _limiter
