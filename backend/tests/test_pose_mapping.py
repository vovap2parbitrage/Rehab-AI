import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ANGLES = (ROOT / "backend/app/services/comparison/angles.py").read_text(encoding="utf-8")
PIPELINE = (ROOT / "backend/app/services/comparison/pipeline.py").read_text(encoding="utf-8")
POSE_MAPPING = (ROOT / "frontend/src/lib/poseMapping.ts").read_text(encoding="utf-8")


def _section(source: str, name: str) -> str:
    match = re.search(rf"{name}\s*=\s*\{{([\s\S]*?)\n\}}", source)
    assert match is not None, f"Could not read {name}"
    return match.group(1)


def _python_mapping(section: str, triplets: bool, landmarks: dict[str, int] | None = None) -> dict:
    result = {}
    for key, values in re.findall(r'"([^"]+)":\s*(\([^)]+\)|\[[^\]]+\])', section):
        if triplets:
            assert landmarks is not None
            result[key] = [landmarks[value.strip()] for value in values[1:-1].split(",")]
        else:
            tokens = re.findall(r'"([^"]+)"|(TORSO_TILT)', values)
            result[key] = [part or "torso_tilt" for part, _ in tokens]
    return result


def _typescript_mapping(section: str, triplets: bool) -> dict:
    result = {}
    for key, values in re.findall(r"(\w+):\s*\[([^\]]+)\]", section):
        if triplets:
            result[key] = [int(value) for value in values.split(",")]
        else:
            tokens = re.findall(r"'([^']+)'|(\w+)", values)
            result[key] = [
                "torso_tilt" if (string or identifier) == "TORSO_TILT" else string or identifier
                for string, identifier in tokens
            ]
    return result


def test_pose_mappings_match_backend_comparison_rules():
    landmarks = {}
    for names, values in re.findall(r"^([A-Z_, ]+)\s*=\s*([0-9, ]+)$", ANGLES, re.MULTILINE):
        for name, value in zip(names.split(","), values.split(",")):
            landmarks[name.strip()] = int(value)
    backend_joints = _python_mapping(
        _section(ANGLES, "JOINT_TRIPLETS"), triplets=True, landmarks=landmarks
    )
    backend_parts = _python_mapping(_section(ANGLES, "BODY_PARTS"), triplets=False)
    typescript_joints = _typescript_mapping(
        re.search(r"JOINT_TRIPLETS\s*=\s*\{([\s\S]*?)\n\}", POSE_MAPPING).group(1),
        triplets=True,
    )
    typescript_parts = _typescript_mapping(
        re.search(r"BODY_PART_JOINTS\s*=\s*\{([\s\S]*?)\n\}", POSE_MAPPING).group(1),
        triplets=False,
    )

    assert typescript_joints == backend_joints
    assert typescript_parts == backend_parts


def test_torso_visibility_pairs_match_backend_rule():
    landmarks = {}
    for names, values in re.findall(r"^([A-Z_, ]+)\s*=\s*([0-9, ]+)$", ANGLES, re.MULTILINE):
        for name, value in zip(names.split(","), values.split(",")):
            landmarks[name.strip()] = int(value)
    backend_pairs = [
        [landmarks["L_SHOULDER"], landmarks["L_HIP"]],
        [landmarks["R_SHOULDER"], landmarks["R_HIP"]],
    ]
    section = re.search(
        r"export const TORSO_VISIBILITY_PAIRS = \[([\s\S]*?)\] as const",
        POSE_MAPPING,
    )
    assert section is not None
    typescript_pairs = [
        [int(value) for value in pair.split(",")]
        for pair in re.findall(r"\[([0-9,\s]+)\]", section.group(1))
    ]

    assert typescript_pairs == backend_pairs
    assert "return left | right" in PIPELINE


def test_pose_visibility_thresholds_match_backend_pipeline():
    min_visibility = re.search(r"MIN_VISIBILITY\s*=\s*([0-9.]+)", PIPELINE)
    min_valid_pct = re.search(r"MIN_VALID_PCT\s*=\s*([0-9.]+)", PIPELINE)
    assert min_visibility is not None
    assert min_valid_pct is not None
    typescript_visibility = re.search(r"minVisibility:\s*([0-9.]+)", POSE_MAPPING)
    typescript_valid_pct = re.search(r"minValidPct:\s*([0-9.]+)", POSE_MAPPING)
    assert typescript_visibility is not None
    assert typescript_valid_pct is not None
    assert float(typescript_visibility.group(1)) == float(min_visibility.group(1))
    assert float(typescript_valid_pct.group(1)) == float(min_valid_pct.group(1))
