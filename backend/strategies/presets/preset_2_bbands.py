"""Preset 2: Bollinger Bands Mean Reversion — Code preset."""
from __future__ import annotations

import pandas as pd
import vectorbt as vbt
from strategies.dynamic import DynamicStrategy
from strategies.presets._registry import register_preset


@register_preset(
    preset_id="2",
    name="Bollinger Bands Mean Reversion",
    description="Buy when price crosses below lower band; sell when it crosses above the middle band.",
    params=[
        {"name": "period",  "label": "Length",           "min": 10, "max": 50, "default": 20},
        {"name": "std_dev", "label": "StdDev Multiplier","min": 1.0,"max": 3.0,"default": 2.0, "step": 0.1},
    ],
    mode="CODE",
)
class BollingerBandsMeanReversionStrategy(DynamicStrategy):
    """Bollinger Bands Mean Reversion preset.

    Entry: close crosses below lower band (oversold).
    Exit:  close crosses above middle band (mean reversion complete).
    """

    def __init__(self, config: dict) -> None:
        self._period  = int(config.get("period", 20))
        self._std_dev = float(config.get("std_dev", 2.0))
        super().__init__({**config, "nextBarEntry": True})

    def _compute_signals(
        self, df: pd.DataFrame | dict
    ) -> tuple[pd.Series, pd.Series, list[str], dict[str, pd.Series]]:
        """Compute Bollinger Band mean-reversion signals.

        Args:
            df: OHLCV DataFrame with lowercase column names.

        Returns:
            Tuple of (entries, exits, warnings, indicators).
        """
        bb = vbt.BBANDS.run(df["close"], window=self._period, alpha=self._std_dev)
        entries = df["close"].vbt.crossed_below(bb.lower)
        exits   = df["close"].vbt.crossed_above(bb.middle)
        return entries.fillna(False), exits.fillna(False), [], {
            "Upper Band": bb.upper.round(2),
            "Middle Band": bb.middle.round(2),
            "Lower Band": bb.lower.round(2),
        }
