import numpy as np
import pytest

from app.services.comparison.scoring import find_segments, penalty, score_repetition

FPS = 30.0


def test_penalty_curve():
    tol = np.array([15.0])
    assert penalty(np.array([10.0]), tol)[0] == 0
    assert penalty(np.array([22.5]), tol)[0] == pytest.approx(0.5)
    assert penalty(np.array([-40.0]), tol)[0] == 1


def test_find_segments():
    bad = np.array([0, 1, 1, 0, 1, 0, 0, 1, 1], dtype=bool)
    assert find_segments(bad) == [(1, 2), (4, 4), (7, 8)]


def _identity_path(n):
    return [(i, i) for i in range(n)]


def test_identical_gives_ten_and_no_errors():
    x = np.linspace(170, 60, 60)[:, None]
    r = score_repetition(x, x, _identity_path(60), ["r_knee"], {}, FPS)
    assert r.score == pytest.approx(10)
    assert r.errors == []


def test_constant_big_offset_gives_zero_and_one_error():
    ref = np.full((60, 1), 100.0)
    pat = ref + 40.0            # >= 2*tol everywhere
    r = score_repetition(pat, ref, _identity_path(60), ["r_knee"], {}, FPS)
    assert r.score == pytest.approx(0)
    assert len(r.errors) == 1
    assert r.errors[0]["direction"] == "too_straight"
    assert r.errors[0]["peak_deviation_deg"] == pytest.approx(40)


def test_short_blip_is_ignored():
    ref = np.full((60, 1), 100.0)
    pat = ref.copy()
    pat[10:15] += 40            # 5 frames = 0.17 s < 0.3 s
    r = score_repetition(pat, ref, _identity_path(60), ["r_knee"], {}, FPS)
    assert r.errors == []


def test_custom_tolerance_changes_result():
    ref = np.full((60, 1), 100.0)
    pat = ref + 20.0
    strict = score_repetition(pat, ref, _identity_path(60), ["r_knee"], {"r_knee": 10}, FPS)
    loose = score_repetition(pat, ref, _identity_path(60), ["r_knee"], {"r_knee": 30}, FPS)
    assert strict.score < loose.score
    assert loose.errors == []