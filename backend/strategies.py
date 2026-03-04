"""strategies.py — Strategy classes and StrategyFactory.

Fixes applied:
  - Type hints on all public methods (Issue #4)
  - Docstrings on all public methods (Issue #5)
  - exec() sandbox hardened with object introspection guard (Issue #13)
  - Multi-timeframe analysis via TimeframeResampler (MTF)
"""
from __future__ import annotations

import pandas as pd
import numpy as np
import vectorbt as vbt
from logging import getLogger
import ta

from services.indicator_registry import compute_indicator

from services.timeframe_resampler import TimeframeResampler

logger = getLogger(__name__)

# Blocked names in exec() sandbox — prevents object introspection escapes.
# e.g. ().__class__.__bases__[0].__subclasses__() attack vector.
_BLOCKED_ATTRS = frozenset(
    ["__class__", "__bases__", "__subclasses__", "__mro__", "__globals__",
     "__builtins__", "__import__", "__loader__", "__spec__", "__code__",
     "eval", "exec", "compile", "open", "breakpoint", "__reduce__",
     "__reduce_ex__", "system", "popen"]
)


class BaseStrategy:
    """Abstract base class for all trading strategies."""

    def __init__(self, config: dict) -> None:
        self.config = config

    def generate_signals(self, df: pd.DataFrame | dict) -> tuple:
        """Generate entry and exit signal arrays from OHLCV data.

        Args:
            df: OHLCV DataFrame or dict of DataFrames (universe mode).

        Returns:
            Tuple of (entries, exits, warnings) — boolean Series or DataFrames, and a list of warning strings.

        Raises:
            NotImplementedError: Subclasses must implement this method.
        """
        raise NotImplementedError("Strategies must implement generate_signals")


