import itertools

import numpy as np

from app.services.comparison.dtw import dtw_path


def test_identical_sequences_match_diagonally():
    x = np.sin(np.linspace(0, 3, 30))[:, None]
    assert dtw_path(x, x) == [(i, i) for i in range(30)]


def test_slower_copy_is_aligned():
    t = np.linspace(0, 2 * np.pi, 40)
    ref = np.cos(t)[:, None]
    slow = np.cos(np.linspace(0, 2 * np.pi, 80))[:, None]   # same shape, twice slower
    path = dtw_path(slow, ref)
    diffs = [abs(slow[i, 0] - ref[j, 0]) for i, j in path]
    assert max(diffs) < 0.2          # matched phases have nearly equal values


def test_path_starts_and_ends_at_corners():
    a, b = np.random.rand(10, 2), np.random.rand(15, 2)
    path = dtw_path(a, b)
    assert path[0] == (0, 0) and path[-1] == (9, 14)


def test_path_is_monotonic():
    a, b = np.random.rand(10, 1), np.random.rand(12, 1)
    path = dtw_path(a, b)
    for (i1, j1), (i2, j2) in itertools.pairwise(path):
        assert i2 >= i1 and j2 >= j1
