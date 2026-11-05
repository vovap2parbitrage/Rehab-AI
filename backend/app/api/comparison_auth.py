"""Who is calling the comparison endpoints: the authenticated, active user's id."""

from fastapi import Depends

from app.api.deps import get_current_active_user
from app.models.user import User


def require_user_id(user: User = Depends(get_current_active_user)) -> str:
    return str(user.id)
