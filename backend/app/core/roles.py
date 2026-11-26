from enum import Enum


class Role(str, Enum):
    PATIENT = "patient"
    THERAPIST = "therapist"
