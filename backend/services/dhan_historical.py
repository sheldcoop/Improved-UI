"""Dhan Historical Data API service.

Fetches OHLCV data from DhanHQ v2 API for backtesting.
Handles both daily (/charts/historical) and intraday (/charts/intraday) endpoints.
"""

import logging
import os
from datetime import datetime, timedelta

import pandas as pd
import requests

logger = logging.getLogger(__name__)

DHAN_BASE_URL = "https://api.dhan.co/v2"

# Timeframe mapping for intraday
TIMEFRAME_MAP = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "25m": 25,
    "30m": 30,
    "60m": 60,
    "1h": 60,
    "125m": 125,
}


def _get_headers() -> dict:
    """Get Dhan API headers with access token."""
    access_token = os.getenv("DHAN_ACCESS_TOKEN", "")
    if not access_token:
        raise ValueError("DHAN_ACCESS_TOKEN not configured")
    
    return {
        "access-token": access_token,
        "Content-Type": "application/json",
        "Accept": "application/json"
    }


def fetch_historical_data(
    security_id: str,
    exchange_segment: str,
    instrument_type: str,
    timeframe: str,
    from_date: str,
    to_date: str,
    include_oi: bool = False
) -> pd.DataFrame:
    """Fetch historical OHLCV data from Dhan API.
    
    Args:
        security_id: Dhan security ID (e.g., "2885" for RELIANCE)
        exchange_segment: Always "NSE_EQ" for both Mainboard and SME
        instrument_type: "EQUITY", "FUTIDX", etc.
        timeframe: "1d" for daily, or "1m"/"5m"/"15m"/"1h" for intraday
        from_date: Start date "YYYY-MM-DD"
        to_date: End date "YYYY-MM-DD"
        include_oi: Include Open Interest data (default False)
    
    Returns:
        DataFrame with columns [open, high, low, close, volume] and DatetimeIndex
    
    Raises:
        requests.RequestException: If API call fails
        ValueError: If invalid parameters
    """
    headers = _get_headers()
    
    # Determine which endpoint to use
    if timeframe == "1d":
        return _fetch_daily_candles(
            security_id, exchange_segment, instrument_type,
            from_date, to_date, include_oi, headers
        )
    else:
        # Rule 3 Enforcement: Chunk requests > 90 days
        return _fetch_intraday_candles_chunked(
            security_id, exchange_segment, instrument_type,
            timeframe, from_date, to_date, include_oi, headers
        )


def _fetch_daily_candles(
    security_id: str,
    exchange_segment: str,
    instrument_type: str,
    from_date: str,
    to_date: str,
    include_oi: bool,
    headers: dict
) -> pd.DataFrame:
    """Fetch daily candles from /charts/historical endpoint."""
    
    url = f"{DHAN_BASE_URL}/charts/historical"
    
    payload = {
        "securityId": security_id,
        "exchangeSegment": exchange_segment,
        "instrument": instrument_type,
        "expiryCode": 0,
        "oi": include_oi,
        "fromDate": from_date,
        "toDate": to_date
    }
    
    logger.info(f"Fetching daily data: {security_id} from {from_date} to {to_date}")
    
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    
    if resp.status_code != 200:
        logger.error(f"Dhan API error: {resp.status_code} - {resp.text}")
        resp.raise_for_status()
    
    data = resp.json()
    return _convert_to_dataframe(data, symbol=security_id)


def _fetch_intraday_candles_chunked(
    security_id: str,
    exchange_segment: str,
    instrument_type: str,
    timeframe: str,
    from_date: str,
    to_date: str,
    include_oi: bool,
    headers: dict
) -> pd.DataFrame:
    """Fetch intraday candles in 90-day chunks as per Rule 3."""
    start_dt = datetime.strptime(from_date, "%Y-%m-%d")
    end_dt = datetime.strptime(to_date, "%Y-%m-%d")
    
    all_dfs = []
    current_start = start_dt
    
    while current_start <= end_dt:
        # Chunk logic: next 90 days or end_dt
        current_end = min(current_start + timedelta(days=89), end_dt)
        
        logger.info(f"Fetching intraday chunk: {current_start.date()} to {current_end.date()}")
        
        chunk_df = _fetch_intraday_batch(
            security_id, exchange_segment, instrument_type,
            timeframe, current_start.strftime("%Y-%m-%d"), 
            current_end.strftime("%Y-%m-%d"), include_oi, headers
        )
        
        if chunk_df is not None and not chunk_df.empty:
            all_dfs.append(chunk_df)
        
        current_start = current_end + timedelta(days=1)
        
    if not all_dfs:
        return pd.DataFrame()
        
    return pd.concat(all_dfs).sort_index()


