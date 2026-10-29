import numpy as np

L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28

JOINT_TRIPLETS = {
    "l_elbow": (L_SHOULDER, L_ELBOW, L_WRIST),
    "r_elbow": (R_SHOULDER, R_ELBOW, R_WRIST),
    "l_shoulder": (L_HIP, L_SHOULDER, L_ELBOW),
    "r_shoulder": (R_HIP, R_SHOULDER, R_ELBOW),
    "l_hip": (L_SHOULDER, L_HIP, L_KNEE),
    "r_hip": (R_SHOULDER, R_HIP, R_KNEE),
    "l_knee": (L_HIP, L_KNEE, L_ANKLE),
    "r_knee": (R_HIP, R_KNEE, R_ANKLE),
}

TORSO_TILT = "torso_tilt"

BODY_PARTS = {
    "left_arm": ["l_shoulder", "l_elbow"],
    "right_arm": ["r_shoulder", "r_elbow"],
    "left_leg": ["l_hip", "l_knee"],
    "right_leg": ["r_hip", "r_knee"],
    "torso": [TORSO_TILT, "l_hip", "r_hip"],
}

def calculate_angle(a, b, c) -> float:
    a, b, c = (np.asarray(p, dtype=float) for p in (a, b, c))
    ba, bc = a - b, c - b
    norm = np.linalg.norm(ba) * np.linalg.norm(bc)
    if norm == 0:
        return float("nan")
    cos = np.clip(np.dot(ba, bc) / norm, -1.0, 1.0)
    return float(np.degrees(np.arccos(cos)))

def torso_tilt(points: np.array) -> float:
    shoulder_mid = (points[L_SHOULDER] + points[R_SHOULDER]) / 2
    hip_mid = (points[L_HIP] + points[R_HIP]) / 2
    up = hip_mid + np.array([0.0, -1.0])
    return calculate_angle(shoulder_mid, hip_mid, up)

def expand_body_parts(parts: list[str]) -> list[str]:
    joints: list[str] = []
    for part in parts:
        if part not in BODY_PARTS:
            raise ValueError(f"Unknown part: {part}")
        for joint in BODY_PARTS[part]:
            if joint not in joints:
                joints.append(joint)
    return joints

def frame_angles(points: list[float], joints: list[str]) -> np.ndarray:
    result = []
    for joint in joints:
        if joint == TORSO_TILT:
            result.append(torso_tilt(points))
        else:
            a, b, c = JOINT_TRIPLETS[joint]
            result.append(calculate_angle(points[a], points[b], points[c]))
    return np.array(result)