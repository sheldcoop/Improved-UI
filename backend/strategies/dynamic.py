"""strategies/dynamic.py — DynamicStrategy: the unified signal engine.

Combines SignalEvaluator (visual builder) and PythonSandbox (code mode)
into a single strategy class. All preset subclasses override _compute_signals().
The generate_signals() template method handles nextBarEntry and time filtering.
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from logging import getLogger

from strategies.base import BaseStrategy
from strategies.signal_evaluator import SignalEvaluator
from strategies.sandbox import PythonSandbox

logger = getLogger(__name__)


class DynamicStrategy(BaseStrategy, SignalEvaluator):
    """Unified strategy engine supporting Visual Builder and Python Code modes.

    Architecture (template method pattern):
        generate_signals()          — public API; handles nextBarEntry + time filter
          └── _compute_signals()    — override in presets; pure signal logic

    For user-created strategies (Visual Builder / Code tab), _compute_signals()
    delegates to SignalEvaluator or PythonSandbox respectively.

    For preset subclasses, they override _compute_signals() with real Python
    code (no f-strings), making each preset independently testable.
    """

    def __init__(self, config: dict) -> None:
        super().__init__(config)
        self._sandbox = PythonSandbox()
        self._resampler = None  # Lazy-initialised by SignalEvaluator._get_series

    # ------------------------------------------------------------------
    # Template method — do NOT override in subclasses
    # ------------------------------------------------------------------

    def generate_signals(
        self,
        df: pd.DataFrame | dict,
    ) -> tuple[pd.Series | pd.DataFrame, pd.Series | pd.DataFrame, list[str]]:
        """Generate entry/exit signals with nextBarEntry and time-filter applied.

        All strategies default to ``nextBarEntry = True``: signals computed on
        the current bar's close are shifted to the **next bar's open**. This
        prevents same-bar look-ahead bias (impossible to fill in live trading).
        Set ``nextBarEntry = False`` in config explicitly to disable.

        Args:
            df: OHLCV DataFrame or dict of DataFrames (universe mode).

        Returns:
            Tuple of (entries, exits, warnings).
        """
        entries, exits, warnings_list = self._compute_signals(df)

        # Apply intraday session filter (no-op for daily strategies)
        if entries is not None and exits is not None:
            entries, exits = self._apply_time_filter(df, entries, exits, self.config)

        # Next-bar-entry shift (default True — prevents look-ahead bias)
        if self.config.get("nextBarEntry", True) and entries is not None and exits is not None:
            entries = entries.shift(1).fillna(False)
            exits = exits.shift(1).fillna(False)

        return entries, exits, warnings_list

    # ------------------------------------------------------------------
    # Hook — override in preset subclasses
    # ------------------------------------------------------------------

    def _compute_signals(
        self,
        df: pd.DataFrame | dict,
    ) -> tuple[pd.Series | pd.DataFrame | None, pd.Series | pd.DataFrame | None, list[str]]:
        """Produce raw entry/exit signals before nextBarEntry shift.

        Default implementation:
          - CODE mode → PythonSandbox execution
          - VISUAL mode → SignalEvaluator rule-tree traversal + warmup check

        Preset subclasses override this with real Python signal logic,
        eliminating f-string code strings and enabling proper IDE tooling.

        Args:
            df: OHLCV DataFrame or dict of DataFrames.

        Returns:
            Tuple of (entries, exits, warnings).
        """
        warnings_list: list[str] = []
        mode = self.config.get("mode", "VISUAL")

        if mode == "CODE":
            code = self.config.get("pythonCode", "")
            config_params = self.config.get("params", self.config)
            return self._sandbox.execute(code, df, config_params)

        # VISUAL builder evaluation
        entry_group = self.config.get("entryLogic")
        exit_group = self.config.get("exitLogic")
        target_index = df["close"].index if isinstance(df, dict) else df.index
        is_universe = isinstance(df, dict)

        # Warmup period guard
        n_bars = len(target_index)
        max_period = max(
            self._max_period_from_node(entry_group or {}),
            self._max_period_from_node(exit_group or {}),
        )
        if max_period > 0 and n_bars > 0:
            warmup_pct = max_period / n_bars
            if warmup_pct > 0.30:
                warnings_list.append(
                    f"Warmup warning: longest indicator period ({max_period}) consumes "
                    f"{round(warmup_pct * 100)}% of available bars ({n_bars}). "
                    "Results are likely unreliable — increase your date range."
                )
            elif n_bars < max_period * 2:
                warnings_list.append(
                    f"Warmup warning: only {n_bars} bars available but indicator period is "
                    f"{max_period}. Consider fetching more historical data."
                )

        def _eval(group: dict | None) -> pd.Series | pd.DataFrame:
            if not group:
                if is_universe:
                    return pd.DataFrame(False, index=target_index, columns=df["close"].columns)
                return pd.Series(False, index=target_index)
            result = self._evaluate_node(df, group)
            if isinstance(result, (bool, np.bool_)):
                if is_universe:
                    return pd.DataFrame(result, index=target_index, columns=df["close"].columns)
                return pd.Series(result, index=target_index)
            return result

        entries = _eval(entry_group)
        exits = _eval(exit_group)
        return entries, exits, warnings_list
