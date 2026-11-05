"""Who is calling the comparison endpoints.

This branch has no authentication yet, so the default dependency refuses every
request (fail closed). When the auth code from `main` is merged, make
`require_user_id` return the authenticated user's id (as a string) and delete
the 401 below. Tests override this dependency.
"""

from fastapi import HTTPException, status


def require_user_id() -> str:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )
