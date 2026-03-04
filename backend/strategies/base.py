"""strategies/base.py — Abstract base class for all strategies."""
from __future__ import annotations

import pandas as pd
from logging import getLogger

logger = getLogger(__name__)


class BaseStrategy:
    """Abstract base class for all trading strategies.

    All concrete strategies must subclass this and implement generate_signals().
    """

    def __init__(self, config: dict) -> None:
        """Initialise with a strategy config dict.

        Args:
            config: Strategy parameters. Common keys: mode, entryLogic,
                exitLogic, pythonCode, nextBarEntry, stopLossPct.
        """
        self.config = config

    def generate_signals(
        self,
        df: pd.DataFrame | dict,
    ) -> tuple[pd.Series, pd.Series, list[str]]:
        """Generate entry/exit signals from OHLCV data.

        Args:
            df: OHLCV DataFrame (single asset) or dict of DataFrames (universe).

        Returns:
            Tuple of (entries, exits, warnings) — boolean Series/DataFrames
            aligned to the input index, and a list of warning strings.

        Raises:
            NotImplementedError: Subclasses must implement this method.
        """
        raise NotImplementedError("Strategies must implement generate_signals")
