"""Queue video comparisons and read their results, scoped to the user who asked."""

import uuid

import redis
from celery.result import AsyncResult

from app.core.config import settings
from app.schemas.comparison import ComparisonRequest
from app.tasks.celery_app import celery_app
from app.tasks.comparison_analysis import analyze_video_task

OWNER_TTL_SECONDS = 24 * 3600


def _redis() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url)


def _owner_key(task_id: str) -> str:
    return f"comparison:owner:{task_id}"


def submit_comparison(req: ComparisonRequest, user_id: str) -> str:
    """Record who owns the job, then queue it and return its id immediately."""
    task_id = str(uuid.uuid4())
    _redis().set(_owner_key(task_id), user_id, ex=OWNER_TTL_SECONDS)
    analyze_video_task.apply_async(
        args=[
            req.reference_key,
            req.patient_key,
            [p.value for p in req.body_parts],
            req.tolerances_deg,
        ],
        task_id=task_id,
    )
    return task_id


def get_comparison(task_id: str, user_id: str) -> dict | None:
    """Return the job's state, or None if it is not this user's job."""
    owner = _redis().get(_owner_key(task_id))
    if owner is None or owner.decode() != user_id:
        return None
    job = AsyncResult(task_id, app=celery_app)
    if job.state == "FAILURE":
        return {"task_id": task_id, "status": "failed", "message": "Analysis failed."}
    if job.state == "SUCCESS":
        return {"task_id": task_id, **job.result}  # pipeline's dict has its own "status"
    return {"task_id": task_id, "status": "pending"}  # PENDING / STARTED / RETRY
