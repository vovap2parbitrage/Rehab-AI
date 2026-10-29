import numpy as np
import pytest

from app.services.comparison.angles import (
    L_ANKLE,
    L_HIP,
    L_KNEE,
    L_SHOULDER,
    R_HIP,
    R_SHOULDER,
    calculate_angle,
    expand_body_parts,
    frame_angles,
    torso_tilt,
)


def test_right_angle():
    assert calculate_angle((0, 1), (0, 0), (1, 0)) == pytest.approx(90)


def test_straight_line_is_180():
    assert calculate_angle((-1, 0), (0, 0), (1, 0)) == pytest.approx(180)


def test_degenerate_returns_nan():
    assert np.isnan(calculate_angle((0, 0), (0, 0), (1, 0)))


def _torso(shoulder_shift_x: float) -> np.ndarray:
    pts = np.zeros((33, 2))
    pts[L_SHOULDER] = [0.4 + shoulder_shift_x, 0.3]
    pts[R_SHOULDER] = [0.6 + shoulder_shift_x, 0.3]
    pts[L_HIP] = [0.4, 0.6]
    pts[R_HIP] = [0.6, 0.6]
    return pts


def test_upright_torso_is_zero():
    assert torso_tilt(_torso(0.0)) == pytest.approx(0)


def test_leaning_torso_is_45():
    assert torso_tilt(_torso(0.3)) == pytest.approx(45)


def test_expand_body_parts_dedupes():
    assert expand_body_parts(["torso", "left_leg"]) == ["torso_tilt", "l_hip", "r_hip", "l_knee"]


def test_unknown_part_raises():
    with pytest.raises(ValueError):
        expand_body_parts(["head"])


def test_frame_angles_knee_straight():
    pts = np.zeros((33, 2))
    pts[L_HIP], pts[L_KNEE], pts[L_ANKLE] = [0, 0], [0, 1], [0, 2]
    assert frame_angles(pts, ["l_knee"])[0] == pytest.approx(180)


def test_frame_angles_mixed_joints():
    pts = _torso(0.0)
    pts[L_HIP], pts[L_KNEE], pts[L_ANKLE] = [0, 0], [0, 1], [0, 2]
    result = frame_angles(pts, ["torso_tilt", "l_knee"])
    assert result.shape == (2,)
    assert result[1] == pytest.approx(180)


def test_torso_visibility_follows_reliable_side():
    pts = _torso(0.0)
    pts[R_SHOULDER] = [0.9, 0.3]  # bad guess for the occluded shoulder
    vis = np.ones(33)
    vis[R_SHOULDER] = 0.0  # not trusted
    # right shoulder ignored -> shoulder_mid ~ (0.4, 0.3); hip_mid = (0.5, 0.6)
    # vector to shoulders = (-0.1, -0.3), up = (0, -1)
    expected = np.degrees(np.arctan2(0.1, 0.3))
    assert torso_tilt(pts, vis) == pytest.approx(expected, abs=1e-3)


def test_torso_equal_visibility_matches_default():
    pts = _torso(0.3)
    assert torso_tilt(pts, np.ones(33)) == pytest.approx(torso_tilt(pts))


def test_torso_zero_visibility_does_not_crash():
    vis = np.zeros(33)
    result = torso_tilt(_torso(0.0), vis)
    assert result == pytest.approx(0)  # eps weights -> plain average


def test_frame_angles_passes_visibility():
    pts = _torso(0.0)
    pts[R_SHOULDER] = [0.9, 0.3]
    vis = np.ones(33)
    vis[R_SHOULDER] = 0.0
    with_vis = frame_angles(pts, ["torso_tilt"], vis)[0]
    without = frame_angles(pts, ["torso_tilt"])[0]
    assert with_vis != pytest.approx(without)


def test_torso_lean_direction_is_unsigned():
    assert torso_tilt(_torso(0.3)) == pytest.approx(torso_tilt(_torso(-0.3)))
