"""Preset 6: Stochastic RSI — Code preset."""
from __future__ import annotations

import pandas as pd
import vectorbt as vbt

from strategies.dynamic import DynamicStrategy
from strategies.presets._registry import register_preset


@register_preset(
    preset_id="6",
    name="Stochastic RSI",
    description="Mean reversion using the Stochastic of RSI. Buy on K-line oversold cross; sell on overbought cross.",
    params=[
        {"name": "rsi_period", "label": "RSI Period", "min": 10, "max": 30, "default": 14},
        {"name": "k_period",   "label": "K Period",   "min": 3,  "max": 10, "default": 3},
        {"name": "d_period",   "label": "D Period",   "min": 3,  "max": 10, "default": 3},
    ],
    mode="CODE",
)
class StochasticRSIStrategy(DynamicStrategy):
    """Stochastic RSI preset.

    Entry: StochRSI K-line crosses above 20 (oversold recovery).
    Exit:  StochRSI K-line crosses below 80 (overbought reversal).
    """

    def __init__(self, config: dict) -> None:
        self._rsi_period = int(config.get("rsi_period", 14))
        self._k_period   = int(config.get("k_period", 3))
        self._d_period   = int(config.get("d_period", 3))
        super().__init__({**config, "nextBarEntry": True})

    def _compute_signals(
        self,
        df: pd.DataFrame | dict,
    ) -> tuple[pd.Series, pd.Series, list[str]]:
        """Compute Stochastic RSI crossover signals.

        Args:
            df: OHLCV DataFrame with lowercase column names.

        Returns:
            Tuple of (entries, exits, warnings).
        """
        rsi = vbt.RSI.run(df["close"], window=self._rsi_period).rsi

        min_rsi    = rsi.rolling(self._k_period).min()
        max_rsi    = rsi.rolling(self._k_period).max()
        stoch_rsi  = (rsi - min_rsi) / (max_rsi - min_rsi + 1e-9)
        k_line     = stoch_rsi.rolling(self._d_period).mean() * 100

        entries = k_line.vbt.crossed_above(20)
        exits   = k_line.vbt.crossed_below(80)
        return entries.fillna(False), exits.fillna(False), [], {
            "K-Line": k_line.round(2),
            "StochRSI": stoch_rsi.round(2)
        }
