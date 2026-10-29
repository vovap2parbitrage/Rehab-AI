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
