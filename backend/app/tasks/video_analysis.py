from app.tasks.celery_app import celery_app


@celery_app.task(name="video_analysis.analyze")
def analyze_video_task(
    reference_url: str,
    patient_url: str,
    body_parts: list[str],
    tolerances_deg: dict[str, float],
) -> dict:
    return {"status": "failed", "message": "not implemented yet"}
