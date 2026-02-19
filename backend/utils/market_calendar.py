import pandas_market_calendars as mcal
from datetime import date
import pandas as pd

# Initialize NSE Calendar
nse = mcal.get_calendar('NSE')

def get_nse_trading_days(start_date: date, end_date: date) -> pd.DatetimeIndex:
    """Get a DatetimeIndex of NSE trading days between start and end.
    
    Uses pandas_market_calendars for accuracy across all years.
    Excludes Saturdays, Sundays, and official NSE holidays.
    """
    # mcal expects strings or datetime objects
    valid_days = nse.valid_days(start_date=str(start_date), end_date=str(end_date))
    # valid_days is a DatetimeIndex in UTC, we strip time for index comparison
    return valid_days.tz_localize(None).normalize()

def is_trading_day(dt: date) -> bool:
    """Check if a given date is an NSE trading day."""
    # Convert date to string for mcal check
    day_str = str(dt)
    valid_days = nse.valid_days(start_date=day_str, end_date=day_str)
    return len(valid_days) > 0
