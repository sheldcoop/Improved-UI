"""Multi-symbol data fetcher for portfolio backtesting.

This module provides utilities to fetch OHLCV data for multiple stock symbols
concurrently, align them on a common date index, and return them in a format
ready for vectorbt's ``Portfolio.from_signals`` universe mode.

Design decisions:
    - Uses ``concurrent.futures.ThreadPoolExecutor`` to parallelise API calls.
    - Inner-join alignment: only dates where ALL symbols have data are kept.
      This prevents look-ahead bias from missing rows in sparse assets.
    - Symbols that fail to fetch are excluded with a warning (not a hard error),
      so a partial result is still returned when some symbols are unavailable.
    - Fully backward-compatible: single-symbol callers are unaffected.

Typical usage:
    >>> from services.multi_symbol_fetcher import MultiSymbolFetcher
    >>> fetcher = MultiSymbolFetcher(request_headers)
    >>> universe = fetcher.fetch(
    ...     symbols=["RELIANCE", "HDFC", "NIFTY 50"],
    ...     timeframe="1d",
    ...     from_date="2022-01-01",
    ...     to_date="2024-01-01",
    ... )
    >>> # universe is a dict: {"close": df, "open": df, "high": df, "low": df, "volume": df}
    >>> # each df has shape (n_dates, n_symbols)
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import pandas as pd

from services.data_fetcher import DataFetcher

logger = logging.getLogger(__name__)

# Maximum symbols allowed in one portfolio request.
# Keeps API load manageable and result sets meaningful.
MAX_SYMBOLS = 20


class MultiSymbolFetcher:
    """Fetch and align OHLCV data for multiple symbols in parallel.

    Args:
        request_headers: HTTP headers forwarded from the Flask request.
            Used by the underlying ``DataFetcher`` for authentication.

    Attributes:
        _fetcher: The underlying single-symbol data fetcher instance.
    """

    def __init__(self, request_headers: Any) -> None:
        """Initialise with request headers for DataFetcher authentication.

        Args:
            request_headers: Flask ``request.headers`` object or compatible dict.
        """
        self._fetcher = DataFetcher(request_headers)

    def fetch(
        self,
        symbols: list[str],
        timeframe: str = "1d",
        from_date: str | None = None,
        to_date: str | None = None,
        max_workers: int = 6,
    ) -> dict[str, pd.DataFrame] | None:
        """Fetch OHLCV data for multiple symbols, aligned on a common date index.

        Fetches all symbols in parallel using a thread pool. Aligns all
        DataFrames using an inner join on the date index so that only dates
        where every symbol has data are retained. Symbols that fail to fetch
        are excluded from the result with a warning logged.

        Args:
            symbols: List of ticker symbols, e.g. ``["RELIANCE", "HDFC"]``.
                Must not be empty. Maximum ``MAX_SYMBOLS`` (20) symbols allowed.
            timeframe: Candle interval (``"1m"``, ``"5m"``, ``"15m"``, ``"1h"``,
                ``"1d"``). Default ``"1d"``.
            from_date: Start date string in ``YYYY-MM-DD`` format. Optional.
                If ``None``, fetcher uses maximum available history.
            to_date: End date string in ``YYYY-MM-DD`` format. Optional.
            max_workers: Thread pool size. Default 6. Reduce if rate-limited.

        Returns:
            Dictionary with OHLCV column keys, each mapping to a wide DataFrame
            with columns = symbol names and index = aligned date index:
            ``{"open": df, "high": df, "low": df, "close": df, "volume": df}``
            Returns ``None`` if no symbols could be fetched successfully.

        Raises:
            ValueError: If ``symbols`` list is empty or exceeds ``MAX_SYMBOLS``.

        Example:
            >>> fetcher = MultiSymbolFetcher(headers)
            >>> universe = fetcher.fetch(["RELIANCE", "TCS"], "1d", "2023-01-01")
            >>> universe["close"].columns.tolist()
            ['RELIANCE', 'TCS']
        """
        if not symbols:
            raise ValueError("At least one symbol must be provided.")
        if len(symbols) > MAX_SYMBOLS:
            raise ValueError(
                f"Maximum {MAX_SYMBOLS} symbols allowed, got {len(symbols)}."
            )

        # Remove duplicates while preserving order
        unique_symbols = list(dict.fromkeys(s.strip().upper() for s in symbols))
        logger.info(
            f"MultiSymbolFetcher: fetching {len(unique_symbols)} symbols "
            f"[{', '.join(unique_symbols)}] on {timeframe}"
        )

        raw: dict[str, pd.DataFrame] = {}

        # Fetch in parallel — each call hits the DataFetcher / cache independently
        with ThreadPoolExecutor(max_workers=min(max_workers, len(unique_symbols))) as pool:
            future_to_symbol = {
                pool.submit(
                    self._fetch_single,
                    sym,
                    timeframe,
                    from_date,
                    to_date,
                ): sym
                for sym in unique_symbols
            }
            for future in as_completed(future_to_symbol):
                sym = future_to_symbol[future]
                try:
                    df = future.result()
                    if df is not None and not df.empty:
                        raw[sym] = df
                    else:
                        logger.warning(
                            f"MultiSymbolFetcher: no data returned for '{sym}' — excluded."
                        )
                except Exception as exc:
                    logger.warning(
                        f"MultiSymbolFetcher: failed to fetch '{sym}': {exc} — excluded."
                    )

        if not raw:
            logger.error("MultiSymbolFetcher: all symbol fetches failed.")
            return None

        logger.info(
            f"MultiSymbolFetcher: successfully fetched {len(raw)}/{len(unique_symbols)} symbols."
        )

        return self._align_universe(raw)

    def _fetch_single(
        self,
        symbol: str,
        timeframe: str,
        from_date: str | None,
        to_date: str | None,
    ) -> pd.DataFrame | None:
        """Fetch OHLCV for a single symbol via the shared DataFetcher.

        Args:
            symbol: Ticker symbol string.
            timeframe: Candle interval string.
            from_date: Optional start date (YYYY-MM-DD).
            to_date: Optional end date (YYYY-MM-DD).

        Returns:
            DataFrame with lowercase OHLCV columns, or ``None`` on failure.
        """
        try:
            df = self._fetcher.fetch_historical_data(
                symbol, timeframe, from_date=from_date, to_date=to_date
            )
            if df is None or (isinstance(df, pd.DataFrame) and df.empty):
                return None
            df.columns = [c.lower() for c in df.columns]
            return df
        except Exception as exc:
            logger.warning(f"_fetch_single({symbol}): {exc}")
            return None

    @staticmethod
    def _align_universe(
        raw: dict[str, pd.DataFrame],
    ) -> dict[str, pd.DataFrame]:
        """Align multiple OHLCV DataFrames on a common date index.

        Uses **inner join** so only dates present in *all* symbols are kept.
        This prevents look-ahead bias caused by NaN rows in sparse symbols.

        Args:
            raw: Dict mapping symbol → single-symbol OHLCV DataFrame.

        Returns:
            Wide-format dict: ``{"open": df, "high": df, ...}`` where each df
            has shape ``(n_aligned_dates, n_symbols)``.

        Example:
            If RELIANCE has 252 rows and HDFC has 248, the aligned output will
            have 248 rows (the intersection date range).
        """
        columns = ["open", "high", "low", "close", "volume"]
        result: dict[str, pd.DataFrame] = {}

        for col in columns:
            # Build wide DataFrame: union index, then inner-join reduces to common dates
            col_frames: dict[str, pd.Series] = {}
            for sym, df in raw.items():
                if col in df.columns:
                    col_frames[sym] = df[col]

            if not col_frames:
                continue

            # pd.concat with axis=1 does outer join by default → inner join via dropna
            wide = pd.concat(col_frames, axis=1)
            wide = wide.dropna()  # inner join: remove rows with any NaN
            wide.columns = list(col_frames.keys())  # ensure symbol names as columns
            result[col] = wide

        n_dates = len(next(iter(result.values()))) if result else 0
        n_syms = len(next(iter(result.values())).columns) if result else 0
        logger.info(
            f"MultiSymbolFetcher._align_universe: aligned to "
            f"{n_dates} bars × {n_syms} symbols."
        )
        return result


def parse_symbols_from_request(data: dict) -> list[str]:
    """Parse the symbol(s) from a backtest request payload.

    Handles both the legacy single-symbol format (``symbol: "NIFTY 50"``)
    and the new multi-symbol format (``symbols: ["RELIANCE", "HDFC"]``).

    Single-symbol requests (``symbols`` not present or has only one entry)
    are returned as a single-element list so the caller can decide the code path.

    Args:
        data: Parsed JSON body of the backtest request.

    Returns:
        Deduplicated list of symbol strings (upper-cased, stripped).

    Raises:
        ValueError: If no valid symbols can be extracted from the payload.

    Example:
        >>> parse_symbols_from_request({"symbol": "RELIANCE"})
        ['RELIANCE']
        >>> parse_symbols_from_request({"symbols": ["reliance", "hdfc "]})
        ['RELIANCE', 'HDFC']
    """
    # New multi-symbol field takes precedence
    symbols_raw = data.get("symbols")
    if symbols_raw and isinstance(symbols_raw, list):
        cleaned = [s.strip().upper() for s in symbols_raw if s and s.strip()]
        if cleaned:
            return list(dict.fromkeys(cleaned))  # deduplicate, preserve order

    # Legacy single-symbol field
    symbol = data.get("symbol", "").strip().upper()
    if symbol:
        return [symbol]

    raise ValueError("No valid symbol(s) provided in request.")
