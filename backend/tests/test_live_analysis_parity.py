"""The browser judges repetitions with a TypeScript copy of dtw.py and scoring.py.

frontend/src/lib/liveAnalysis.fixture.json holds what the Python code answers for fixed inputs;
liveAnalysis.test.ts checks that the TypeScript gives the same. If this test fails, the Python
analysis changed: update the TypeScript port and regenerate the file with
`UPDATE_LIVE_FIXTURE=1 pytest tests/test_live_analysis_parity.py`.
"""

import json
import os
from pathlib import Path

import numpy as np

from app.services.comparison.dtw import dtw_path
from app.services.comparison.scoring import score_repetition

FIXTURE = Path(__file__).resolve().parents[2] / "frontend/src/lib/liveAnalysis.fixture.json"
JOINTS = ["r_hip", "r_knee"]


def _squat(depth: float, frames: int, wobble: float = 0.0) -> np.ndarray:
    """A deterministic squat: hip and knee go from 178 down to `depth` and back."""
    t = np.linspace(0, 1, frames)
    dip = np.sin(np.pi * t)
    knee = 178 - (178 - depth) * dip
    hip = 178 - (178 - depth - 5) * dip + wobble * np.sin(9 * np.pi * t)
    return np.column_stack([hip, knee]).round(1)


def build() -> dict:
    reference = _squat(60, 40)
    cases = []
    for name, patient, tolerances, fps in [
        ("perfect", _squat(60, 40), {}, 10.0),
        ("deeper_and_faster", _squat(35, 28, wobble=3), {}, 10.0),
        ("shallow_with_tight_knee", _squat(95, 33), {"r_knee": 4.0}, 8.0),
    ]:
        path = dtw_path(patient, reference)
        result = score_repetition(patient, reference, path, JOINTS, tolerances, fps, offset=7)
        cases.append(
            {
                "name": name,
                "patient": patient.tolist(),
                "tolerances": tolerances,
                "fps": fps,
                "offset": 7,
                "path": [[int(i), int(j)] for i, j in path],
                "score": result.score,
                "joint_scores": result.joint_scores,
                "errors": result.errors,
            }
        )
    return {"joints": JOINTS, "reference": reference.tolist(), "cases": cases}


def test_the_typescript_port_has_the_pythons_answers():
    expected = json.loads(json.dumps(build()))
    if os.environ.get("UPDATE_LIVE_FIXTURE"):
        FIXTURE.write_text(json.dumps(expected, indent=1) + "\n", encoding="utf-8")
    stored = json.loads(FIXTURE.read_text(encoding="utf-8"))

    assert stored == expected
