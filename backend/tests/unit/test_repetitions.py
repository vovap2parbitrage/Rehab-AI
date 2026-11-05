import itertools

import numpy as np

from app.services.comparison.repetitions import split_repetitions

FPS = 30.0


def _squats(n_cycles: int) -> np.ndarray:
    """Smooth signal: standing ~170, bottom ~70, n_cycles squats, 3 s each."""
    t = np.linspace(0, n_cycles * 2 * np.pi, int(n_cycles * 3 * FPS))
    return 120 + 50 * np.cos(t)


def test_three_cycles_give_three_segments():
    assert len(split_repetitions(_squats(3), FPS)) == 3


def test_one_cycle_gives_one_segment():
    segs = split_repetitions(_squats(1), FPS)
    assert len(segs) == 1
    assert segs[0][0] == 0


def test_flat_signal_gives_no_segments():
    assert split_repetitions(np.full(200, 170.0), FPS) == []


def test_small_wiggle_is_ignored():
    x = np.full(200, 170.0)
    x[100] = 160.0  # only 10 deg deep, below min_depth=25
    assert split_repetitions(x, FPS) == []


def test_segments_cover_whole_signal_without_gaps():
    sig = _squats(3)
    segs = split_repetitions(sig, FPS)
    assert segs[0][0] == 0
    assert segs[-1][1] == len(sig) - 1
    for (_, end), (start, _) in itertools.pairwise(segs):
        assert end == start
