"""Data fetching service.

Coordinates OHLCV data retrieval between local CacheService and Dhan API.
Handles range filtering and merging logic.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional, Union

import pandas as pd

from services.cache_service import CacheService
from services.dhan_historical import fetch_historical_data as fetch_dhan_data
from services.scrip_master import get_instrument_by_symbol

logger = logging.getLogger(__name__)


class DataFetcher:
    """Orchestrates market data fetching via Cache and Dhan API.

    Args:
        headers: Optional Flask request headers for context.
    """

    def __init__(self, headers: Optional[dict] = None) -> None:
        """Initialize DataFetcher with CacheService."""
        self.headers = headers or {}
        self.cache = CacheService()

    def fetch_historical_data(
        self,
        symbol: str,
        timeframe: str = "1d",
        from_date: Optional[str] = None,
        to_date: Optional[str] = None
    ) -> Optional[pd.DataFrame]:
        """Fetch OHLCV data for a symbol.

        Checks CacheService first. If miss or insufficient range, fetches fresh data 
        from Dhan API and merges it into the cache.

        Args:
            symbol: Ticker symbol (e.g. 'RELIANCE').
            timeframe: '1m', '5m', '15m', '1h', '1d'.
            from_date: 'YYYY-MM-DD'.
            to_date: 'YYYY-MM-DD'.

        Returns:
            DataFrame with OHLCV data or None on failure.
        """
        cache_key = f"{symbol}_{timeframe}"
        
        # 1. Load from cache
        cached_df = self.cache.get(cache_key)
        
        # 2. Check if cache is sufficient
        start_req = pd.Timestamp(from_date) if from_date else None
        end_req = pd.Timestamp(to_date) if to_date else None
        
        if self._is_range_covered(cached_df, start_req, end_req):
            logger.info(f"⚡ Cache Hit for {symbol} ({timeframe})")
            return self._filter_and_standardize(cached_df, start_req, end_req)

        # 3. Fetch fresh data
        logger.info(f"🌍 Fetching fresh data from Dhan for {symbol} ({from_date} to {to_date})")
        fresh_df = self._fetch_from_api(symbol, timeframe, from_date, to_date)

        if fresh_df is None or fresh_df.empty:
            return self._filter_and_standardize(cached_df, start_req, end_req) if cached_df is not None else None

        # 4. Merge and Update Cache
        result_df = self.cache.merge_and_save(cache_key, cached_df, fresh_df)
        
        return self._filter_and_standardize(result_df, start_req, end_req)

    def get_cache_status(self) -> list[dict[str, Union[str, bool]]]:
        """Proxy to CacheService status metadata."""
        return self.cache.get_status()

    # ------------------------------------------------------------------
    # Private Helpers
    # ------------------------------------------------------------------

    def _fetch_from_api(
        self, symbol: str, timeframe: str, from_date: Optional[str], to_date: Optional[str]
    ) -> Optional[pd.DataFrame]:
        """Fetch data from Dhan API via service."""
        try:
            inst = get_instrument_by_symbol(symbol)
            if not inst:
                logger.error(f"Symbol {symbol} not found")
                return None
            
            # Default ranges
            to_date = to_date or datetime.now().strftime("%Y-%m-%d")
            from_date = from_date or (datetime.now() - pd.Timedelta(days=365)).strftime("%Y-%m-%d")

            df = fetch_dhan_data(
                security_id=inst["security_id"],
                exchange_segment=inst["exchange_segment"],
                instrument_type=inst["instrument_type"],
                timeframe=timeframe,
                from_date=from_date,
                to_date=to_date
            )
            
            if df is not None and not df.empty:
                df.columns = [c.lower() for c in df.columns]
                return df
            return None
        except Exception as e:
            logger.error(f"API fetch error for {symbol}: {e}")
            return None

    def _is_range_covered(
        self, df: Optional[pd.DataFrame], start: Optional[pd.Timestamp], end: Optional[pd.Timestamp]
    ) -> bool:
        """Check if DataFrame covers requested range."""
        if df is None or df.empty or not start or not end:
            return df is not None and not df.empty
            
        return df.index.min() <= start and df.index.max() >= end

    def _filter_and_standardize(
        self, df: pd.DataFrame, start: Optional[pd.Timestamp], end: Optional[pd.Timestamp]
    ) -> pd.DataFrame:
        """Filter to range and ensure column casing."""
        if df.empty:
            return df
            
        # Ensure column casing
        df.columns = [c.lower() for c in df.columns]
        
        res = df
        if start:
            if res.index.tz and not start.tz:
                start = start.tz_localize(res.index.tz)
            res = res.loc[res.index >= start]
            
        if end:
            inclusive_end = end + pd.Timedelta(days=1, microseconds=-1)
            if res.index.tz and not inclusive_end.tz:
                inclusive_end = inclusive_end.tz_localize(res.index.tz)
            res = res.loc[res.index <= inclusive_end]
            
        return res