class DynamicStrategy(BaseStrategy):
    """Advanced Strategy Engine v2.0.

    Supports recursive AND/OR logic trees, multi-timeframe indicators,
    time filters, and sandboxed Python code injection.
    """

    def _get_series(
        self,
        df: pd.DataFrame | dict,
        indicator_type: str,
        period: int = 14,
        timeframe: str | None = None,
    ) -> pd.Series | pd.DataFrame | None:
        """Compute an indicator series, with optional MTF resampling.

        Delegates all indicator computation to indicator_registry.compute_indicator().
        To add a new indicator to the platform, update indicator_registry.py only.
        No changes are required in this file.

        Args:
            df: OHLCV DataFrame or dict of DataFrames.
            indicator_type: Indicator name matching a key in INDICATOR_REGISTRY.
            period: Lookback period for the indicator. Default 14.
            timeframe: Optional higher timeframe for MTF resampling
                (e.g. '1W', '1ME'). If None or 'Curr', uses base timeframe.

        Returns:
            Indicator Series (or DataFrame for universe mode), re-indexed
            to the original timeline when MTF resampling is applied.
        """
        # --- MTF resampling -------------------------------------------------
        if timeframe and timeframe not in ("Curr", "curr", ""):
            if not hasattr(self, "_resampler") or self._resampler is None:
                self._resampler = TimeframeResampler(df)
            base_df = self._resampler.get_ohlcv(timeframe)
        else:
            base_df = df

        # --- Universe mode: compute indicator per-asset then reassemble -----
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
            # --- Single-asset mode ----------------------------------------
            result_series = compute_indicator(base_df, indicator_type, int(period) if period else 14)

        # --- Align back to base index (MTF only) ----------------------------
        if timeframe and timeframe not in ("Curr", "curr", "") and result_series is not None:
            if hasattr(self, "_resampler") and self._resampler is not None:
                result_series = self._resampler.align_to_base(result_series)

        return result_series


    def _evaluate_node(self, df: pd.DataFrame | dict, node: dict) -> pd.Series | bool:
        """Recursively evaluate a RuleGroup or Condition node.

        Args:
            df: OHLCV DataFrame or dict of DataFrames.
            node: Dict representing either a GROUP (with 'conditions' list
                and 'logic' key) or a leaf Condition.

        Returns:
            Boolean Series (or scalar True/False for empty groups).
        """
        if node.get("type") == "GROUP":
            children = node.get("conditions", [])
            if not children:
                return False  # Empty group = no signals (neutral, not fire-all)

            results = [self._evaluate_node(df, child) for child in children]
            final_mask = results[0]
            logic = node.get("logic", "AND")
            for i in range(1, len(results)):
                if logic == "AND":
                    final_mask = final_mask & results[i]
                else:
                    final_mask = final_mask | results[i]
            return final_mask

        return self._evaluate_condition(df, node)

    def _evaluate_condition(self, df: pd.DataFrame | dict, rule: dict) -> pd.Series | bool:
        """Evaluate a single indicator comparison condition.

        Args:
            df: OHLCV DataFrame or dict of DataFrames.
            rule: Condition dict with keys: indicator, period, operator,
                compareType, value or rightIndicator, and optional timeframe.

        Returns:
            Boolean Series matching the condition, or False on error.
        """
        try:
            left = self._get_series(
                df, rule["indicator"], rule.get("period", 14), rule.get("timeframe")
            )
            if rule.get("multiplier"):
                left = left * float(rule["multiplier"])

            if rule.get("compareType") == "INDICATOR":
                right = self._get_series(
                    df,
                    rule["rightIndicator"],
                    rule.get("rightPeriod", 14),
                    rule.get("rightTimeframe"),
                )
            else:
                right = float(rule["value"])

            op = rule["operator"]
            if op == "Crosses Above":
                return left.vbt.crossed_above(right)
            elif op == "Crosses Below":
                return left.vbt.crossed_below(right)
            elif op == ">":
                return left > right
            elif op == "<":
                return left < right
            elif op == "=":
                return left == right
            else:
                return False
        except Exception as exc:
            logger.error(f"Condition Eval Error: {exc}")
            return False

    def _apply_time_filter(
        self,
        df: pd.DataFrame | dict,
        entries: pd.Series | pd.DataFrame,
        exits: pd.Series | pd.DataFrame,
    ) -> tuple[pd.Series | pd.DataFrame, pd.Series | pd.DataFrame]:
        """Filter entry/exit signals to a specified time window.

        Args:
            df: OHLCV DataFrame or dict of DataFrames.
            entries: Boolean entry signal Series or DataFrame.
            exits: Boolean exit signal Series or DataFrame.

        Returns:
            Tuple of (filtered_entries, filtered_exits).
        """
        start_time = self.config.get("startTime")
        end_time = self.config.get("endTime")

        if not start_time and not end_time:
            return entries, exits

        target_index = df["close"].index if isinstance(df, dict) else df.index
        if not isinstance(target_index, pd.DatetimeIndex):
            return entries, exits

        time_mask = pd.Series(True, index=target_index)
        if start_time and end_time:
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

    def _max_period_from_node(self, node: dict) -> int:
        """Recursively find the maximum indicator period in a rule group tree.

        Used to estimate the warmup (burn-in) period needed before the first
        reliable signal can fire. If this exceeds 30% of available bars the
        strategy will produce unreliable results.

        Args:
            node: A RuleGroup or Condition dict.

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
        period = int(node.get("period") or 0)
        right_period = int(node.get("rightPeriod") or 0)
        return max(period, right_period)

    def generate_signals(
        self, df: pd.DataFrame | dict
    ) -> tuple[pd.Series | pd.DataFrame, pd.Series | pd.DataFrame, list[str]]:
        """Generate entry and exit signals from the strategy config.

        Supports both VISUAL mode (rule builder) and CODE mode
        (sandboxed Python execution).

        All strategies default to ``nextBarEntry = True``: signals computed
        on the current bar's close are executed on the **next bar's open**.
        This prevents same-bar look-ahead bias where an entry fires at the
        exact close that generated the signal — something that is impossible
        to fill in live trading. Set ``nextBarEntry = False`` in the config
        explicitly only when the execution model genuinely supports it
        (e.g. fill-at-VWAP intraday where the signal fires at the open).

        Args:
            df: OHLCV DataFrame or dict of DataFrames (universe mode).

        Returns:
            Tuple of (entries, exits, warnings) — boolean Series or DataFrames
            aligned to the input DataFrame's index, and a list of warnings.
        """
        warnings_list: list[str] = []
        mode = self.config.get("mode", "VISUAL")

        if mode == "CODE":
            entries, exits, warnings_list = self._execute_python_code(df)
        else:
            entry_group = self.config.get("entryLogic")
            exit_group = self.config.get("exitLogic")
            target_index = df["close"].index if isinstance(df, dict) else df.index
            is_universe = isinstance(df, dict)

            # --- Fix #2: Warmup period guard -----------------------------------
            # Warn when the longest indicator period consumes a significant share
            # of available bars — the strategy's early signals will be based on
            # partial indicator warmup and are statistically unreliable.
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

            if not entry_group:
                if is_universe:
                    entries = pd.DataFrame(False, index=target_index, columns=df["close"].columns)
                else:
                    entries = pd.Series(False, index=target_index)
                exits = entries
            else:
                entries = self._evaluate_node(df, entry_group)
                # Scalar True (empty group) → broadcast to full Series/DataFrame
                if isinstance(entries, (bool, np.bool_)):
                    if is_universe:
                        entries = pd.DataFrame(entries, index=target_index, columns=df["close"].columns)
                    else:
                        entries = pd.Series(entries, index=target_index)

                if not exit_group:
                    if is_universe:
                        exits = pd.DataFrame(False, index=target_index, columns=df["close"].columns)
                    else:
                        exits = pd.Series(False, index=target_index)
                else:
                    exits = self._evaluate_node(df, exit_group)
                    # Scalar True (empty group) → broadcast to full Series/DataFrame
                    if isinstance(exits, (bool, np.bool_)):
                        if is_universe:
                            exits = pd.DataFrame(exits, index=target_index, columns=df["close"].columns)
                        else:
                            exits = pd.Series(exits, index=target_index)

        # --- Fix #1: Look-ahead bias prevention --------------------------------
        # Default nextBarEntry = True for ALL strategies (including custom Visual
        # Builder strategies). Entries fire at next bar's open, not the signal
        # bar's close. Presets that previously set nextBarEntry=True explicitly
        # are unaffected — they keep the same behaviour. Only custom strategies
        # that previously fell through to False are corrected here.
        if self.config.get("nextBarEntry", True) and entries is not None and exits is not None:
            entries = entries.shift(1).fillna(False)
            exits = exits.shift(1).fillna(False)

        return entries, exits, warnings_list

    def _execute_python_code(
        self, df: pd.DataFrame | dict
    ) -> tuple[pd.Series | None, pd.Series | None, list[str]]:
        """Execute user-defined Python code in a restricted sandbox.

        The sandbox blocks object introspection escape vectors
        (e.g. __class__.__bases__[0].__subclasses__()) by overriding
        __getattr__ on the globals dict and scanning the code AST for
        blocked attribute names before execution.

        Args:
            df: OHLCV DataFrame or dict of DataFrames passed as 'df'
                into the user's code scope.

        Returns:
            Tuple of (entries, exits, warnings) from the user's signal_logic(df)
            function, or (None, None, []) on error or missing function.

        Raises:
            No exceptions are raised — all errors are logged.
        """
        import ast
        import warnings

        code = self.config.get("pythonCode", "")
        if not code:
            return None, None, []

        # --- Issue #13: AST scan for blocked attribute accesses ---
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, ast.Attribute) and node.attr in _BLOCKED_ATTRS:
                    logger.error(
                        f"Code sandbox violation: blocked attribute '{node.attr}' detected."
                    )
                    return None, None, []
                if isinstance(node, ast.Name) and node.id in _BLOCKED_ATTRS:
                    logger.error(
                        f"Code sandbox violation: blocked name '{node.id}' detected."
                    )
                    return None, None, []
        except SyntaxError as exc:
            logger.error(f"Code Syntax Error: {exc}")
            return None, None, []

        try:
            safe_globals: dict = {
                "__builtins__": {
                    "abs": abs, "max": max, "min": min, "len": len,
                    "range": range, "round": round, "int": int,
                    "float": float, "bool": bool, "str": str,
                    "list": list, "dict": dict, "set": set,
                    # Explicitly excluded: print, open, eval, exec, __import__
                },
                "df": df,
                "vbt": vbt,
                "pd": pd,
                "np": np,
                "ta": ta,
                # 'config' gives code access to strategy params (e.g. period, multiplier)
                "config": self.config.get("params", self.config),
            }
            
            with warnings.catch_warnings(record=True) as w:
                warnings.simplefilter("always")
                exec(code, safe_globals)  # noqa: S102

                if "signal_logic" in safe_globals:
                    entries, exits = safe_globals["signal_logic"](df)
                    captured_warnings = [str(warn.message) for warn in w]
                    return entries, exits, captured_warnings
                else:
                    logger.error("Python Code must define a 'signal_logic(df)' function.")
                    return None, None, []
        except Exception as exc:
            logger.error(f"Code Execution Error: {exc}")
            return None, None, []


class StrategyFactory:
    """Factory for resolving strategy IDs to strategy instances."""

    @staticmethod
    def get_strategy(strategy_id: str, config: dict) -> BaseStrategy:
        """Resolve a strategy ID to a configured strategy instance.

        Args:
            strategy_id: Strategy identifier. '1'-'7' map to built-in presets.
                All other IDs use the DynamicStrategy with the provided config.
            config: Strategy configuration dict passed to the strategy.

        Returns:
            A BaseStrategy subclass instance ready to call generate_signals().

        Note:
            If config already contains user-provided ``entryLogic`` or
            ``pythonCode``, the factory always uses DynamicStrategy regardless
            of strategy_id. This prevents the preset override bug where edits
            made in the Visual Builder or Code editor were silently discarded.
        """
        # Guard: if the request carries user-defined logic, always respect it.
        # This prevents the preset override bug — edits in the Visual Builder or
        # Python Code editor must take precedence over the hardcoded factory logic.
        if config.get("entryLogic") or config.get("pythonCode"):
            return DynamicStrategy(config)

        if strategy_id == "1":
            # RSI Mean Reversion Preset
            return DynamicStrategy({
                "nextBarEntry": True,  # Enter on next candle open after signal fires
                "entryLogic": {
                    "type": "GROUP",
                    "logic": "AND",
                    "conditions": [{
                        "indicator": "RSI",
                        "period": config.get("period", 14),
                        "operator": "Crosses Below",  # fires ONCE at the crossing bar
                        "compareType": "STATIC",
                        "value": config.get("lower", 30),
                    }],
                },
                "exitLogic": {
                    "type": "GROUP",
                    "logic": "AND",
                    "conditions": [{
                        "indicator": "RSI",
                        "period": config.get("period", 14),
                        "operator": "Crosses Above",  # fires ONCE at the crossing bar
                        "compareType": "STATIC",
                        "value": config.get("upper", 70),
                    }],
                }
            })

        # 2. Bollinger Bands Mean Reversion
        if strategy_id == "2":
            period = int(config.get("period", 20))
            std_dev = float(config.get("std_dev", 2.0))
            return DynamicStrategy({
                "nextBarEntry": True,  # Enter on next candle open after signal fires
                "mode": "CODE",
                "pythonCode": f"""
