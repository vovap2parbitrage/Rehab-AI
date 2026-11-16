from enum import Enum


class BodyPart(str, Enum):
    """Body parts the video comparison can look at."""

    left_arm = "left_arm"
    right_arm = "right_arm"
    left_leg = "left_leg"
    right_leg = "right_leg"
    torso = "torso"
