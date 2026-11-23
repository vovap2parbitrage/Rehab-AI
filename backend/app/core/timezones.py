from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

# The whole application runs on Ukrainian time: UTC+2 in winter, UTC+3 in summer. "Today"
# for every user, assignment and dashboard is the calendar day in this zone.
APP_TIMEZONE = ZoneInfo("Europe/Kyiv")


def now_local() -> datetime:
    return datetime.now(APP_TIMEZONE)


def app_today() -> date:
    """The current calendar date in the application's time zone."""
    return now_local().date()


def day_bounds(day: date) -> tuple[datetime, datetime]:
    """The start (inclusive) and end (exclusive) of a local day, as UTC moments."""
    start = datetime.combine(day, time.min, tzinfo=APP_TIMEZONE)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=APP_TIMEZONE)
    return start.astimezone(UTC), end.astimezone(UTC)