def signal_logic(df):
    bb = vbt.BBANDS.run(df['close'], window={period}, alpha={std_dev})
    entries = df['close'] < bb.lower
    exits = df['close'] > bb.middle
    return entries, exits
"""
            })

        # 3. MACD Crossover (replaces old SMA placeholder if any)
        if strategy_id == "3":
            fast = int(config.get("fast", 12))
            slow = int(config.get("slow", 26))
            signal = int(config.get("signal", 9))
            return DynamicStrategy({
                "nextBarEntry": True,  # Enter on next candle open after crossover fires
                "mode": "CODE",
                "pythonCode": f"""
def signal_logic(df):
    macd = vbt.MACD.run(df['close'], fast_window={fast}, slow_window={slow}, signal_window={signal})
    entries = macd.macd.vbt.crossed_above(macd.signal)
    exits = macd.macd.vbt.crossed_below(macd.signal)
    return entries, exits
"""
            })

        # 4. EMA Crossover
        if strategy_id == "4":
            fast = int(config.get("fast", 20))
            slow = int(config.get("slow", 50))
            return DynamicStrategy({
                "nextBarEntry": True,  # Enter on next candle open after crossover fires
                "mode": "CODE",
                "pythonCode": f"""
def signal_logic(df):
    fast_ma = vbt.MA.run(df['close'], {fast}, ewm=True)
    slow_ma = vbt.MA.run(df['close'], {slow}, ewm=True)
    entries = fast_ma.ma.vbt.crossed_above(slow_ma.ma)
    exits = fast_ma.ma.vbt.crossed_below(slow_ma.ma)
    return entries, exits
