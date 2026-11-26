from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.security import PASSWORD_MAX_LENGTH

# Passwords are length-checked after normalization; this only bounds the work a request can cause.
RAW_PASSWORD_MAX_LENGTH = PASSWORD_MAX_LENGTH * 4


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=RAW_PASSWORD_MAX_LENGTH)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    role: Literal["patient", "therapist"]

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("first_name", "last_name")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=RAW_PASSWORD_MAX_LENGTH)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=RAW_PASSWORD_MAX_LENGTH)
    new_password: str = Field(max_length=RAW_PASSWORD_MAX_LENGTH)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role: str
    is_active: bool
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: date | None = None


class AuthSession(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserRead
