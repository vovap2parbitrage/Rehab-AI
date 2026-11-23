from datetime import UTC, date, datetime

from app.core.timezones import app_today, day_bounds, now_local


def test_the_day_starts_at_midnight_ukrainian_time_in_winter():
    start, end = day_bounds(date(2026, 1, 15))  # UTC+2

    assert start == datetime(2026, 1, 14, 22, 0, tzinfo=UTC)
    assert end == datetime(2026, 1, 15, 22, 0, tzinfo=UTC)


def test_the_day_follows_summer_time():
    start, end = day_bounds(date(2026, 7, 15))  # UTC+3

    assert start == datetime(2026, 7, 14, 21, 0, tzinfo=UTC)
    assert end == datetime(2026, 7, 15, 21, 0, tzinfo=UTC)


def test_a_day_changing_the_clock_is_not_24_hours_long():
    start, end = day_bounds(date(2026, 3, 29))  # clocks go forward at 03:00

    assert (end - start).total_seconds() == 23 * 3600


def test_today_is_the_date_of_now_in_the_application_zone():
    assert app_today() == now_local().date()
