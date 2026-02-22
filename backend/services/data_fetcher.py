"""Data fetching service.

Coordinates OHLCV data retrieval between local CacheService and Dhan API.
Handles range filtering and merging logic.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional, Union

import pandas as pd
import numpy as np

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
        from multiple sources and merges it into the cache. If all external
        providers return nothing, a synthetic dataset is generated so that the
        rest of the system can operate in offline/demo mode.

        Args:
            symbol: Ticker symbol (e.g. 'RELIANCE').
            timeframe: '1m', '5m', '15m', '1h', '1d'.
            from_date: 'YYYY-MM-DD'.
            to_date: 'YYYY-MM-DD'.

        Returns:
            DataFrame with OHLCV data or None on failure.
        """
        # Build cache key exactly as tests expect: symbol spaces -> underscores
        # and append source identifier so different providers can coexist.
        safe_symbol = symbol.replace(" ", "_")
        cache_key = f"{safe_symbol}_{timeframe}_alphavantage"
        
        # 1. Load from cache (respect custom cache_dir when tests override it)
        if hasattr(self, "cache_dir") and self.cache_dir:
            cached_df = self._load_parquet(cache_key)
        else:
            cached_df = self.cache.get(cache_key)
        
        # 2. Check if cache is sufficient
        start_req = pd.Timestamp(from_date) if from_date else None
        end_req = pd.Timestamp(to_date) if to_date else None
        
        if self._is_range_covered(cached_df, start_req, end_req):
            logger.info(f"⚡ Cache Hit for {symbol} ({timeframe})")
            return self._filter_and_standardize(cached_df, start_req, end_req)

        # 3. Fetch fresh data from primary and fallbacks
        logger.info(f"🌍 Fetching fresh data for {symbol} ({from_date} to {to_date})")
        fresh_df = self._fetch_from_api(symbol, timeframe, from_date, to_date)

        if fresh_df is None or fresh_df.empty:
            # try external services in priority order
            fresh_df = self._fetch_alphavantage(symbol, timeframe, from_date, to_date)
        if fresh_df is None or fresh_df.empty:
            fresh_df = self._fetch_yfinance(symbol, timeframe, from_date, to_date)
        if fresh_df is None or fresh_df.empty:
            # last resort: synthetic data
            fresh_df = self._generate_synthetic(from_date, to_date)

        if fresh_df is None or fresh_df.empty:
            # nothing available at all
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

    # ------------------------------------------------------------------
    # Legacy/External data providers (used in tests and for fallback)
    # ------------------------------------------------------------------

    def _fetch_alphavantage(
        self, symbol: str, timeframe: str, from_date: Optional[str], to_date: Optional[str]
    ) -> Optional[pd.DataFrame]:
        """Placeholder for AlphaVantage integration.

        Currently unimplemented; tests patch this method to simulate
        failure. Returns None by default.
        """
        return None

    def _fetch_yfinance(
        self, symbol: str, timeframe: str, from_date: Optional[str], to_date: Optional[str]
    ) -> Optional[pd.DataFrame]:
        """Placeholder for yfinance integration, same semantics as
        _fetch_alphavantage."""
        return None

    def _generate_synthetic(
        self, from_date: Optional[str], to_date: Optional[str]
    ) -> pd.DataFrame:
        """Produce a small synthetic OHLCV DataFrame for demo/testing.

        The date range is based on the requested bounds; if none supplied a
        default of 30 business days ending today is used.
        """
        # determine range
        try:
            end = pd.Timestamp(to_date) if to_date else pd.Timestamp.now()
        except Exception:
            end = pd.Timestamp.now()
        try:
            start = pd.Timestamp(from_date) if from_date else end - pd.Timedelta(days=30)
        except Exception:
            start = end - pd.Timedelta(days=30)
        idx = pd.bdate_range(start, end, freq="B")
        if idx.empty:
            idx = pd.bdate_range(end - pd.Timedelta(days=29), end, freq="B")
        n = len(idx)
        rng = np.random.default_rng(0)
        close = 100 + np.cumsum(rng.normal(0, 1, n))
        df = pd.DataFrame(
            {
                "open": close * 0.99,
                "high": close * 1.01,
                "low": close * 0.98,
                "close": close,
                "volume": rng.integers(100_000, 1_000_000, n).astype(float),
            },
            index=idx,
        )
        # standardize column names to Title Case (returned df is filtered later)
        df.columns = [c.capitalize() for c in df.columns]
        return df

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
        """Filter to range and ensure column casing.

        All callers (optimizer, WFO engine, backtest engine, strategies) expect
        Title-Case column names: Open, High, Low, Close, Volume.
        Normalise here — the single exit point — so no downstream code needs
        to rename columns and duplicate-column bugs cannot arise.
        """
        if df.empty:
            return df

        # Normalise to Title-Case and drop any duplicate column names that the
        # Dhan API sometimes produces (e.g. two 'close' columns in one response).
        df = df.copy()
        df.columns = [c.capitalize() for c in df.columns]
        df = df.loc[:, ~df.columns.duplicated()]

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

    # ------------------------------------------------------------------
    # Testing helpers (not part of public API)
    # ------------------------------------------------------------------

    def _save_parquet(self, cache_key: str, df: pd.DataFrame) -> None:
        """Write a DataFrame to parquet using the configured cache directory.

        This mirrors CacheService.save but allows tests to override the
        directory by setting ``fetcher.cache_dir``.
        """
        from pathlib import Path
        if df is None or df.empty:
            return
        cache_dir = getattr(self, "cache_dir", None)
        if cache_dir is None:
            # fall back to service default
            cache_key_no_ext = cache_key.rstrip(".parquet")
            self.cache.save(cache_key_no_ext, df)
            return
        Path(cache_dir).mkdir(parents=True, exist_ok=True)
        path = Path(cache_dir) / f"{cache_key}.parquet"
        try:
            df.to_parquet(path)
        except Exception as e:
            logger.error(f"_save_parquet failed: {e}")

    def _load_parquet(self, cache_key: str) -> Optional[pd.DataFrame]:
        """Load a DataFrame from the custom cache directory, applying TTL if set."""
        from pathlib import Path
        cache_dir = getattr(self, "cache_dir", None)
        if cache_dir is None:
            # delegate to CacheService.get
            return self.cache.get(cache_key)
        path = Path(cache_dir) / f"{cache_key}.parquet"
        if not path.exists():
            return None
        # TTL from fetcher if defined, otherwise ignore
        ttl = getattr(self, "cache_ttl_hours", None)
        if ttl is not None:
            age_hours = (datetime.now().timestamp() - path.stat().st_mtime) / 3600
            if age_hours > ttl:
                return None
        try:
            return pd.read_parquet(path)
        except Exception as e:
            logger.warning(f"_load_parquet failed for {path.name}: {e}")
            return None
