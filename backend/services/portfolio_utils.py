"""Shared portfolio-building utilities.

All three engines (BacktestEngine, OptimizationEngine/GridEngine, WFOEngine)
build VectorBT portfolios in an almost identical way.  This module provides
the single authoritative implementation so that:

  * fixes and improvements (e.g. passing open/high/low for accurate SL/TP
    intra-bar fills) are applied everywhere at once, and
  * duplicated helpers (_boolify, detect_freq) have a single home.
"""
from __future__ import annotations

import logging
import numpy as np
import pandas as pd
import vectorbt as vbt

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# boolify
# ---------------------------------------------------------------------------

def boolify(x) -> pd.Series | np.ndarray:
    """Convert a signal to a boolean dtype, filling NaN → False.

    VectorBT's numba JIT rejects object-dtype arrays.  This helper
    normalises Series, DataFrames, numpy arrays, and plain lists.
    """
    if isinstance(x, (pd.Series, pd.DataFrame)):
        try:
            return x.fillna(False).astype(bool)
        except Exception:
            return x.astype(bool)
    else:
        return np.asarray(x, dtype=bool)


# ---------------------------------------------------------------------------
# to_scalar
# ---------------------------------------------------------------------------

def to_scalar(val) -> float:
    """Safely convert a VectorBT metric to a Python float.

    VectorBT may return a pd.Series instead of a scalar when the portfolio
    was built from a sliced DataFrame (e.g. after a data-split).  This helper
    handles Series, numpy scalars, and plain Python numbers uniformly.
    """
    if isinstance(val, pd.Series):
        return float(val.iloc[0]) if len(val) > 0 else 0.0
    if hasattr(val, "item"):        # np.generic / 0-d np.ndarray
        return float(val.item())
    return float(val)


# ---------------------------------------------------------------------------
# detect_freq
# ---------------------------------------------------------------------------

def detect_freq(df: pd.DataFrame) -> str:
    """Return a VectorBT-compatible frequency string derived from *df*'s index.

    Uses the mode (most-common) time-delta so overnight/weekend gaps in
    intraday data don't distort the result.

    Returns one of: ``"1m"``, ``"5m"``, ``"15m"``, ``"1h"``, ``"1D"``.
    """
    try:
        sample = df if isinstance(df, pd.DataFrame) else df["Close"]
        if len(sample) > 1:
            diffs = sample.index.to_series().diff()
            mode_diff = diffs.mode()[0]
            minutes = int(mode_diff.total_seconds() / 60)
            if minutes == 1:
                return "1m"
            elif minutes == 5:
                return "5m"
            elif minutes == 15:
                return "15m"
            elif minutes == 60:
                return "1h"
            elif minutes >= 1440:
                return "1D"
    except Exception as exc:
        logger.warning(f"Freq detection failed: {exc}. Defaulting to 1D")
    return "1D"


# ---------------------------------------------------------------------------
# build_portfolio
# ---------------------------------------------------------------------------

def build_portfolio(
    close: pd.Series,
    entries: pd.Series,
    exits: pd.Series,
    config: dict,
    vbt_freq: str,
    df: pd.DataFrame | None = None,
) -> vbt.Portfolio:
    """Build a VectorBT portfolio consistently across all engines.

    Args:
        close:     Close-price Series.
        entries:   Boolean entry signal Series.
        exits:     Boolean exit signal Series.
        config:    Backtest/optimisation config dict.  Recognised keys:
                     slippage, initial_capital, commission,
                     positionSizing, positionSizeValue, pyramiding,
                     stopLossPct, takeProfitPct, useTrailingStop.
        vbt_freq:  VectorBT frequency string (e.g. ``"15m"``, ``"1D"``).
        df:        Full OHLCV DataFrame.  When *stopLossPct* or
                   *takeProfitPct* are active **and** ``df`` contains
                   ``Open``, ``High``, ``Low`` columns, those series are
                   forwarded to VectorBT so that intra-bar SL/TP hits are
                   detected accurately (not just at bar close).

                   This is the key fix that makes UI results match the
                   reference Colab script which also passes open/high/low.

    Returns:
        Completed ``vbt.Portfolio`` instance.
    """
    bt_slippage = float(config.get("slippage", 0.0)) / 100.0
    bt_initial_capital = float(config.get("initial_capital", 100000.0))
    # Commission is a flat amount per trade (e.g. ₹20).
    # Pass it as fixed_fees so VectorBT deducts exactly ₹20 per order,
    # matching the reference Colab script behaviour.
    bt_commission_fixed = float(config.get("commission", 20.0))

    sizing_mode = config.get("positionSizing", "Fixed Capital")
    bt_size_val = float(config.get("positionSizeValue", bt_initial_capital))
    if sizing_mode == "% of Equity":
        bt_size: float | None = bt_size_val / 100.0
        bt_size_type: str | None = "percent"
    elif sizing_mode == "Fixed Capital":
        # Deploy exactly bt_size_val per trade (e.g. ₹1,00,000), no compounding.
        # Matches backtest_engine.py and the reference Python script behaviour.
        bt_size = bt_size_val
        bt_size_type = "value"
    else:
        bt_size = np.inf
        bt_size_type = "amount"

    sl_pct  = float(config.get("stopLossPct", 0)) / 100.0
    tp_pct  = float(config.get("takeProfitPct", 0)) / 100.0
    tsl_pct = float(config.get("trailingStopPct", 0)) / 100.0

    # Sanitise signals — numba JIT rejects object-dtype arrays
    entries = boolify(entries)
    exits = boolify(exits)

    pf_kwargs: dict = {
        "freq": vbt_freq,
        "fees": 0.0,                    # percentage fee disabled
        "fixed_fees": bt_commission_fixed,  # flat ₹20 per trade
        "slippage": bt_slippage,
        "init_cash": bt_initial_capital,
        "size": bt_size,
        "size_type": bt_size_type,
        "accumulate": int(config.get("pyramiding", 1)) > 1,
    }

    if sl_pct > 0:
        pf_kwargs["sl_stop"] = sl_pct
    if tp_pct > 0:
        pf_kwargs["tp_stop"] = tp_pct
    # TSL (trailingStopPct) takes precedence over fixed SL when both are set:
    # it overwrites sl_stop with the trailing distance and enables sl_trail.
    # Legacy useTrailingStop (bool) is also supported for backward-compatibility.
    if tsl_pct > 0:
        pf_kwargs["sl_stop"] = tsl_pct
        pf_kwargs["sl_trail"] = True
    elif sl_pct > 0 and bool(config.get("useTrailingStop", False)):
        pf_kwargs["sl_trail"] = True

    # Pass Open/High/Low when SL or TP is active so VectorBT can detect
    # intra-bar trigger points rather than only checking at bar close.
    # This matches the reference Colab script behaviour and produces
    # accurate fill prices.
    if df is not None and (sl_pct > 0 or tp_pct > 0 or tsl_pct > 0):
        for col, kwarg in [("Open", "open"), ("High", "high"), ("Low", "low")]:
            if col in df.columns:
                pf_kwargs[kwarg] = df[col].reindex(close.index)

    return vbt.Portfolio.from_signals(close, entries, exits, **pf_kwargs)
