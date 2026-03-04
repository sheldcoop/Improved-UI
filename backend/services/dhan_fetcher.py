"""services/dhan_fetcher.py — DhanDataFetcher: unified market data interface.

Provides symbol→security_id mapping, historical OHLCV retrieval (daily and
intraday), and live LTP / market-quote fetching using the official dhanhq
library and the Dhan Scrip Master.

Used by:
  - services/signal_checker.py  (historical data for live indicator warmup)
  - services/ltp_service.py     (real-time price updates and SL/TP checks)
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)


class DhanDataFetcher:
    """Unified Dhan market data fetcher for paper trading services.

    Wraps DhanHistoricalService (OHLCV) and the dhanhq market-quote API
    behind a single, stable interface. All public methods log errors and
    return None / empty DataFrame — they never raise, so callers can treat
    None as "no data available".

    Usage::
        fetcher = DhanDataFetcher()
        security_id = fetcher.symbol_to_security_id("RELIANCE")
        df = fetcher.get_historical_daily("RELIANCE", "2024-01-01", "2024-06-01")
        ltp = fetcher.get_ltp("RELIANCE")
    """

    # ---------------------------------------------------------------------------
    # Symbol resolution
    # ---------------------------------------------------------------------------

    def symbol_to_security_id(self, symbol: str) -> Optional[str]:
        """Map a ticker symbol to a Dhan security_id.

        Args:
            symbol: NSE ticker or index alias (e.g. 'RELIANCE', 'NIFTY 50').

        Returns:
            Dhan security_id string, or None if the symbol is not found
            in the Scrip Master.
        """
        try:
            from services.scrip_master import get_instrument_by_symbol
            inst = get_instrument_by_symbol(symbol)
            if inst:
                return inst["security_id"]
            logger.warning(f"DhanDataFetcher: symbol not found in scrip master: {symbol}")
            return None
        except Exception as exc:
            logger.error(f"DhanDataFetcher.symbol_to_security_id failed for {symbol}: {exc}", exc_info=True)
            return None

    def _get_instrument(self, symbol: str) -> Optional[dict]:
        """Internal helper — returns full instrument dict or None."""
        try:
            from services.scrip_master import get_instrument_by_symbol
            return get_instrument_by_symbol(symbol)
        except Exception as exc:
            logger.error(f"DhanDataFetcher._get_instrument failed for {symbol}: {exc}", exc_info=True)
            return None

    # Timeframe normalisation: signal_checker uses '15min', '5min', '1hr', 'daily'.
    # DhanHistoricalService.fetch_ohlcv uses '1m', '5m', '15m', '1h', '1d'.
    _TF_MAP: dict[str, str] = {
        "1min":  "1m",
        "5min":  "5m",
        "15min": "15m",
        "30min": "30m",
        "60min": "1h",
        "1hr":   "1h",
        "daily": "1d",
        "1d":    "1d",
        # Pass-through (already normalised)
        "1m":  "1m",
        "5m":  "5m",
        "15m": "15m",
        "30m": "30m",
        "1h":  "1h",
    }

    # ---------------------------------------------------------------------------
    # Historical OHLCV
    # ---------------------------------------------------------------------------

    def get_historical_intraday(
        self,
        symbol: str,
        timeframe: str,
        from_date: str,
        to_date: str,
    ) -> Optional[pd.DataFrame]:
        """Fetch intraday OHLCV bars for a symbol.

        Handles 90-day chunking automatically (Dhan API Rule 3) via
        DhanHistoricalService.

        Args:
            symbol: NSE ticker (e.g. 'RELIANCE').
            timeframe: Candle interval string (e.g. '15min', '5min', '1hr').
            from_date: Start date 'YYYY-MM-DD'.
            to_date: End date 'YYYY-MM-DD'.

        Returns:
            DataFrame with lowercase columns [open, high, low, close, volume]
            and a DatetimeIndex, or None on failure.
        """
        return self._fetch(symbol, timeframe, from_date, to_date)

    def get_historical_daily(
        self,
        symbol: str,
        from_date: str,
        to_date: str,
    ) -> Optional[pd.DataFrame]:
        """Fetch daily OHLCV bars for a symbol.

        Args:
            symbol: NSE ticker (e.g. 'RELIANCE').
            from_date: Start date 'YYYY-MM-DD'.
            to_date: End date 'YYYY-MM-DD'.

        Returns:
            DataFrame or None on failure.
        """
        return self._fetch(symbol, "daily", from_date, to_date)

    def _fetch(
        self,
        symbol: str,
        timeframe: str,
        from_date: str,
        to_date: str,
    ) -> Optional[pd.DataFrame]:
        """Fetch historical OHLCV data, cache-first via DataFetcher.

        Routes through `DataFetcher` so Parquet cache is consulted first;
        live Dhan API is only called on a cache miss.  This prevents burning
        API quota on every scheduled signal check.

        Args:
            symbol: NSE ticker.
            timeframe: Any recognised timeframe string (normalised internally).
            from_date: 'YYYY-MM-DD'.
            to_date: 'YYYY-MM-DD'.

        Returns:
            DataFrame with lowercase OHLCV columns and DatetimeIndex, or None.
        """
        try:
            from services.data_fetcher import DataFetcher

            normalised_tf = self._TF_MAP.get(timeframe, timeframe)
            fetcher = DataFetcher()
            df = fetcher.fetch_historical_data(
                symbol=symbol,
                timeframe=normalised_tf,
                from_date=from_date,
                to_date=to_date,
            )
            if df is None or df.empty:
                logger.warning(f"DhanDataFetcher: empty response for {symbol} / {timeframe}")
                return None

            # Ensure lowercase columns (DataFetcher already does this, but be defensive)
            df.columns = [c.lower() for c in df.columns]
            return df
        except Exception as exc:
            logger.error(
                f"DhanDataFetcher._fetch failed for {symbol} / {timeframe}: {exc}",
                exc_info=True,
            )
            return None

    # ---------------------------------------------------------------------------
    # Live LTP / Market Quote
    # ---------------------------------------------------------------------------

    def get_market_quote(self, security_id: str) -> dict:
        """Fetch the latest market quote for a security.

        Calls dhanhq.market_quote() (official library).  Falls back to an
        empty dict on any error so callers receive a safe sentinel.

        Args:
            security_id: Dhan security_id string (e.g. '500325').

        Returns:
            Dict containing at minimum 'last_price' (float) if successful,
            otherwise an empty dict.

        Example return::
            {"last_price": 2945.60, "open": 2920.0, "high": 2960.0, ...}
        """
        try:
            client_id = os.getenv("DHAN_CLIENT_ID")
            access_token = os.getenv("DHAN_ACCESS_TOKEN")
            if not client_id or not access_token:
                logger.error("DhanDataFetcher.get_market_quote: Dhan credentials missing")
                return {}

            try:
                from dhanhq import dhanhq, DhanContext
                dhan = dhanhq(DhanContext(client_id, access_token))
            except (ImportError, TypeError):
                from dhanhq import dhanhq  # type: ignore[no-redef]
                dhan = dhanhq(client_id, access_token)

            # market_quote accepts a list of security IDs mapped by exchange segment
            response = dhan.market_quote(
                securities={"NSE_EQ": [security_id]},
                exchange_segment="NSE_EQ",
            )

            # Response format: {"status": "success", "data": {"NSE_EQ:500325": {...}}}
            if response.get("status") == "success":
                data = response.get("data", {})
                # Try the typical key format first
                key = f"NSE_EQ:{security_id}"
                quote = data.get(key) or (next(iter(data.values())) if data else {})
                ltp = (
                    quote.get("last_price")
                    or quote.get("ltp")
                    or quote.get("close")
                )
                if ltp is not None:
                    return {"last_price": float(ltp), **quote}
                logger.warning(f"DhanDataFetcher: LTP not found in quote for security_id={security_id}: {quote}")
                return quote
            else:
                logger.warning(
                    f"DhanDataFetcher.get_market_quote non-success: {response.get('remarks') or response}"
                )
                return {}
        except Exception as exc:
            logger.error(
                f"DhanDataFetcher.get_market_quote failed for security_id={security_id}: {exc}",
                exc_info=True,
            )
            return {}
