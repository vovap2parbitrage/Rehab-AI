# service to upload video to s3 bucket and run celery worker then
from celery.result import AsyncResult

from app.schemas.comparison import ComparisonRequest
from app.tasks.celery_app import celery_app
from app.tasks.video_analysis import analyze_video_task


def submit_comparison(req: ComparisonRequest) -> str:
    """Put the job in the queue and return its id immediately."""
    job = analyze_video_task.delay(
        str(req.reference_url),
        str(req.patient_url),
        [p.value for p in req.body_parts],
        req.tolerances_deg,
    )
    return job.id


def get_comparison(task_id: str) -> dict:
    """Translate the Celery state into our API status."""
    job = AsyncResult(task_id, app=celery_app)
    if job.state == "FAILURE":
        return {"task_id": task_id, "status": "failed", "message": "Analysis failed."}
    if job.state == "SUCCESS":
        return {"task_id": task_id, **job.result}   # pipeline's dict has its own "status"
    return {"task_id": task_id, "status": "pending"}  # PENDING / STARTED / RETRY
