from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.roles import Role

ASSIGNABLE_ROLES = {role.value for role in Role}
SELF_REQUESTABLE_ROLES = {Role.PATIENT.value, Role.THERAPIST.value}


class RoleAssignment(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in ASSIGNABLE_ROLES:
            raise ValueError(f"role must be one of: {', '.join(sorted(ASSIGNABLE_ROLES))}")
        return value


class RoleRequest(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in SELF_REQUESTABLE_ROLES:
            raise ValueError(
                "role must be one of: " + ", ".join(sorted(SELF_REQUESTABLE_ROLES))
            )
        return value


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role: str
    pending_role: str | None = None
    keycloak_sub: str | None = None
    is_active: bool