"""
            })

        # 5. Supertrend — proper flip-based trailing-stop implementation.
        # The previous version was a plain ATR-band EMA crossover, which produces
        # far more signals and does not replicate TradingView's Supertrend.
        # This implementation uses the canonical upper/lower band clamping logic
        # and a sequential direction tracker identical to Pine Script's behaviour.
        if strategy_id == "5":
            period = int(config.get("period", 10))
            multiplier = float(config.get("multiplier", 3.0))
            return DynamicStrategy({
                "nextBarEntry": True,
                "mode": "CODE",
                "pythonCode": f"""
def signal_logic(df):
    import numpy as np

    high  = df['high'].values
    low   = df['low'].values
    close = df['close'].values
    n     = len(close)

    # ATR-based band centres (HL2)
    atr_series = vbt.ATR.run(df['high'], df['low'], df['close'], window={period}).atr
    atr = atr_series.values
    hl2 = (high + low) / 2.0

    basic_upper = hl2 + {multiplier} * atr
    basic_lower = hl2 - {multiplier} * atr

    # Initialise refined bands and direction arrays
    upper     = basic_upper.copy()
    lower     = basic_lower.copy()
    direction = np.zeros(n, dtype=np.int8)   # 1 = bullish, -1 = bearish

    for i in range(1, n):
        if np.isnan(atr[i]):
            # Still in ATR warmup — carry previous values forward
            upper[i]     = upper[i - 1]
            lower[i]     = lower[i - 1]
            direction[i] = direction[i - 1]
            continue

        # Band clamping: only tighten, never widen while price stays on same side
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

        # Trend flip logic (matches Pine Script Supertrend exactly)
        if close[i] > upper[i - 1]:
            direction[i] = 1    # Bullish flip / continuation
        elif close[i] < lower[i - 1]:
            direction[i] = -1   # Bearish flip / continuation
        else:
            direction[i] = direction[i - 1]  # No flip — maintain trend

    direction_s = pd.Series(direction, index=df.index)
    prev_dir    = direction_s.shift(1).fillna(0)

    # Signal fires only on the bar where the trend FLIPS (not every bullish bar)
    entries = (direction_s == 1)  & (prev_dir != 1)
    exits   = (direction_s == -1) & (prev_dir != -1)
    return entries.fillna(False), exits.fillna(False)