def _fetch_intraday_batch(
    security_id: str,
    exchange_segment: str,
    instrument_type: str,
    timeframe: str,
    from_date: str,
    to_date: str,
    include_oi: bool,
    headers: dict
) -> pd.DataFrame:
    """Single batch fetch for intraday candles (max 90 days)."""
    
    # Map timeframe to interval
    interval = TIMEFRAME_MAP.get(timeframe)
    if interval is None:
        raise ValueError(f"Invalid timeframe: {timeframe}. Use: {list(TIMEFRAME_MAP.keys())}")
    
    url = f"{DHAN_BASE_URL}/charts/intraday"
    
    # Format dates with time for intraday
    # Dhan API expects 'YYYY-MM-DD HH:MM:SS'
    from_datetime = f"{from_date} 09:15:00"
    to_datetime = f"{to_date} 15:30:00"
    
    payload = {
        "securityId": security_id,
        "exchangeSegment": exchange_segment,
        "instrument": instrument_type,
        "interval": interval,
        "oi": include_oi,
        "fromDate": from_datetime,
        "toDate": to_datetime
    }
    
    logger.info(f"Fetching intraday data: {security_id} {timeframe} from {from_date} to {to_date}")
    
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    
    if resp.status_code != 200:
        logger.error(f"Dhan API error: {resp.status_code} - {resp.text}")
        resp.raise_for_status()
    
    data = resp.json()
    return _convert_to_dataframe(data, symbol=security_id)

def _convert_to_dataframe(data: dict, symbol: str = 'unknown') -> pd.DataFrame:
    """Convert Dhan API response to DataFrame.
    
    Dhan returns data as parallel arrays:
    {
        "open": [...],
        "high": [...],
        "low": [...],
        "close": [...],
        "volume": [...],
        "timestamp": [...],
        "open_interest": [...]  # optional
    }
    """
    if not data or "timestamp" not in data:
        raise ValueError("Invalid response from Dhan API: missing timestamp data")
    
    # Build DataFrame
    df = pd.DataFrame({
        "open": data.get("open", []),
        "high": data.get("high", []),
        "low": data.get("low", []),
        "close": data.get("close", []),
        "volume": data.get("volume", []),
    })
    
    # Parse timestamps
    timestamps = data.get("timestamp", [])
    if timestamps:
        # Dhan timestamps can be in milliseconds or seconds
        # Check if first timestamp looks like milliseconds (> year 2000 in ms)
        first_ts = timestamps[0] if timestamps else 0
        unit = "ms" if first_ts > 1_000_000_000_000 else "s"
        df.index = pd.to_datetime(timestamps, unit=unit)
        df.index.name = "timestamp"
    
    # Add OI if present
    if "open_interest" in data and data["open_interest"]:
        df["oi"] = data["open_interest"]
    
    # Senior Developer Tip: Run comprehensive sanitation before caching
    from services.data_cleaner import DataCleaner
    df = DataCleaner.clean(df, symbol=symbol)
    
    return df


def validate_date_range(from_date: str, to_date: str) -> tuple[str, str]:
    """Validate and normalize date range.
    
    Args:
        from_date: Start date string
        to_date: End date string
    
    Returns:
        Tuple of normalized (from_date, to_date) as "YYYY-MM-DD"
    """
    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d")
        
        if from_dt > to_dt:
            raise ValueError("from_date must be before to_date")
        
        return from_date, to_date
    except ValueError as e:
        raise ValueError(f"Invalid date format. Use YYYY-MM-DD: {e}")
