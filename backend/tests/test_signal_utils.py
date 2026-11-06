import numpy as np
import pytest

from app.services.comparison.signal_utils import fill_nans, smooth


def test_fill_nans_interpolates():
    x = np.array([1.0, np.nan, 3.0])
    assert fill_nans(x)[1] == pytest.approx(2.0)


def test_smooth_removes_spike():
    x = np.full(50, 170.0)
    x[25] = 60.0                      # one-frame glitch
    assert smooth(x)[25] == pytest.approx(170.0, abs=1.0)


def test_smooth_keeps_real_valley():
    t = np.linspace(0, 2 * np.pi, 100)
    x = 120 + 60 * np.cos(t)          # one smooth squat-like cycle
    assert np.nanmin(smooth(x)) == pytest.approx(60, abs=3)
