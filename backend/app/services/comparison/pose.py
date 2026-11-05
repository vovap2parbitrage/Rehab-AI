from dataclasses import dataclass

import cv2
import numpy as np
from mediapipe.python.solutions import pose as mp_pose


@dataclass
class PoseSequence:
    points: np.ndarray
    visibility: np.ndarray
    detected: np.ndarray
    fps: float


def extract_pose(video_path: str) -> PoseSequence:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if np.isnan(fps):
        fps = 30.0

    points, visibility, detected = [], [], []
    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            h, w = frame.shape[:2]
            result = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            if result.pose_landmarks:
                lm = result.pose_landmarks.landmark
                points.append([[p.x * w, p.y * h] for p in lm])
                visibility.append([p.visibility for p in lm])
                detected.append(True)
            else:
                points.append(np.full((33, 2), np.nan))
                visibility.append(np.zeros(33))
                detected.append(False)
    cap.release()

    return PoseSequence(
        points=np.array(points),
        visibility=np.array(visibility),
        detected=np.array(detected),
        fps=float(fps),
    )
