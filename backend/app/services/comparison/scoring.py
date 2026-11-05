from dataclasses import dataclass

import numpy as np

DEFAULT_TOLERANCE = 10.0
MIN_ERROR_S = 0.3   # ignore blips shorter than this
MERGE_GAP_S = 0.2   # glue segments separated by less than this


@dataclass
class RepScore:
    score: float
    joint_scores: dict[str, float]
    errors: list[dict]


def penalty(dev: np.ndarray, tol: np.ndarray) -> np.ndarray:
    """0 within tolerance, grows linearly, saturates at 1 when |dev| >= 2*tol."""
    return np.clip((np.abs(dev) - tol) / tol, 0.0, 1.0)


def find_segments(bad: np.ndarray) -> list[tuple[int, int]]:
    """Runs of True in a boolean array -> [(start, end_inclusive), ...]."""
    segments, start = [], None
    for k, flag in enumerate(bad):
        if flag and start is None:
            start = k
        elif not flag and start is not None:
            segments.append((start, k - 1))
            start = None
    if start is not None:
        segments.append((start, len(bad) - 1))
    return segments


def score_repetition(
    patient: np.ndarray,       # (frames, joints) of this repetition
    reference: np.ndarray,     # (frames, joints)
    path: list[tuple[int, int]],
    joints: list[str],
    tolerances: dict[str, float],
    fps: float,
    offset: int = 0,           # first frame of this rep in the full patient video
) -> RepScore:
    pi = np.array([i for i, _ in path])
    rj = np.array([j for _, j in path])
    dev = patient[pi] - reference[rj]                       # (steps, joints)
    tol = np.array([tolerances.get(j, DEFAULT_TOLERANCE) for j in joints])

    pen = penalty(dev, tol)
    joint_scores = {j: float(10 * (1 - pen[:, c].mean())) for c, j in enumerate(joints)}
    score = float(10 * (1 - pen.mean()))

    errors = []
    for c, joint in enumerate(joints):
        bad = np.abs(dev[:, c]) > tol[c]
        segs = _merge(find_segments(bad), int(MERGE_GAP_S * fps), pi)
        for a, b in segs:
            start_f, end_f = pi[a], pi[b]
            if (end_f - start_f + 1) / fps < MIN_ERROR_S:
                continue
            k = a + int(np.argmax(np.abs(dev[a:b + 1, c])))
            errors.append({
                "joint": joint,
                "start_s": round((offset + start_f) / fps, 2),
                "end_s": round((offset + end_f) / fps, 2),
                "peak_deviation_deg": round(float(abs(dev[k, c])), 1),
                "direction": "too_bent" if dev[k, c] < 0 else "too_straight",
            })
    errors.sort(key=lambda e: e["start_s"])
    return RepScore(score, joint_scores, errors)


def _merge(segs, max_gap_frames, pi):
    """Merge segments whose patient-frame gap is small."""
    merged: list[list[int]] = []
    for a, b in segs:
        if merged and pi[a] - pi[merged[-1][1]] <= max_gap_frames:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    return [(a, b) for a, b in merged]