import numpy as np

from app.services.comparison.angles import (
    JOINT_TRIPLETS,
    L_HIP, R_HIP, L_SHOULDER, R_SHOULDER,
    TORSO_TILT,
    expand_body_parts,
    frame_angles,
)
from app.services.comparison.dtw import dtw_path
from app.services.comparison.pose import PoseSequence, extract_pose
from app.services.comparison.repetitions import split_repetitions
from app.services.comparison.scoring import score_repetition
from app.services.comparison.signal_utils import smooth

MIN_VISIBILITY = 0.4
MIN_VALID_PCT = 80.0


def _joint_visible(vis: np.ndarray, joint: str) -> np.ndarray:
    """vis: (frames, 33). Returns bool per frame."""
    if joint == TORSO_TILT:
        left = (vis[:, [L_SHOULDER, L_HIP]] >= MIN_VISIBILITY).all(axis=1)
        right = (vis[:, [R_SHOULDER, R_HIP]] >= MIN_VISIBILITY).all(axis=1)
        return left | right
    return (vis[:, list(JOINT_TRIPLETS[joint])] >= MIN_VISIBILITY).all(axis=1)


def _quality_pct(seq, joints):
    ok = seq.detected.copy()
    for j in joints:
        ok &= _joint_visible(seq.visibility, j)
    return float(100 * ok.mean())


def _angle_table(seq: PoseSequence, joints: list[str]) -> np.ndarray:
    raw = np.array(
        [frame_angles(seq.points[i], joints, seq.visibility[i]) for i in range(len(seq.points))]
    )
    return np.column_stack([smooth(raw[:, c]) for c in range(raw.shape[1])])


def compare(
    reference_path: str,
    patient_path: str,
    body_parts: list[str],
    tolerances: dict[str, float] | None = None,
) -> dict:
    joints = expand_body_parts(body_parts)
    tolerances = tolerances or {}

    ref_seq = extract_pose(reference_path)
    pat_seq = extract_pose(patient_path)

    ref_q = _quality_pct(ref_seq, joints)
    pat_q = _quality_pct(pat_seq, joints)
    quality = {
        "reference_valid_frames_pct": round(ref_q, 1),
        "patient_valid_frames_pct": round(pat_q, 1),
        "ok": ref_q >= MIN_VALID_PCT and pat_q >= MIN_VALID_PCT,
    }
    if not quality["ok"]:
        return {
            "status": "rerecord",
            "score": None,
            "message": "Selected body parts are not clearly visible. Please re-record.",
            "quality": quality,
        }

    ref = _angle_table(ref_seq, joints)
    pat = _angle_table(pat_seq, joints)

    main = int(np.argmax(ref.max(axis=0) - ref.min(axis=0)))
    segments = split_repetitions(pat[:, main], pat_seq.fps)
    if not segments:
        return {
            "status": "no_repetitions",
            "score": None,
            "message": "No repetitions found in the patient video.",
            "quality": quality,
        }

    reps = []
    for start, end in segments:
        rep = pat[start:end + 1]
        path = dtw_path(rep, ref)
        reps.append(
            score_repetition(rep, ref, path, joints, tolerances, pat_seq.fps, offset=start)
        )

    scores = [r.score for r in reps]
    joint_scores = {j: float(np.mean([r.joint_scores[j] for r in reps])) for j in joints}
    errors = sorted((e for r in reps for e in r.errors), key=lambda e: e["start_s"])

    return {
        "status": "done",
        "score": round(float(np.mean(scores)), 1),
        "worst_repetition_score": round(float(min(scores)), 1),
        "repetitions": len(reps),
        "repetition_scores": [round(s, 1) for s in scores],
        "joint_scores": {j: round(s, 1) for j, s in joint_scores.items()},
        "errors": errors,
        "quality": quality,
    }