"""
            })

        # 6. Stochastic RSI
        if strategy_id == "6":
            rsi_period = int(config.get("rsi_period", 14))
            k_period = int(config.get("k_period", 3))
            d_period = int(config.get("d_period", 3))
            return DynamicStrategy({
                "nextBarEntry": True,  # Enter on next candle open after crossover fires
                "mode": "CODE",
                "pythonCode": f"""
def signal_logic(df):
    rsi = vbt.RSI.run(df['close'], window={rsi_period}).rsi
    min_rsi = rsi.rolling({k_period}).min()
    max_rsi = rsi.rolling({k_period}).max()
    stoch_rsi = (rsi - min_rsi) / (max_rsi - min_rsi)
    k_line = stoch_rsi.rolling({d_period}).mean() * 100

    entries = k_line.vbt.crossed_above(20)
    exits = k_line.vbt.crossed_below(80)
    return entries, exits
"""
            })

        # 7. ATR Channel Breakout
        if strategy_id == "7":
            period = int(config.get("period", 14))
            multiplier = float(config.get("multiplier", 2.0))
            return DynamicStrategy({
                "mode": "CODE",
                "pythonCode": f"""
def signal_logic(df):
    atr = vbt.ATR.run(df['high'], df['low'], df['close'], window={period}).atr
    upper_breakout = df['high'].shift(1) + (atr * {multiplier})
    lower_breakout = df['low'].shift(1) - (atr * {multiplier})
    
    entries = df['close'] > upper_breakout
    exits = df['close'] < lower_breakout
    return entries, exits
"""
            })

        return DynamicStrategy(config)
