from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "rehab_ai",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.video_analysis"],
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Kyiv",
    enable_utc=True,
)
