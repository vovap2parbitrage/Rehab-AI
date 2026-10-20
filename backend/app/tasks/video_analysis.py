from app.tasks.celery_app import celery_app


@celery_app.task(name="video_analysis.analyze")
def analyze_video_task(temporary_object_key: str, exercise_id: str, patient_id: str) -> dict:
    return {
        "status": "not_implemented",
        "temporary_object_key": temporary_object_key,
        "exercise_id": exercise_id,
        "patient_id": patient_id,
    }
