from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse

PATIENT_LIMIT_REACHED = "patient_limit_reached"


class CodedHTTPException(HTTPException):
    """HTTP error that also carries a machine-readable ``code`` next to the text ``detail``."""

    def __init__(self, status_code: int, detail: str, code: str) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code


def patient_limit_reached(detail: str) -> CodedHTTPException:
    return CodedHTTPException(status.HTTP_409_CONFLICT, detail, PATIENT_LIMIT_REACHED)


async def coded_http_exception_handler(_request: Request, exc: CodedHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code},
        headers=exc.headers,
    )
