import itertools

import numpy as np
from scipy.signal import find_peaks


def split_repetitions(signal: np.ndarray, fps: float, min_depth: float = 25.0):
    """Return list of (start, end) frame indices, one per repitition."""

    inverted = -signal
    valleys, _ = find_peaks(
        inverted,
        prominence=min_depth,
        distance=int(0.8 * fps),
    )
    if len(valleys) == 0:
        return []

    cuts = [0] + [(a + b) // 2 for a, b in itertools.pairwise(valleys)] + [len(signal) - 1]
    return list(itertools.pairwise(cuts))
