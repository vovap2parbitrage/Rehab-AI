from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import CodedHTTPException, coded_http_exception_handler

app = FastAPI(title=settings.app_name)

# The browser frontend is served from a different origin than the API. Requests carry the
# access token in the Authorization header; credentials are allowed only so the refresh
# cookie reaches /auth, and only for the listed origins (never "*").
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.add_exception_handler(CodedHTTPException, coded_http_exception_handler)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
