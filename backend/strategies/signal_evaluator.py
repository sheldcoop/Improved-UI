"""strategies/signal_evaluator.py — Visual Builder rule-tree evaluation mixin.

This mixin is designed to be combined with BaseStrategy via multiple inheritance.
It provides the recursive indicator-comparison logic that powers the Visual Builder.
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from logging import getLogger

from services.indicator_registry import compute_indicator
from services.timeframe_resampler import TimeframeResampler

logger = getLogger(__name__)


class SignalEvaluator:
    """Mixin that evaluates AND/OR rule-group trees into boolean signal Series.

    Requires the host class to have a ``config`` attribute (provided by BaseStrategy).
    """

    def _get_series(
        self,
        df: pd.DataFrame | dict,
        indicator_type: str,
        period: int = 14,
        timeframe: str | None = None,
    ) -> pd.Series | pd.DataFrame | None:
        """Compute an indicator Series, with optional MTF resampling.

        Args:
            df: OHLCV DataFrame or dict of DataFrames (universe mode).
            indicator_type: Indicator name matching INDICATOR_REGISTRY key.
            period: Lookback period. Default 14.
            timeframe: Optional higher timeframe for resampling.

        Returns:
            Indicator Series re-indexed to the original timeline.
        """
        if timeframe and timeframe not in ("Curr", "curr", ""):
            if not hasattr(self, "_resampler") or self._resampler is None:
                self._resampler = TimeframeResampler(df)
            base_df = self._resampler.get_ohlcv(timeframe)
        else:
            base_df = df

        is_universe = isinstance(base_df, dict)
        if is_universe:
            close_df = base_df.get("close")
            results = {}
            for col in close_df.columns:
                asset_df_flat = pd.DataFrame({
                    k: base_df[k][col]
                    for k in base_df
                    if isinstance(base_df[k], pd.DataFrame) and col in base_df[k].columns
                })
                results[col] = compute_indicator(asset_df_flat, indicator_type, int(period) if period else 14)
            result_series = pd.DataFrame(results)
        else:
            result_series = compute_indicator(base_df, indicator_type, int(period) if period else 14)

        if timeframe and timeframe not in ("Curr", "curr", "") and result_series is not None:
            if hasattr(self, "_resampler") and self._resampler is not None:
                result_series = self._resampler.align_to_base(result_series)

        return result_series

    def _evaluate_node(
        self,
        df: pd.DataFrame | dict,
        node: dict,
    ) -> pd.Series | bool:
        """Recursively evaluate a RuleGroup or Condition node.

        Args:
            df: OHLCV DataFrame or dict of DataFrames.
            node: GROUP dict (with 'conditions' + 'logic') or leaf Condition dict.

        Returns:
            Boolean Series, or scalar False for empty / error groups.
        """
        if node.get("type") == "GROUP":
            children = node.get("conditions", [])
            if not children:
                return False
            results = [self._evaluate_node(df, child) for child in children]
            final_mask = results[0]
            logic = node.get("logic", "AND")
            for r in results[1:]:
                final_mask = (final_mask & r) if logic == "AND" else (final_mask | r)
            return final_mask
        return self._evaluate_condition(df, node)

    def _evaluate_condition(
        self,
        df: pd.DataFrame | dict,
        rule: dict,
    ) -> pd.Series | bool:
        """Evaluate a single indicator comparison condition.

        Args:
            df: OHLCV DataFrame or dict of DataFrames.
            rule: Condition dict with keys: indicator, period, operator,
                compareType, value / rightIndicator, optional timeframe.

        Returns:
            Boolean Series matching the condition, or False on error.
        """
        try:
            left = self._get_series(df, rule["indicator"], rule.get("period", 14), rule.get("timeframe"))
            if rule.get("multiplier"):
                left = left * float(rule["multiplier"])

            if rule.get("compareType") == "INDICATOR":
                right = self._get_series(
                    df, rule["rightIndicator"], rule.get("rightPeriod", 14), rule.get("rightTimeframe")
                )
            else:
                right = float(rule["value"])

            op = rule["operator"]
            if op == "Crosses Above":    return left.vbt.crossed_above(right)
            if op == "Crosses Below":    return left.vbt.crossed_below(right)
            if op == ">":                return left > right
            if op == ">=":               return left >= right
            if op == "<":                return left < right
            if op == "<=":               return left <= right
            if op == "=":                return left == right
            if op == "!=":               return left != right
            logger.warning(f"Unsupported operator '{op}' in rule — condition will never fire")
            return pd.Series(False, index=df.index if isinstance(df, pd.DataFrame) else df["close"].index)

        except Exception as exc:
            logger.error(f"Condition Eval Error: {exc}")
            return False

    def _max_period_from_node(self, node: dict) -> int:
        """Recursively find the maximum indicator period in a rule-group tree.

        Used to estimate warmup (burn-in) bars needed before signals are reliable.

        Args:
            node: RuleGroup or Condition dict.

        Returns:
            Maximum period value found across the entire tree.
        """
        if not node:
            return 0
        if node.get("type") == "GROUP":
            return max(
                (self._max_period_from_node(c) for c in node.get("conditions", [])),
                default=0,
            )
        return max(int(node.get("period") or 0), int(node.get("rightPeriod") or 0))

    def _apply_time_filter(
        self,
        df: pd.DataFrame | dict,
        entries: pd.Series | pd.DataFrame,
        exits: pd.Series | pd.DataFrame,
        config: dict,
    ) -> tuple[pd.Series | pd.DataFrame, pd.Series | pd.DataFrame]:
        """Mask signals outside the configured session time window.

        Args:
            df: OHLCV DataFrame or dict of DataFrames.
            entries: Boolean entry signals.
            exits: Boolean exit signals.
            config: Must contain 'startTime' and 'endTime' keys (HH:MM strings).

        Returns:
            Tuple of (filtered_entries, filtered_exits).
        """
        start_time = config.get("startTime")
        end_time = config.get("endTime")

        if not start_time or not end_time:
            return entries, exits

        target_index = df["close"].index if isinstance(df, dict) else df.index
        if not isinstance(target_index, pd.DatetimeIndex):
            return entries, exits

        indexer = target_index.indexer_between_time(start_time, end_time)
        mask_array = np.zeros(len(target_index), dtype=bool)
        mask_array[indexer] = True
        time_mask = pd.Series(mask_array, index=target_index)

        if isinstance(entries, pd.DataFrame):
            entries = entries.multiply(time_mask, axis=0)
            exits = exits.multiply(time_mask, axis=0)
        else:
            entries = entries & time_mask
            exits = exits & time_mask

        return entries, exits
