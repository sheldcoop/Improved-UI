"""Preset 3: MACD Crossover — Code preset."""
from __future__ import annotations

import pandas as pd
import vectorbt as vbt
from strategies.dynamic import DynamicStrategy
from strategies.presets._registry import register_preset


@register_preset(
    preset_id="3",
    name="MACD Crossover",
    description="Buy when MACD line crosses above Signal line; sell on the reverse cross.",
    params=[
        {"name": "fast",   "label": "Fast Period",   "min": 8,  "max": 20, "default": 12},
        {"name": "slow",   "label": "Slow Period",   "min": 21, "max": 40, "default": 26},
        {"name": "signal", "label": "Signal Period", "min": 5,  "max": 15, "default": 9},
    ],
    mode="CODE",
)
class MACDCrossoverStrategy(DynamicStrategy):
    """MACD Crossover preset.

    Entry: MACD crosses above Signal line.
    Exit:  MACD crosses below Signal line.
    """

    def __init__(self, config: dict) -> None:
        self._fast   = int(config.get("fast", 12))
        self._slow   = int(config.get("slow", 26))
        self._signal = int(config.get("signal", 9))
        super().__init__({**config, "nextBarEntry": True})

    def _compute_signals(
        self, df: pd.DataFrame | dict
    ) -> tuple[pd.Series, pd.Series, list[str]]:
        """Compute MACD crossover signals.

        Args:
            df: OHLCV DataFrame with lowercase column names.

        Returns:
            Tuple of (entries, exits, warnings).
        """
        macd = vbt.MACD.run(
            df["close"],
            fast_window=self._fast,
            slow_window=self._slow,
            signal_window=self._signal,
        )
        entries = macd.macd.vbt.crossed_above(macd.signal)
        exits   = macd.macd.vbt.crossed_below(macd.signal)
        return entries.fillna(False), exits.fillna(False), [], {
            "MACD": macd.macd.round(2),
            "Signal": macd.signal.round(2),
            "Histogram": macd.hist.round(2),
        }
