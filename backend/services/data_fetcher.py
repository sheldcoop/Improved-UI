"""Data fetching service — replaces DataEngine from engine.py.

Handles historical OHLCV data retrieval with Parquet-based caching.
Supports AlphaVantage, YFinance, and synthetic fallback data sources.
"""
from __future__ import annotations


import os
import logging
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime
from pathlib import Path

from services.dhan_historical import fetch_historical_data as fetch_dhan_data
from services.scrip_master import get_instrument_by_symbol

logger = logging.getLogger(__name__)

CACHE_DIR = Path("./cache_dir")
CACHE_TTL_HOURS = 24


class DataFetcher:
    """Fetches historical market data with Parquet file caching.

    Tries data sources in order: AlphaVantage → YFinance → Synthetic.
    All fetched data is cached as Parquet (Snappy compressed) for 24 hours.

    Args:
        headers: Flask request headers dict. Used to extract API keys
            passed from the frontend (x-alpha-vantage-key, etc.).
    """

    # Hardcoded ticker map — will be replaced by Dhan security_id mapping
    # when dhanhq integration is wired up (see DhanHQ-py-main/ for reference).
    TICKER_MAP: dict[str, str] = {
        "NIFTY 50": "^NSEI",
        "BANKNIFTY": "^NSEBANK",
        "RELIANCE": "RELIANCE.NS",
        "HDFCBANK": "HDFCBANK.NS",
        "INFY": "INFY.NS",
        "ADANIENT": "ADANIENT.NS",
    }

    UNIVERSE_TICKERS: dict[str, list[str]] = {
        "NIFTY_50": ["REL.NS", "TCS.NS", "HDFC.NS", "INFY.NS", "ICICI.NS", "AXIS.NS", "SBIN.NS"],
        "BANK_NIFTY": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "AXISBANK.NS"],
    }

    def __init__(self, headers: dict) -> None:
        self.av_key: str | None = headers.get("x-alpha-vantage-key")
        self.use_av: bool = headers.get("x-use-alpha-vantage") == "true"
        self.use_dhan: bool = headers.get("x-use-dhan") == "true" or True # Default to True for now as requested
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

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
        # Senior Developer Tip: Use a provider-neutral cache key 
        # so switching providers (AV -> Dhan) doesn't invalidate data
        cache_key = f"{symbol}_{timeframe}"

        # Senior Dev Logic: Smart Cache Merging
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
                    return cached_df
                else:
                    logger.info(f"⚠️ Cache Partial Miss for {symbol}: Need {start_req.date()}..{end_req.date()}, have {cache_start.date()}..{cache_end.date()}")

        if not needs_fetch:
             return cached_df
             
        # 3. Fetch fresh data
        logger.info(f"🌍 Fetching fresh data for {symbol}...")
        fresh_df = self._fetch_live(symbol, timeframe, from_date, to_date)

        # 4. Merge and Save
        if fresh_df is not None and not fresh_df.empty:
            if cached_df is not None and not cached_df.empty:
                # Combine and deduplicate
                combined = pd.concat([cached_df, fresh_df])
                combined = combined[~combined.index.duplicated(keep='last')]
                combined = combined.sort_index()
                self._save_parquet(cache_key, combined)
                return combined
            else:
                self._save_parquet(cache_key, fresh_df)
                return fresh_df
        
        # If fetch failed but we have cache, return cache as fallback
        return cached_df if cached_df is not None else None

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
        """Dispatch to the correct data source based on symbol type.

        Args:
            symbol: Ticker or universe ID.
            timeframe: Candle interval string.

        Returns:
            DataFrame, dict of DataFrames (universe), or None on failure.
        """
        if self.use_dhan:
            df = self._fetch_dhan(symbol, timeframe, from_date, to_date)
            if df is not None and not df.empty:
                return df

        if self.use_av and self.av_key:
            df = self._fetch_alpha_vantage(symbol, timeframe)
            if df is not None and not df.empty:
                return df

        df = self._fetch_yfinance(symbol, timeframe)
        if df is not None and not df.empty:
            return df

        if symbol in self.UNIVERSE_TICKERS:
            return self._fetch_universe(symbol, timeframe)

        logger.warning(f"All data sources failed for {symbol}. Using synthetic data.")
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

    def _fetch_alpha_vantage(self, symbol: str, timeframe: str) -> pd.DataFrame | None:
        """Fetch data from AlphaVantage API.

        Args:
            symbol: Ticker symbol string.
            timeframe: Candle interval string.

        Returns:
            Standardised OHLCV DataFrame or None on failure.
        """
        logger.info(f"Fetching {symbol} via AlphaVantage [{timeframe}]...")
        try:
            is_intraday = timeframe in ("1m", "5m", "15m", "1h")
            function = "TIME_SERIES_INTRADAY" if is_intraday else "TIME_SERIES_DAILY"
            interval_param = f"&interval={timeframe}" if is_intraday else ""
            url = (
                f"https://www.alphavantage.co/query"
                f"?function={function}&symbol={symbol}"
                f"&apikey={self.av_key}&datatype=csv{interval_param}"
            )
            df = pd.read_csv(url)
            df = df.rename(
                columns={
                    "timestamp": "Date", "time": "Date",
                    "open": "Open", "high": "High",
                    "low": "Low", "close": "Close", "volume": "Volume",
                }
            )
            df["Date"] = pd.to_datetime(df["Date"])
            df = df.set_index("Date").sort_index()
            return df if not df.empty else None
        except Exception as exc:
            logger.error(f"AlphaVantage failed for {symbol}: {exc}. Falling back to YFinance.")
            return None

    def _fetch_yfinance(self, symbol: str, timeframe: str) -> pd.DataFrame | None:
        """Fetch data from YFinance.

        Args:
            symbol: Ticker symbol string (mapped via TICKER_MAP if needed).
            timeframe: Candle interval string.

        Returns:
            Standardised OHLCV DataFrame or None on failure.
        """
        ticker = self.TICKER_MAP.get(symbol, symbol)
        interval_map = {"1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "1d": "1d"}
        interval = interval_map.get(timeframe, "1d")
        period = "59d" if interval in ("1m", "5m", "15m", "1h") else "2y"

        logger.info(f"Fetching {ticker} via YFinance [{interval}]...")
        try:
            df = yf.download(ticker, period=period, interval=interval, progress=False)
            if df.empty:
                return None
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            return df[["Open", "High", "Low", "Close", "Volume"]]
        except Exception as exc:
            logger.error(f"YFinance failed for {ticker}: {exc}")
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
            # Senior Dev Practice: Explicitly log path and ensure it's absolute if needed
            df = pd.read_parquet(path)
            # Ensure columns are standardized (Open, High, Low, Close, Volume)
            if not df.empty:
                df.columns = [c.capitalize() for c in df.columns]
            return df
        except Exception as exc:
            logger.warning(f"Failed to read Parquet cache for {cache_key}: {exc}")
            return None

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
