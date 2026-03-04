"""indicator_registry.py — Single source of truth for all technical indicators.

This module defines:
  - INDICATOR_GROUPS: Ordered mapping of group name → list of indicator specs
  - INDICATOR_REGISTRY: Flat map of indicator name → compute function

To add a new indicator, add one entry here. No other backend file needs changes.
The frontend reads indicator metadata via /api/indicators endpoint.

Each registry entry is a dict with:
  - name (str): Display name, must match IndicatorType enum
  - period_config (dict | None): {min, max, label} or None if no period needed
  - compute (Callable): Function(df, period) -> pd.Series
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd
import ta
import vectorbt as vbt

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Compute helpers — each takes (df: DataFrame, period: int) → pd.Series
# ─────────────────────────────────────────────────────────────────────────────

def _close(df: pd.DataFrame, period: int) -> pd.Series:
    return df["close"]

def _open(df: pd.DataFrame, period: int) -> pd.Series:
    return df["open"] if "open" in df.columns else df["close"]

def _high(df: pd.DataFrame, period: int) -> pd.Series:
    return df["high"] if "high" in df.columns else df["close"]

def _low(df: pd.DataFrame, period: int) -> pd.Series:
    return df["low"] if "low" in df.columns else df["close"]

def _volume(df: pd.DataFrame, period: int) -> pd.Series:
    return df["volume"] if "volume" in df.columns else df["close"]


# ── Trend ────────────────────────────────────────────────────────────────────

def _sma(df: pd.DataFrame, period: int) -> pd.Series:
    return vbt.MA.run(df["close"], window=period).ma

def _ema(df: pd.DataFrame, period: int) -> pd.Series:
    return df["close"].ewm(span=period, adjust=False).mean()

def _macd(df: pd.DataFrame, period: int) -> pd.Series:
    return ta.trend.macd(df["close"], window_slow=26, window_fast=12)

def _macd_signal(df: pd.DataFrame, period: int) -> pd.Series:
    return ta.trend.macd_signal(df["close"], window_slow=26, window_fast=12, window_sign=9)

def _adx(df: pd.DataFrame, period: int) -> pd.Series:
    """Average Directional Index — trend strength, not direction. Range 0-100."""
    return ta.trend.adx(df["high"], df["low"], df["close"], window=period)

def _psar_up(df: pd.DataFrame, period: int) -> pd.Series:
    """Parabolic SAR — values when price is above SAR (uptrend signal)."""
    return ta.trend.PSARIndicator(df["high"], df["low"], df["close"]).psar_up()

def _psar_down(df: pd.DataFrame, period: int) -> pd.Series:
    """Parabolic SAR — values when price is below SAR (downtrend signal)."""
    return ta.trend.PSARIndicator(df["high"], df["low"], df["close"]).psar_down()

def _ichimoku_tenkan(df: pd.DataFrame, period: int) -> pd.Series:
    """Ichimoku Conversion Line (Tenkan-sen). Default period = 9."""
    p = period if period else 9
    return ta.trend.IchimokuIndicator(df["high"], df["low"], window1=p, window2=26, window3=52).ichimoku_conversion_line()

def _ichimoku_kijun(df: pd.DataFrame, period: int) -> pd.Series:
    """Ichimoku Base Line (Kijun-sen). Default period = 26."""
    return ta.trend.IchimokuIndicator(df["high"], df["low"], window1=9, window2=26, window3=52).ichimoku_base_line()


# ── Momentum ─────────────────────────────────────────────────────────────────

def _rsi(df: pd.DataFrame, period: int) -> pd.Series:
    return vbt.RSI.run(df["close"], window=period).rsi

def _stoch_k(df: pd.DataFrame, period: int) -> pd.Series:
    """Stochastic Oscillator %K line."""
    return ta.momentum.stoch(df["high"], df["low"], df["close"], window=period, smooth_window=3)

def _stoch_d(df: pd.DataFrame, period: int) -> pd.Series:
    """Stochastic Oscillator %D signal line."""
    return ta.momentum.stoch_signal(df["high"], df["low"], df["close"], window=period, smooth_window=3)

def _williams_r(df: pd.DataFrame, period: int) -> pd.Series:
    """Williams %R oscillator. Range -100 to 0. Oversold < -80, Overbought > -20."""
    return ta.momentum.williams_r(df["high"], df["low"], df["close"], lbp=period)

def _cci(df: pd.DataFrame, period: int) -> pd.Series:
    """Commodity Channel Index."""
    return ta.trend.cci(df["high"], df["low"], df["close"], window=period)

def _roc(df: pd.DataFrame, period: int) -> pd.Series:
    """Rate of Change — percentage momentum indicator."""
    return ta.momentum.roc(df["close"], window=period)

def _mfi(df: pd.DataFrame, period: int) -> pd.Series:
    """Money Flow Index — volume-weighted RSI. Range 0-100."""
    return ta.volume.money_flow_index(df["high"], df["low"], df["close"], df["volume"], window=period)


# ── Volatility ───────────────────────────────────────────────────────────────

def _atr(df: pd.DataFrame, period: int) -> pd.Series:
    return vbt.ATR.run(df["high"], df["low"], df["close"], window=period).atr

def _bol_upper(df: pd.DataFrame, period: int) -> pd.Series:
    return vbt.BBANDS.run(df["close"], window=period).upper

def _bol_lower(df: pd.DataFrame, period: int) -> pd.Series:
    return vbt.BBANDS.run(df["close"], window=period).lower

def _bol_mid(df: pd.DataFrame, period: int) -> pd.Series:
    return vbt.BBANDS.run(df["close"], window=period).middle

def _keltner_upper(df: pd.DataFrame, period: int) -> pd.Series:
    """Keltner Channel Upper Band (EMA + 2*ATR)."""
    return ta.volatility.KeltnerChannel(df["high"], df["low"], df["close"], window=period).keltner_channel_hband()

def _keltner_lower(df: pd.DataFrame, period: int) -> pd.Series:
    """Keltner Channel Lower Band (EMA - 2*ATR)."""
    return ta.volatility.KeltnerChannel(df["high"], df["low"], df["close"], window=period).keltner_channel_lband()

def _donchian_high(df: pd.DataFrame, period: int) -> pd.Series:
    """Donchian Channel High — highest high over N periods (Turtle Trading)."""
    return df["high"].rolling(period).max()

def _donchian_low(df: pd.DataFrame, period: int) -> pd.Series:
    """Donchian Channel Low — lowest low over N periods."""
    return df["low"].rolling(period).min()


# ── Volume ───────────────────────────────────────────────────────────────────

def _vwap(df: pd.DataFrame, period: int) -> pd.Series:
    """Volume-Weighted Average Price — resets daily, the key intraday anchor."""
    tp = (df["high"] + df["low"] + df["close"]) / 3
    cum_tp_vol = (tp * df["volume"]).cumsum()
    cum_vol = df["volume"].cumsum()
    return cum_tp_vol / cum_vol

def _obv(df: pd.DataFrame, period: int) -> pd.Series:
    """On-Balance Volume — cumulative volume direction indicator."""
    return ta.volume.on_balance_volume(df["close"], df["volume"])

def _cmf(df: pd.DataFrame, period: int) -> pd.Series:
    """Chaikin Money Flow — money flow over N periods. Range -1 to 1."""
    return ta.volume.chaikin_money_flow(df["high"], df["low"], df["close"], df["volume"], window=period)


# ─────────────────────────────────────────────────────────────────────────────
# Period configuration — {min, max, label} or None (no period input in UI)
# ─────────────────────────────────────────────────────────────────────────────

PeriodConfig = Optional[dict]

def _p(min_v: int, max_v: int, label: str) -> dict:
    return {"min": min_v, "max": max_v, "label": label}


# ─────────────────────────────────────────────────────────────────────────────
# INDICATOR_GROUPS — groups → ordered list of indicators
# This is the canonical definition. Everything else is derived from here.
# ─────────────────────────────────────────────────────────────────────────────

INDICATOR_GROUPS: dict[str, list[dict]] = {
    "Price": [
        {"name": "Close Price",  "period": None,                        "compute": _close},
        {"name": "Open Price",   "period": None,                        "compute": _open},
        {"name": "High Price",   "period": None,                        "compute": _high},
        {"name": "Low Price",    "period": None,                        "compute": _low},
        {"name": "Volume",       "period": None,                        "compute": _volume},
    ],
    "Trend": [
        {"name": "SMA",                  "period": _p(2, 500, "Period (2–500)"),        "compute": _sma},
        {"name": "EMA",                  "period": _p(2, 500, "Period (2–500)"),        "compute": _ema},
        {"name": "MACD",                 "period": _p(2, 50,  "Fast period (2–50)"),    "compute": _macd},
        {"name": "MACD Signal",          "period": _p(2, 50,  "Signal period (2–50)"),  "compute": _macd_signal},
        {"name": "ADX",                  "period": _p(2, 50,  "Period (2–50)"),         "compute": _adx},
        {"name": "Parabolic SAR Up",     "period": None,                                "compute": _psar_up},
        {"name": "Parabolic SAR Down",   "period": None,                                "compute": _psar_down},
        {"name": "Ichimoku Tenkan",      "period": _p(5, 50,  "Conversion (5–50)"),     "compute": _ichimoku_tenkan},
        {"name": "Ichimoku Kijun",       "period": _p(10, 100, "Base (10–100)"),        "compute": _ichimoku_kijun},
    ],
    "Momentum": [
        {"name": "RSI",         "period": _p(2, 100, "Period (2–100)"),  "compute": _rsi},
        {"name": "Stochastic K","period": _p(5, 50,  "Period (5–50)"),   "compute": _stoch_k},
        {"name": "Stochastic D","period": _p(5, 50,  "Period (5–50)"),   "compute": _stoch_d},
        {"name": "Williams %R", "period": _p(5, 50,  "Period (5–50)"),   "compute": _williams_r},
        {"name": "CCI",         "period": _p(5, 100, "Period (5–100)"),  "compute": _cci},
        {"name": "ROC",         "period": _p(2, 50,  "Period (2–50)"),   "compute": _roc},
        {"name": "MFI",         "period": _p(5, 50,  "Period (5–50)"),   "compute": _mfi},
    ],
    "Volatility": [
        {"name": "ATR",             "period": _p(1, 50,  "Period (1–50)"),  "compute": _atr},
        {"name": "Bollinger Upper", "period": _p(2, 100, "Period (2–100)"), "compute": _bol_upper},
        {"name": "Bollinger Lower", "period": _p(2, 100, "Period (2–100)"), "compute": _bol_lower},
        {"name": "Bollinger Mid",   "period": _p(2, 100, "Period (2–100)"), "compute": _bol_mid},
        {"name": "Keltner Upper",   "period": _p(5, 50,  "Period (5–50)"),  "compute": _keltner_upper},
        {"name": "Keltner Lower",   "period": _p(5, 50,  "Period (5–50)"),  "compute": _keltner_lower},
        {"name": "Donchian High",   "period": _p(5, 100, "Period (5–100)"), "compute": _donchian_high},
        {"name": "Donchian Low",    "period": _p(5, 100, "Period (5–100)"), "compute": _donchian_low},
    ],
    "Volume": [
        {"name": "VWAP",  "period": None,                        "compute": _vwap},
        {"name": "OBV",   "period": None,                        "compute": _obv},
        {"name": "CMF",   "period": _p(5, 50, "Period (5–50)"), "compute": _cmf},
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# INDICATOR_REGISTRY — flat map: indicator name → {compute, period}
# Derived automatically from INDICATOR_GROUPS — do NOT manually update.
# ─────────────────────────────────────────────────────────────────────────────

INDICATOR_REGISTRY: dict[str, dict] = {
    spec["name"]: {"compute": spec["compute"], "period": spec["period"]}
    for group_specs in INDICATOR_GROUPS.values()
    for spec in group_specs
}


def compute_indicator(df: pd.DataFrame, indicator_name: str, period: int = 14) -> pd.Series | None:
    """Compute a single indicator from the registry.

    This is the only function strategies.py needs to call.
    All compute logic is encapsulated here.

    Args:
        df: OHLCV DataFrame with lowercase column names.
        indicator_name: Must match a key in INDICATOR_REGISTRY.
        period: Lookback period. Ignored for indicators with period=None.

    Returns:
        pd.Series of the computed indicator, or None on error.
    """
    entry = INDICATOR_REGISTRY.get(indicator_name)
    if entry is None:
        logger.warning(f"Unknown indicator: '{indicator_name}' — falling back to Close Price.")
        return df["close"]

    try:
        result = entry["compute"](df, int(period) if period else 14)
        return result
    except Exception as exc:
        logger.error(f"Indicator compute error [{indicator_name}]: {exc}")
        return df["close"]


def get_indicator_metadata() -> dict:
    """Return serializable indicator metadata for the frontend /api/indicators endpoint.

    Returns:
        Dict with 'groups' (ordered list with group name and indicators)
        suitable for JSON serialization.
    """
    groups = []
    for group_name, specs in INDICATOR_GROUPS.items():
        indicators = []
        for spec in specs:
            indicators.append({
                "name": spec["name"],
                "hasPeriod": spec["period"] is not None,
                "periodConfig": spec["period"],
            })
        groups.append({"group": group_name, "indicators": indicators})
    return {"groups": groups}
