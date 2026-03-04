"""Preset 7: ATR Channel Breakout — Code preset.

Note on nextBarEntry: this preset references df['high'].shift(1) and
df['low'].shift(1) in its band calculation — that is a *data* shift (using
yesterday's range to form today's channel), NOT a signal shift. The
nextBarEntry=True setting in the parent still applies so the actual trade
executes on the bar after the breakout signal fires.
"""
from __future__ import annotations

import pandas as pd
import vectorbt as vbt

from strategies.dynamic import DynamicStrategy
from strategies.presets._registry import register_preset


@register_preset(
    preset_id="7",
    name="ATR Channel Breakout",
    description="Volatility breakout: Buy when close exceeds prev-bar High + ATR*Multiplier.",
    params=[
        {"name": "period",     "label": "ATR Period",          "min": 10, "max": 30, "default": 14},
        {"name": "multiplier", "label": "Distance Multiplier", "min": 1.0,"max": 4.0,"default": 2.0, "step": 0.1},
    ],
    mode="CODE",
)
class ATRChannelBreakoutStrategy(DynamicStrategy):
    """ATR Channel Breakout preset.

    Entry: close > prev-bar High + ATR * multiplier  (upside breakout)
    Exit:  close < prev-bar Low  - ATR * multiplier  (downside breakout)

    The prev-bar reference is correct use of historical data (no look-ahead).
    ``nextBarEntry=True`` in the base config ensures execution on the next open.
    """

    def __init__(self, config: dict) -> None:
        self._period     = int(config.get("period", 14))
        self._multiplier = float(config.get("multiplier", 2.0))
        super().__init__({**config, "nextBarEntry": True})

    def _compute_signals(
        self,
        df: pd.DataFrame | dict,
    ) -> tuple[pd.Series, pd.Series, list[str]]:
        """Compute ATR channel breakout signals.

        Args:
            df: OHLCV DataFrame with lowercase column names.

        Returns:
            Tuple of (entries, exits, warnings).
        """
        atr = vbt.ATR.run(df["high"], df["low"], df["close"], window=self._period).atr

        upper_channel = df["high"].shift(1) + atr * self._multiplier
        lower_channel = df["low"].shift(1)  - atr * self._multiplier

        entries = df["close"] > upper_channel
        exits   = df["close"] < lower_channel
        return entries.fillna(False), exits.fillna(False), []
