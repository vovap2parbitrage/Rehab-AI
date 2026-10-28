from enum import Enum


class Role(str, Enum):
    PATIENT = "patient"
    THERAPIST = "therapist"
    ADMIN = "admin"


ALLOWED_ROLES = {Role.PATIENT, Role.THERAPIST, Role.ADMIN}
