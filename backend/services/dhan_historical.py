"""Dhan Historical Data API service.

Fetches OHLCV data using the official dhanhq library.
Handles both daily and intraday data with Rule 3 (90-day chunking) enforcement.
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
from dhanhq import dhanhq
from dotenv import load_dotenv

from services.data_cleaner import DataCleaner

logger = logging.getLogger(__name__)

# Load credentials from the specific backend/.env file
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)

# Timeframe mapping for intraday
TIMEFRAME_MAP = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "25m": 25,
    "30m": 30,
    "60m": 60,
    "1h": 60,
}


class DhanHistoricalService:
    """Service for interacting with Dhan Historical and Intraday APIs.
    
    Enforces Rule 2 (Official Libraries) and Rule 3 (90-day Intraday limit).
    """

    def __init__(self) -> None:
        """Initialize Dhan client using environment variables."""
        client_id = os.getenv("DHAN_CLIENT_ID")
        access_token = os.getenv("DHAN_ACCESS_TOKEN")
        
        if not client_id or not access_token:
            logger.error("DHAN_CLIENT_ID or DHAN_ACCESS_TOKEN missing in environment")
            raise ValueError("Dhan credentials not configured")
            
        self.dhan = dhanhq(client_id, access_token)

    def fetch_ohlcv(
        self,
        security_id: str,
        exchange_segment: str,
        instrument_type: str,
        timeframe: str,
        from_date: str,
        to_date: str,
    ) -> pd.DataFrame:
        """Fetch historical OHLCV data.
        
        Args:
            security_id: Dhan security ID.
            exchange_segment: Segment (e.g., 'NSE_EQ').
            instrument_type: Type (e.g., 'EQUITY').
            timeframe: '1d' or intraday ('1m', '5m', '15m', '1h').
            from_date: Start date 'YYYY-MM-DD'.
            to_date: End date 'YYYY-MM-DD'.
            
        Returns:
            DataFrame with columns [open, high, low, close, volume] and DatetimeIndex.
        """
        if timeframe == "1d":
            return self._fetch_daily(security_id, exchange_segment, instrument_type, from_date, to_date)
        else:
            return self._fetch_intraday_chunked(security_id, exchange_segment, instrument_type, timeframe, from_date, to_date)

    def _fetch_daily(
        self, security_id: str, exchange_segment: str, instrument_type: str, from_date: str, to_date: str
    ) -> pd.DataFrame:
        """Fetch daily data using dhan.historical_daily_data."""
        logger.info(f"Fetching daily data: {security_id} ({from_date} to {to_date})")
        
        data = self.dhan.historical_daily_data(
            security_id=security_id,
            exchange_segment=exchange_segment,
            instrument_type=instrument_type,
            expiry_code=0,
            from_date=from_date,
            to_date=to_date
        )
        return self._process_response(data, security_id, is_intraday=False)

    def _fetch_intraday_chunked(
        self, security_id: str, exchange_segment: str, instrument_type: str, timeframe: str, from_date: str, to_date: str
    ) -> pd.DataFrame:
        """Fetch intraday data in 90-day chunks (Rule 3)."""
        start_dt = datetime.strptime(from_date, "%Y-%m-%d")
        end_dt = datetime.strptime(to_date, "%Y-%m-%d")
        
        all_dfs = []
        current_start = start_dt
        
        while current_start <= end_dt:
            current_end = min(current_start + timedelta(days=89), end_dt)
            
            logger.debug(f"Fetching intraday chunk: {current_start.date()} to {current_end.date()}")
            
            data = self.dhan.intraday_minute_data(
                security_id=security_id,
                exchange_segment=exchange_segment,
                instrument_type=instrument_type,
                from_date=current_start.strftime("%Y-%m-%d"),
                to_date=current_end.strftime("%Y-%m-%d")
            )
            
            df_chunk = self._process_response(data, security_id, is_intraday=True)
            if not df_chunk.empty:
                all_dfs.append(df_chunk)
            
            current_start = current_end + timedelta(days=1)
            
        if not all_dfs:
            return pd.DataFrame()
            
        return pd.concat(all_dfs).sort_index()

    def _process_response(self, response: dict, symbol: str, is_intraday: bool = False) -> pd.DataFrame:
        """Convert Dhan API response to cleaned DataFrame."""
        if response.get("status") != "success" or not response.get("data"):
            logger.warning(f"Dhan API returned no data or error: {response}")
            return pd.DataFrame()
            
        df = pd.DataFrame(response["data"])
        
        # Handle Timestamps
        if "timestamp" in df.columns:
            # Standardize timestamp to DatetimeIndex
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="s")
            df.set_index("timestamp", inplace=True)
            
        # Select and order required columns
        required = ["open", "high", "low", "close", "volume"]
        df = df[[c for c in required if c in df.columns]]
        
        # Run Rule 10/Sanitation via DataCleaner
        return DataCleaner.clean(df, symbol=symbol, is_intraday=is_intraday)


# Legacy functional interface for compatibility with existing code
def fetch_historical_data(
    security_id: str,
    exchange_segment: str,
    instrument_type: str,
    timeframe: str,
    from_date: str,
    to_date: str,
    include_oi: bool = False # Keeping signature for compat, though library handle varies
) -> pd.DataFrame:
    """Wrapper for DhanHistoricalService.fetch_ohlcv."""
    service = DhanHistoricalService()
    return service.fetch_ohlcv(
        security_id, exchange_segment, instrument_type, timeframe, from_date, to_date
    )
