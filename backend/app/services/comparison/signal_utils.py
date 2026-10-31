import numpy as np
from scipy.signal import medfilt, savgol_filter

def fill_nans(x: np.ndarray) -> np.ndarray:
    """Linear interpolation over NaNs gaps."""
    x = x.copy()
    bad = np.isnan(x)
    if bad.all():
        return x
    idx = np.arange(len(x))
    x[bad] = np.interp(idx[bad], idx[~bad], x[~bad])
    return x

def smooth(x: np.ndarray) -> np.ndarray:
    x = fill_nans(x)
    x = medfilt(x, kernel_size=5)
    window = min(11, len(x) // 2 * 2 - 1)
    if window < 5:
        return x
    return savgol_filter(x, window_length=window, polyorder=2)
