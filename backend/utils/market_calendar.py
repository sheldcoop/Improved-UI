"""Market calendar utilities for NSE India."""
from datetime import date
import pandas as pd

# List of NSE holidays for 2024 (excluding weekends)
# Source: NSE India official website
NSE_HOLIDAYS_2024 = [
    date(2024, 1, 26),  # Republic Day
    date(2024, 3, 8),   # Mahashivratri
    date(2024, 3, 25),  # Holi
    date(2024, 3, 29),  # Good Friday
    date(2024, 4, 11),  # Id-ul-Fitr (Ramadan Eid)
    date(2024, 4, 17),  # Shri Ram Navami
    date(2024, 5, 1),   # Maharashtra Day
    date(2024, 5, 20),  # General Parliamentary Elections
    date(2024, 6, 17),  # Bakri Id
    date(2024, 7, 17),  # Moharram
    date(2024, 8, 15),  # Independence Day
    date(2024, 10, 2),  # Mahatma Gandhi Jayanti
    date(2024, 11, 1),  # Diwali Laxmi Pujan
    date(2024, 11, 15), # Gurunanak Jayanti
    date(2024, 12, 25), # Christmas
]

def get_nse_trading_days(start_date: date, end_date: date) -> pd.DatetimeIndex:
    """Get a DatetimeIndex of NSE trading days between start and end.
    
    Excludes Saturdays, Sundays, and official NSE holidays.
    """
    days = pd.bdate_range(start=start_date, end=end_date)
    # Filter out NSE holidays
    trading_days = days[~days.isin([pd.Timestamp(h) for h in NSE_HOLIDAYS_2024])]
    return trading_days

def is_trading_day(dt: date) -> bool:
    """Check if a given date is an NSE trading day."""
    if dt.weekday() >= 5: # Saturday or Sunday
        return False
    if dt in NSE_HOLIDAYS_2024:
        return False
    return True
