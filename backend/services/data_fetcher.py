"""Data fetching service — replaces DataEngine from engine.py.

Handles historical OHLCV data retrieval with Parquet-based caching.
Supports AlphaVantage, YFinance, and synthetic fallback data sources.
"""
from __future__ import annotations


import os
import logging
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path

from services.dhan_historical import fetch_historical_data as fetch_dhan_data
from services.scrip_master import get_instrument_by_symbol

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = BASE_DIR / "cache_dir"
CACHE_TTL_HOURS = 24


class DataFetcher:
    """Fetches historical market data with Parquet file caching.

    Primary data source: Dhan API.
    All fetched data is cached as Parquet (Snappy compressed) for 24 hours.

    Args:
        headers: Flask request headers dict. (x-alpha-vantage-key is deprecated)
    """

    # Universe definitions for testing
    UNIVERSE_TICKERS: dict[str, list[str]] = {
        "NIFTY_50": ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "AXISBANK", "SBIN"],
        "BANK_NIFTY": ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "INDUSINDBK"],
    }

    def __init__(self, headers: dict) -> None:
        self.use_dhan: bool = True  # Always use Dhan as primary source
        self.used_synthetic: bool = False  # Set True when synthetic fallback is used
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def is_cached(self, symbol: str, timeframe: str = "1d", from_date: str | None = None, to_date: str | None = None) -> bool:
        """Check if data for symbol/timeframe is fully covered in a fresh cache.

        Mirrors the same TTL logic as _load_parquet() so callers get a
        consistent answer about whether a live fetch will actually be skipped.
        """
        cache_key = f"{symbol}_{timeframe}"
        file_path = self._cache_path(cache_key)

        if not file_path.exists():
            return False

        # Honour the same 24-hour TTL used by _load_parquet()
        age_hours = (datetime.now().timestamp() - file_path.stat().st_mtime) / 3600
        if age_hours > CACHE_TTL_HOURS:
            return False

        if not from_date or not to_date:
            return True

        try:
            df = pd.read_parquet(file_path)
            start_req = pd.Timestamp(from_date)
            end_req = pd.Timestamp(to_date)
            cache_start = df.index.min()
            cache_end = df.index.max()
            # 1 day buffer
            return cache_start <= start_req + pd.Timedelta(days=1) and cache_end >= end_req - pd.Timedelta(days=1)
        except Exception:
            return False

    def fetch_historical_data(
        self, symbol: str, timeframe: str = "1d", from_date: str | None = None, to_date: str | None = None
    ) -> pd.DataFrame | dict | None:
        """Fetch OHLCV data for a symbol, using Parquet cache when available.

        Args:
            symbol: Ticker symbol (e.g. 'NIFTY 50', 'RELIANCE') or universe
                ID (e.g. 'NIFTY_50', 'BANK_NIFTY').
            timeframe: Candle interval. One of '1m', '5m', '15m', '1h', '1d'.
                Defaults to '1d'.

        Returns:
            A pandas DataFrame with columns [Open, High, Low, Close, Volume]
            and a DatetimeIndex, or a dict of DataFrames for universe symbols.
            Returns None if all data sources fail.
        """
        # Use a provider-neutral cache key so switching providers doesn't invalidate data
        cache_key = f"{symbol}_{timeframe}"

        # Universe symbols return a dict of DataFrames — handle separately
        if symbol in self.UNIVERSE_TICKERS:
            cached_universe = self._load_universe_parquet(cache_key)
            if cached_universe is not None:
                return cached_universe
            fresh_universe = self._fetch_universe(symbol, timeframe)
            if fresh_universe:
                self._save_universe_parquet(cache_key, fresh_universe)
            return fresh_universe

        # Smart Cache Merging for single-asset DataFrames
        # 1. Load cache
        cached_df = self._load_parquet(cache_key)
        
        # 2. Check if cache covers the requested range
        start_req = pd.Timestamp(from_date) if from_date else None
        end_req = pd.Timestamp(to_date) if to_date else None
        
        needs_fetch = True
        if cached_df is not None and not cached_df.empty:
            # If no specific range requested, returns cached
            if not start_req and not end_req:
                needs_fetch = False
            
            # If range requested, check coverage
            if start_req and end_req:
                cache_start = cached_df.index.min()
                cache_end = cached_df.index.max()
                # Allow 1 day buffer
                if cache_start <= start_req and cache_end >= end_req:
                    needs_fetch = False
                    logger.info(f"⚡ Cache Hit (Full Coverage) for {symbol}")
                else:
                    logger.info(f"⚠️ Cache Partial Miss for {symbol}: Need {start_req.date()}..{end_req.date()}, have {cache_start.date()}..{cache_end.date()}")

        if not needs_fetch:
             result_df = cached_df
        else:
             # 3. Fetch fresh data
             logger.info(f"🌍 Starting Fresh API Fetch for {symbol} ({from_date} to {to_date})")
             fresh_df = self._fetch_live(symbol, timeframe, from_date, to_date)
     
             # 4. Merge and Save
             result_df = None
             if fresh_df is not None and not fresh_df.empty:
                 if cached_df is not None and not cached_df.empty:
                     # Combine and deduplicate
                     combined = pd.concat([cached_df, fresh_df])
                     combined = combined[~combined.index.duplicated(keep='last')]
                     combined = combined.sort_index()
                     self._save_parquet(cache_key, combined)
                     result_df = combined
                 else:
                     self._save_parquet(cache_key, fresh_df)
                     result_df = fresh_df
             else:
                 # If fetch failed but we have cache, return cache as fallback
                 result_df = cached_df
            
        # 5. Filter result to requested date range
        if result_df is not None and not result_df.empty:
            if start_req:
                if result_df.index.tz is not None and start_req.tz is None:
                    start_req = start_req.tz_localize(result_df.index.tz)
                elif result_df.index.tz is None and start_req.tz is not None:
                    start_req = start_req.tz_localize(None)
                result_df = result_df.loc[result_df.index >= start_req]
            if end_req:
                end_req_inclusive = end_req + pd.Timedelta(days=1, microseconds=-1)
                if result_df.index.tz is not None and end_req_inclusive.tz is None:
                    end_req_inclusive = end_req_inclusive.tz_localize(result_df.index.tz)
                elif result_df.index.tz is None and end_req_inclusive.tz is not None:
                    end_req_inclusive = end_req_inclusive.tz_localize(None)
                result_df = result_df.loc[result_df.index <= end_req_inclusive]
                
        return result_df

    def get_cache_status(self) -> list[dict]:
        """Scan cache directory and return metadata for all cached datasets.

        Returns:
            List of dicts with keys: symbol, timeframe, startDate, lastUpdated, size, health.
        """
        results = []
        if not CACHE_DIR.exists():
            return results

        for p in CACHE_DIR.glob("*.parquet"):
            try:
                # Cache keys are usually symbol_timeframe.parquet
                stem = p.stem
                parts = stem.split("_")
                if len(parts) >= 2:
                    symbol = parts[0]
                    timeframe = parts[1]
                else:
                    symbol = stem
                    timeframe = "unknown"

                # Read only index to get start/end dates (efficient)
                # Note: We use engine='pyarrow' if available for better performance
                df_meta = pd.read_parquet(p, columns=[])
                
                start_date = "-"
                end_date = "-"
                if not df_meta.empty:
                    start_date = str(df_meta.index.min().date())
                    end_date = str(df_meta.index.max().date())

                size_mb = p.stat().st_size / (1024 * 1024)
                
                results.append({
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "startDate": start_date,
                    "lastUpdated": end_date,
                    "size": f"{size_mb:.1f} MB",
                    "health": "GOOD", # Default, validate route will refine this
                    "dataAvailable": True
                })
            except Exception as exc:
                logger.warning(f"Failed to read metadata for {p.name}: {exc}")
                continue

        return results

    def fetch_option_chain(self, symbol: str, expiry: str) -> list:
        """Fetch option chain data for a symbol and expiry date.

        Args:
            symbol: Underlying symbol (e.g. 'NIFTY 50').
            expiry: Expiry date string in 'YYYY-MM-DD' format.

        Returns:
            List of option strike dicts. Returns empty list until
            Dhan live API is integrated (see DhanHQ-py-main/ reference).
        """
        # TODO: Integrate dhanhq option chain API
        # from dhanhq import DhanContext, dhanhq
        # dhan = dhanhq(DhanContext(client_id, access_token))
        # return dhan.get_option_chain(...)
        logger.warning(f"fetch_option_chain called for {symbol}/{expiry} — Dhan not yet integrated")
        return []

    # ------------------------------------------------------------------
    # Private: Data Sources
    # ------------------------------------------------------------------

    def _fetch_live(
        self, symbol: str, timeframe: str, from_date: str | None = None, to_date: str | None = None
    ) -> pd.DataFrame | dict | None:
        """Fetch live data from Dhan.
        
        Args:
            symbol: Ticker or universe ID.
            timeframe: Candle interval string.
            
        Returns:
            DataFrame, dict of DataFrames (universe), or None on failure.
        """
        # 1. Try Dhan
        df = self._fetch_dhan(symbol, timeframe, from_date, to_date)
        if df is not None and not df.empty:
            return df

        # 2. Check for Universe Request
        if symbol in self.UNIVERSE_TICKERS:
            return self._fetch_universe(symbol, timeframe)

        # 3. Last Resort: Synthetic (for testing only)
        logger.warning(f"Dhan fetch failed for {symbol}. Using synthetic data fallback.")
        self.used_synthetic = True
        return self._generate_synthetic(symbol, timeframe)

    def _fetch_dhan(self, symbol: str, timeframe: str, from_date: str | None = None, to_date: str | None = None) -> pd.DataFrame | None:
        """Fetch data from Dhan API.
        
        Args:
            symbol: Ticker symbol string.
            timeframe: Candle interval string.
            from_date: Optional start date 'YYYY-MM-DD'.
            to_date: Optional end date 'YYYY-MM-DD'.
            
        Returns:
            Standardised OHLCV DataFrame or None on failure.
        """
        logger.info(f"Fetching {symbol} via Dhan [{timeframe}]...")
        try:
            # Map symbol to instrument details
            inst = get_instrument_by_symbol(symbol)
            if not inst:
                logger.error(f"Symbol {symbol} not found in Scrip Master")
                return None
            
            # Use current year as default range if not specified
            if not to_date:
                to_date = datetime.now().strftime("%Y-%m-%d")
            if not from_date:
                from_date = (datetime.now().replace(year=datetime.now().year - 1)).strftime("%Y-%m-%d")

            df = fetch_dhan_data(
                security_id=inst["security_id"],
                exchange_segment=inst["exchange_segment"],
                instrument_type=inst["instrument_type"],
                timeframe=timeframe,
                from_date=from_date,
                to_date=to_date
            )
            
            if df is not None and not df.empty:
                # Dhan returns lowercase columns, standardize to Uppercase for VBT
                df.columns = [c.capitalize() for c in df.columns]
                return df
            return None
        except Exception as exc:
            logger.error(f"Dhan fetch failed for {symbol}: {exc}")
            return None


    def _fetch_universe(self, universe_id: str, timeframe: str) -> dict:
        """Generate synthetic multi-asset universe data.

        Args:
            universe_id: Universe identifier (e.g. 'NIFTY_50').
            timeframe: Candle interval string (used for period length).

        Returns:
            Dict with keys ['Open', 'High', 'Low', 'Close', 'Volume'],
            each a DataFrame where columns are ticker symbols.
        """
        tickers = self.UNIVERSE_TICKERS.get(universe_id, ["STOCK_A", "STOCK_B", "STOCK_C"])
        logger.info(f"Generating Universe Data for {universe_id} ({len(tickers)} assets)")

        periods = 200
        dates = pd.date_range(end=datetime.now(), periods=periods, freq="D")

        close_data, open_data, high_data, low_data, volume_data = {}, {}, {}, {}, {}
        for t in tickers:
            base = 1000 + np.random.randint(0, 500)
            returns = np.random.normal(0.0005, 0.02, periods)
            price = base * (1 + returns).cumprod()
            close_data[t] = price
            open_data[t] = price
            high_data[t] = price * 1.01
            low_data[t] = price * 0.99
            volume_data[t] = np.random.randint(1000, 50000, periods)

        return {
            "Open": pd.DataFrame(open_data, index=dates),
            "High": pd.DataFrame(high_data, index=dates),
            "Low": pd.DataFrame(low_data, index=dates),
            "Close": pd.DataFrame(close_data, index=dates),
            "Volume": pd.DataFrame(volume_data, index=dates),
        }

    def _generate_synthetic(self, symbol: str, timeframe: str) -> pd.DataFrame:
        """Generate synthetic OHLCV data as a last-resort fallback.

        Args:
            symbol: Symbol name (used to set a realistic base price).
            timeframe: Candle interval string.

        Returns:
            Synthetic OHLCV DataFrame with a DatetimeIndex.
        """
        periods = 200 if timeframe == "1d" else 1000
        freq_map = {"1m": "T", "5m": "5T", "15m": "15T", "1h": "H", "1d": "D"}
        freq = freq_map.get(timeframe, "D")

        dates = pd.date_range(end=datetime.now(), periods=periods, freq=freq)
        base_price = 22000 if "NIFTY" in symbol else 100
        returns = np.random.normal(0.0005, 0.015, periods)
        price_path = base_price * (1 + returns).cumprod()

        return pd.DataFrame(
            {
                "Open": price_path,
                "High": price_path * 1.01,
                "Low": price_path * 0.99,
                "Close": price_path,
                "Volume": np.random.randint(1000, 50000, periods),
            },
            index=dates,
        )

    # ------------------------------------------------------------------
    # Private: Parquet Cache (Issue #9 fix)
    # ------------------------------------------------------------------

    def _cache_path(self, cache_key: str) -> Path:
        """Return the Parquet file path for a given cache key.

        Args:
            cache_key: Unique string key for the cached dataset.

        Returns:
            Path object pointing to the .parquet file.
        """
        safe_key = cache_key.replace(" ", "_").replace("/", "_")
        return CACHE_DIR / f"{safe_key}.parquet"

    def _universe_cache_dir(self, cache_key: str) -> Path:
        """Return the directory used to store universe (dict) cache files."""
        safe_key = cache_key.replace(" ", "_").replace("/", "_")
        return CACHE_DIR / f"universe_{safe_key}"

    def _load_parquet(self, cache_key: str) -> pd.DataFrame | None:
        """Load a cached DataFrame from Parquet if it exists and is fresh.

        Args:
            cache_key: Unique string key for the cached dataset.

        Returns:
            Cached DataFrame or None if cache miss / stale / corrupt.
        """
        path = self._cache_path(cache_key)
        if not path.exists():
            return None

        age_hours = (datetime.now().timestamp() - path.stat().st_mtime) / 3600
        if age_hours > CACHE_TTL_HOURS:
            logger.info(f"Cache stale for {cache_key} ({age_hours:.1f}h old). Refreshing.")
            return None

        try:
            df = pd.read_parquet(path)
            # Ensure columns are standardized (Open, High, Low, Close, Volume)
            if not df.empty:
                df.columns = [c.capitalize() for c in df.columns]
            return df
        except Exception as exc:
            logger.warning(f"Failed to read Parquet cache for {cache_key}: {exc}")
            return None

    def _load_universe_parquet(self, cache_key: str) -> dict | None:
        """Load a cached universe dict-of-DataFrames from Parquet files.

        Each OHLCV key (Open, High, Low, Close, Volume) is stored as a
        separate Parquet file inside a per-universe subdirectory.

        Args:
            cache_key: Unique string key for the cached universe.

        Returns:
            Dict of DataFrames keyed by OHLCV column name, or None on miss/stale.
        """
        cache_dir = self._universe_cache_dir(cache_key)
        sentinel = cache_dir / ".meta"  # touch this file to track mtime
        if not cache_dir.exists() or not sentinel.exists():
            return None

        age_hours = (datetime.now().timestamp() - sentinel.stat().st_mtime) / 3600
        if age_hours > CACHE_TTL_HOURS:
            logger.info(f"Universe cache stale for {cache_key} ({age_hours:.1f}h old). Refreshing.")
            return None

        try:
            result = {}
            for col in ("Open", "High", "Low", "Close", "Volume"):
                p = cache_dir / f"{col}.parquet"
                if not p.exists():
                    return None
                result[col] = pd.read_parquet(p)
            logger.info(f"⚡ Universe Cache Hit for {cache_key}")
            return result
        except Exception as exc:
            logger.warning(f"Failed to read universe cache for {cache_key}: {exc}")
            return None

    def _save_universe_parquet(self, cache_key: str, data: dict) -> None:
        """Persist a universe dict-of-DataFrames to Parquet files.

        Args:
            cache_key: Unique string key for the cached universe.
            data: Dict with OHLCV keys, each value a DataFrame.
        """
        if not data:
            return
        cache_dir = self._universe_cache_dir(cache_key)
        try:
            cache_dir.mkdir(parents=True, exist_ok=True)
            for col, df in data.items():
                df.to_parquet(cache_dir / f"{col}.parquet", compression="snappy")
            # Touch sentinel file to track cache age
            (cache_dir / ".meta").touch()
            logger.info(f"💾 Cached Universe {cache_key} → {cache_dir.name}/")
        except Exception as exc:
            logger.warning(f"Failed to write universe cache for {cache_key}: {exc}")

    def _save_parquet(self, cache_key: str, df: pd.DataFrame) -> None:
        """Save a DataFrame to Parquet with Snappy compression.

        Args:
            cache_key: Unique string key for the cached dataset.
            df: DataFrame to persist. Must have a DatetimeIndex.
        """
        if df is None or df.empty:
            return
        path = self._cache_path(cache_key)
        try:
            df.to_parquet(path, compression="snappy")
            logger.info(f"💾 Cached {cache_key} → {path.name}")
        except Exception as exc:
            logger.warning(f"Failed to write Parquet cache for {cache_key}: {exc}")
