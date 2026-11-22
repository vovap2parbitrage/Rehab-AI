from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# UTC+2 (UTC+3 in summer). Every account starts here until a time zone is chosen.
DEFAULT_TIMEZONE = "Europe/Kyiv"


def today_in(timezone_name: str | None) -> date:
    """The current calendar date in the given IANA time zone (default: Kyiv)."""
    try:
        zone = ZoneInfo(timezone_name or DEFAULT_TIMEZONE)
    except ZoneInfoNotFoundError:
        zone = ZoneInfo(DEFAULT_TIMEZONE)
    return datetime.now(zone).date()
