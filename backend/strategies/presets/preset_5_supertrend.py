"""Preset 5: Supertrend — canonical flip-based trailing-stop implementation.

This replaces the former ATR-band EMA crossover stub with the real Supertrend
algorithm that matches TradingView / Pine Script behaviour:
  - Upper/lower bands clamp progressively (only tighten, never widen)
  - Direction flips only when price breaks the opposite band
  - Signal fires only on the flip bar (not every bar in trend)
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import vectorbt as vbt

from strategies.dynamic import DynamicStrategy
from strategies.presets._registry import register_preset


@register_preset(
    preset_id="5",
    name="Supertrend",
    description=(
        "Flip-based Supertrend (matches TradingView). "
        "Enter on bullish flip, exit on bearish flip."
    ),
    params=[
        {"name": "period",     "label": "ATR Period",   "min": 7,  "max": 20, "default": 10},
        {"name": "multiplier", "label": "Multiplier",   "min": 1.0,"max": 5.0,"default": 3.0, "step": 0.1},
    ],
    mode="CODE",
)
class SupertrendStrategy(DynamicStrategy):
    """Canonical Supertrend preset.

    Algorithm (identical to Pine Script):
        1. Compute ATR(period) and HL2 = (high + low) / 2.
        2. Derive basic_upper = HL2 + mult*ATR and basic_lower = HL2 - mult*ATR.
        3. Clamp bands: upper only decreases while price ≤ prev upper;
           lower only increases while price ≥ prev lower.
        4. Track direction: flip to bullish when close > prev upper, bearish when < prev lower.
        5. Signal fires on the bar of the trend flip (not every bullish / bearish bar).
    """

    def __init__(self, config: dict) -> None:
        self._period     = int(config.get("period", 10))
        self._multiplier = float(config.get("multiplier", 3.0))
        super().__init__({**config, "nextBarEntry": True})

    def _compute_signals(
        self,
        df: pd.DataFrame | dict,
    ) -> tuple[pd.Series, pd.Series, list[str]]:
        """Compute Supertrend flip signals.

        Args:
            df: OHLCV DataFrame with lowercase column names.

        Returns:
            Tuple of (entries, exits, warnings).
        """
        high  = df["high"].values
        low   = df["low"].values
        close = df["close"].values
        n     = len(close)

        atr = vbt.ATR.run(df["high"], df["low"], df["close"], window=self._period).atr.values
        hl2 = (high + low) / 2.0

        basic_upper = hl2 + self._multiplier * atr
        basic_lower = hl2 - self._multiplier * atr

        upper     = basic_upper.copy()
        lower     = basic_lower.copy()
        direction = np.zeros(n, dtype=np.int8)  # 1 = bullish, -1 = bearish

        for i in range(1, n):
            if np.isnan(atr[i]):
                upper[i]     = upper[i - 1]
                lower[i]     = lower[i - 1]
                direction[i] = direction[i - 1]
                continue

            # Band clamping: only tighten while price stays on same side
            upper[i] = (
                min(basic_upper[i], upper[i - 1])
                if close[i - 1] <= upper[i - 1]
                else basic_upper[i]
            )
            lower[i] = (
                max(basic_lower[i], lower[i - 1])
                if close[i - 1] >= lower[i - 1]
                else basic_lower[i]
            )

            # Trend direction (flip logic)
            if close[i] > upper[i - 1]:
                direction[i] = 1     # Bullish flip / continuation
            elif close[i] < lower[i - 1]:
                direction[i] = -1    # Bearish flip / continuation
            else:
                direction[i] = direction[i - 1]  # No flip

        direction_s = pd.Series(direction, index=df.index)
        prev_dir    = direction_s.shift(1).fillna(0)

        entries = (direction_s == 1)  & (prev_dir != 1)   # Long flip bar
        exits   = (direction_s == -1) & (prev_dir != -1)  # Short flip bar
        
        indicators = {
            "Direction": direction_s,
            "Upper Band": pd.Series(upper, index=df.index).round(2),
            "Lower Band": pd.Series(lower, index=df.index).round(2),
        }
        return entries.fillna(False), exits.fillna(False), [], indicators
