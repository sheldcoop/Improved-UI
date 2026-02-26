"""Multi-Timeframe Resampler — reusable service for indicator MTF analysis.

This module provides the single authoritative implementation for:
  - Resampling OHLCV data from a base timeframe to any higher timeframe
  - Aligning higher-timeframe indicator series back to the original index
    using forward-fill (so daily charts can consume a weekly RSI value)
  - Per-request caching so the same higher-timeframe DataFrame is never
    computed more than once during a single strategy evaluation

Usage:
    resampler = TimeframeResampler(base_df)
    weekly_df = resampler.get_ohlcv("1W")
    weekly_rsi = vbt.RSI.run(weekly_df["close"], window=14).rsi
    aligned    = resampler.align_to_base(weekly_rsi)
    # aligned is now a daily Series forward-filled from weekly values
"""
from __future__ import annotations

import logging
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Timeframe string → pandas resample rule mapping
# Covers all timeframes in the frontend Timeframe enum + standard higher TFs.
# ---------------------------------------------------------------------------
TF_TO_PANDAS: dict[str, str] = {
    # Intraday
    "1m":  "1min",
    "5m":  "5min",
    "15m": "15min",
    "1h":  "1h",
    # Daily
    "1d":  "1D",
    # Higher timeframes (used in MTF conditions)
    "1W":  "1W",    # weekly — ISO week (ends Sunday)
    "2W":  "2W",    # bi-weekly
    "1ME": "1ME",   # month-end (pandas 2.0+ alias)
    "1M":  "1ME",   # friendly alias
    "3M":  "3ME",   # quarterly
    "1Y":  "1YE",   # yearly
}

# OHLCV aggregation rules — applied when resampling to a higher timeframe
OHLCV_AGG: dict[str, str] = {
    "open":   "first",
    "high":   "max",
    "low":    "min",
    "close":  "last",
    "volume": "sum",
}


class TimeframeResampler:
    """Resample OHLCV data to a higher timeframe and align back to base index.

    One instance should be created per strategy evaluation.  It holds an
    internal LRU-style cache keyed by target timeframe string so that
    multiple conditions using the same higher TF share one resampled
    DataFrame.

    Args:
        base_df: The base OHLCV DataFrame (or dict of DataFrames for
            universe mode) at the strategy's native timeframe.

    Example:
        >>> resampler = TimeframeResampler(daily_df)
        >>> weekly_close = resampler.get_ohlcv("1W")["close"]
        >>> weekly_rsi   = vbt.RSI.run(weekly_close, window=14).rsi
        >>> daily_rsi    = resampler.align_to_base(weekly_rsi)
        >>> # daily_rsi is now a daily Series suitable for condition comparison
    """

    def __init__(self, base_df: pd.DataFrame | dict) -> None:
        self._base_df = base_df
        self._is_universe = isinstance(base_df, dict)
        self._cache: dict[str, pd.DataFrame | dict] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_ohlcv(self, timeframe: str) -> pd.DataFrame | dict:
        """Return OHLCV data resampled to *timeframe*.

        If *timeframe* matches the base timeframe or is not recognised,
        the original DataFrame is returned unchanged.

        Args:
            timeframe: Target timeframe string, e.g. ``"1W"``, ``"1ME"``.
                Must be a key in :data:`TF_TO_PANDAS`.

        Returns:
            Resampled OHLCV DataFrame (or dict of DataFrames for universe
            mode).  Result is cached — subsequent calls with the same
            *timeframe* return the cached object directly.
        """
        if not timeframe or timeframe not in TF_TO_PANDAS:
            return self._base_df

        if timeframe in self._cache:
            return self._cache[timeframe]

        pandas_rule = TF_TO_PANDAS[timeframe]
        try:
            if self._is_universe:
                resampled = self._resample_universe(pandas_rule)
            else:
                resampled = self._resample_single(self._base_df, pandas_rule)
            self._cache[timeframe] = resampled
            logger.debug(f"MTF: resampled to {timeframe} ({pandas_rule}), bars={self._bar_count(resampled)}")
            return resampled
        except Exception as exc:
            logger.warning(f"MTF resample failed for {timeframe}: {exc}. Falling back to base.")
            return self._base_df

    def align_to_base(self, higher_tf_series: pd.Series) -> pd.Series:
        """Forward-fill a higher-timeframe Series back to the base index.

        This is the key step for multi-timeframe analysis: a weekly RSI
        value is "held" on every daily bar until the next weekly close
        updates it.

        Args:
            higher_tf_series: Indicator Series computed on a higher
                timeframe (e.g. weekly RSI).

        Returns:
            Series with the same index as the base DataFrame, forward-filled
            from the higher-timeframe values.

        Example:
            If weekly RSI on 2025-W01 = 32.1, then all daily bars in
            that week will show RSI=32.1 until the next weekly bar.
        """
        base_index = (
            self._base_df["close"].index
            if self._is_universe
            else self._base_df.index
        )
        return (
            higher_tf_series
            .reindex(base_index.union(higher_tf_series.index))
            .ffill()
            .reindex(base_index)
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _resample_single(self, df: pd.DataFrame, rule: str) -> pd.DataFrame:
        """Resample a single-asset OHLCV DataFrame."""
        available_cols = {c: OHLCV_AGG[c] for c in OHLCV_AGG if c in df.columns}
        resampled = df.resample(rule).agg(available_cols).dropna(how="all")
        return resampled

    def _resample_universe(self, rule: str) -> dict:
        """Resample a universe dict of DataFrames."""
        return {
            col: (
                data.resample(rule)
                    .agg(OHLCV_AGG.get(col, "last"))
                    .dropna(how="all")
            )
            for col, data in self._base_df.items()
        }

    @staticmethod
    def _bar_count(df: pd.DataFrame | dict) -> int:
        if isinstance(df, dict):
            sample = next(iter(df.values()), pd.DataFrame())
            return len(sample)
        return len(df)
