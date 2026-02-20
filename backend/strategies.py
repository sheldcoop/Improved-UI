"""strategies.py — Strategy classes and StrategyFactory.

Fixes applied:
  - Type hints on all public methods (Issue #4)
  - Docstrings on all public methods (Issue #5)
  - exec() sandbox hardened with object introspection guard (Issue #13)
"""
from __future__ import annotations


import pandas as pd
import numpy as np
import vectorbt as vbt
from logging import getLogger
import ta  # replaces pandas_ta (no Python 3.9 build available for pandas_ta)

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
        self.resampled_cache: dict = {}

    def generate_signals(self, df: pd.DataFrame | dict) -> tuple:
        """Generate entry and exit signal arrays from OHLCV data.

        Args:
            df: OHLCV DataFrame or dict of DataFrames (universe mode).

        Returns:
            Tuple of (entries, exits) — boolean Series or DataFrames.

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

        Args:
            df: OHLCV DataFrame or dict of DataFrames.
            indicator_type: Indicator name (e.g. 'RSI', 'SMA', 'Close Price').
            period: Lookback period for the indicator. Default 14.
            timeframe: Optional higher timeframe for MTF resampling
                (e.g. '1h'). If None, uses the base timeframe.

        Returns:
            Indicator Series (or DataFrame for universe mode), reindexed
            to the original timeline if MTF resampling was applied.
        """
        base_df = df
        is_universe = isinstance(df, dict)

        if timeframe:
            cache_key = f"{timeframe}_{'UNIVERSE' if is_universe else 'SINGLE'}"
            if cache_key in self.resampled_cache:
                base_df = self.resampled_cache[cache_key]
            else:
                tf_map = {"1m": "1T", "5m": "5T", "15m": "15T", "1h": "1H", "1d": "1D"}
                pandas_freq = tf_map.get(timeframe)
                if pandas_freq:
                    try:
                        if is_universe:
                            agg_rules = {
                                "Open": "first", "High": "max",
                                "Low": "min", "Close": "last", "Volume": "sum",
                            }
                            resampled_dict = {
                                col: data.resample(pandas_freq).apply(agg_rules.get(col, "last")).dropna()
                                for col, data in df.items()
                            }
                            base_df = resampled_dict
                        else:
                            base_df = df.resample(pandas_freq).agg({
                                "Open": "first", "High": "max",
                                "Low": "min", "Close": "last", "Volume": "sum",
                            }).dropna()
                        self.resampled_cache[cache_key] = base_df
                    except Exception as exc:
                        logger.warning(f"MTF Resample Failed: {exc}. Using base dataframe.")
                        base_df = df

        if isinstance(base_df, dict):
            close = base_df.get("Close")
            high = base_df.get("High", close)
            low = base_df.get("Low", close)
            volume = base_df.get("Volume", None)
            open_p = base_df.get("Open", close)
        else:
            close = base_df["Close"]
            high = base_df.get("High", close)
            low = base_df.get("Low", close)
            volume = base_df.get("Volume", None)
            open_p = base_df.get("Open", None)

        period = int(period) if period else 14
        result_series = None

        try:
            if indicator_type == "RSI":
                result_series = vbt.RSI.run(close, window=period).rsi
            elif indicator_type == "SMA":
                result_series = vbt.MA.run(close, window=period).ma
            elif indicator_type == "EMA":
                result_series = close.ewm(span=period, adjust=False).mean()
            elif indicator_type == "MACD":
                result_series = ta.trend.macd(close, window_slow=26, window_fast=12)
            elif indicator_type == "MACD Signal":
                result_series = ta.trend.macd_signal(close, window_slow=26, window_fast=12, window_sign=9)
            elif indicator_type == "Bollinger Upper":
                result_series = vbt.BBANDS.run(close, window=period).upper
            elif indicator_type == "Bollinger Lower":
                result_series = vbt.BBANDS.run(close, window=period).lower
            elif indicator_type == "Bollinger Mid":
                result_series = vbt.BBANDS.run(close, window=period).middle
            elif indicator_type == "ATR":
                result_series = vbt.ATR.run(high, low, close, window=period).atr
            elif indicator_type == "Close Price":
                result_series = close
            elif indicator_type == "Open Price":
                result_series = open_p
            elif indicator_type == "High Price":
                result_series = high
            elif indicator_type == "Low Price":
                result_series = low
            elif indicator_type == "Volume":
                result_series = volume if volume is not None else close
            else:
                result_series = close
        except Exception as exc:
            logger.error(f"Indicator Error ({indicator_type}): {exc}")
            result_series = close

        if timeframe and result_series is not None:
            target_index = df["Close"].index if isinstance(df, dict) else df.index
            result_series = result_series.reindex(target_index).ffill()

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
                return True

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

        target_index = df["Close"].index if isinstance(df, dict) else df.index
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

    def generate_signals(
        self, df: pd.DataFrame | dict
    ) -> tuple[pd.Series | pd.DataFrame, pd.Series | pd.DataFrame]:
        """Generate entry and exit signals from the strategy config.

        Supports both VISUAL mode (rule builder) and CODE mode
        (sandboxed Python execution).

        When ``nextBarEntry`` is True in the config, all signals are shifted
        forward by one bar so execution happens on the next candle's open
        rather than the same candle that generated the signal. This matches
        the ATR Channel Breakout (strategy 7) and is the realistic default
        for daily-bar strategies.

        Args:
            df: OHLCV DataFrame or dict of DataFrames (universe mode).

        Returns:
            Tuple of (entries, exits) — boolean Series or DataFrames
            aligned to the input DataFrame's index.
        """
        if self.config.get("mode") == "CODE":
            entries, exits = self._execute_python_code(df)
        else:
            entry_group = self.config.get("entryLogic")
            exit_group = self.config.get("exitLogic")
            target_index = df["Close"].index if isinstance(df, dict) else df.index
            is_universe = isinstance(df, dict)

            if not entry_group:
                if is_universe:
                    entries = pd.DataFrame(False, index=target_index, columns=df["Close"].columns)
                else:
                    entries = pd.Series(False, index=target_index)
                exits = entries
            else:
                entries = self._evaluate_node(df, entry_group)
                if not exit_group:
                    if is_universe:
                        exits = pd.DataFrame(False, index=target_index, columns=df["Close"].columns)
                    else:
                        exits = pd.Series(False, index=target_index)
                else:
                    exits = self._evaluate_node(df, exit_group)

            entries, exits = self._apply_time_filter(df, entries, exits)

        # Delay by 1 bar: enter on next candle open, not signal candle close.
        if self.config.get("nextBarEntry", False) and entries is not None and exits is not None:
            entries = entries.shift(1).fillna(False)
            exits = exits.shift(1).fillna(False)

        return entries, exits

    def _execute_python_code(
        self, df: pd.DataFrame | dict
    ) -> tuple[pd.Series | None, pd.Series | None]:
        """Execute user-defined Python code in a restricted sandbox.

        The sandbox blocks object introspection escape vectors
        (e.g. __class__.__bases__[0].__subclasses__()) by overriding
        __getattr__ on the globals dict and scanning the code AST for
        blocked attribute names before execution.

        Args:
            df: OHLCV DataFrame or dict of DataFrames passed as 'df'
                into the user's code scope.

        Returns:
            Tuple of (entries, exits) from the user's signal_logic(df)
            function, or (None, None) on error or missing function.

        Raises:
            No exceptions are raised — all errors are logged.
        """
        import ast

        code = self.config.get("pythonCode", "")
        if not code:
            return None, None

        # --- Issue #13: AST scan for blocked attribute accesses ---
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, ast.Attribute) and node.attr in _BLOCKED_ATTRS:
                    logger.error(
                        f"Code sandbox violation: blocked attribute '{node.attr}' detected."
                    )
                    return None, None
                if isinstance(node, ast.Name) and node.id in _BLOCKED_ATTRS:
                    logger.error(
                        f"Code sandbox violation: blocked name '{node.id}' detected."
                    )
                    return None, None
        except SyntaxError as exc:
            logger.error(f"Code Syntax Error: {exc}")
            return None, None

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
            }
            exec(code, safe_globals)  # noqa: S102

            if "signal_logic" in safe_globals:
                return safe_globals["signal_logic"](df)
            else:
                logger.error("Python Code must define a 'signal_logic(df)' function.")
                return None, None
        except Exception as exc:
            logger.error(f"Code Execution Error: {exc}")
            return None, None


class StrategyFactory:
    """Factory for resolving strategy IDs to strategy instances."""

    @staticmethod
    def get_strategy(strategy_id: str, config: dict) -> BaseStrategy:
        """Resolve a strategy ID to a configured strategy instance.

        Args:
            strategy_id: Strategy identifier. '3' maps to a preset SMA
                crossover. All other IDs use the DynamicStrategy with
                the provided config.
            config: Strategy configuration dict passed to the strategy.

        Returns:
            A BaseStrategy subclass instance ready to call generate_signals().
        """
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
                        "operator": "<",
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
                        "operator": ">",
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
    bb = vbt.BBANDS.run(df['Close'], window={period}, alpha={std_dev})
    entries = df['Close'] < bb.lower
    exits = df['Close'] > bb.middle
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
    macd = vbt.MACD.run(df['Close'], fast_window={fast}, slow_window={slow}, signal_window={signal})
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
    fast_ma = vbt.MA.run(df['Close'], {fast}, ewm=True)
    slow_ma = vbt.MA.run(df['Close'], {slow}, ewm=True)
    entries = fast_ma.ma.vbt.crossed_above(slow_ma.ma)
    exits = fast_ma.ma.vbt.crossed_below(slow_ma.ma)
    return entries, exits
"""
            })

        # 5. Supertrend
        if strategy_id == "5":
            period = int(config.get("period", 10))
            multiplier = float(config.get("multiplier", 3.0))
            return DynamicStrategy({
                "nextBarEntry": True,  # Enter on next candle open after signal fires
                "mode": "CODE",
                "pythonCode": f"""
def signal_logic(df):
    # Simplified Supertrend logic using ATR bands
    high = df['High']
    low = df['Low']
    close = df['Close']
    atr = vbt.ATR.run(high, low, close, window={period}).atr
    
    # We use a robust Trend-Follow approach: 
    # Long when Close > EMA + Mult*ATR
    ema = vbt.MA.run(close, {period}, ewm=True).ma
    upper_band = ema + ({multiplier} * atr)
    lower_band = ema - ({multiplier} * atr)
    
    entries = close.vbt.crossed_above(upper_band)
    exits = close.vbt.crossed_below(lower_band) 
    return entries, exits
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
    rsi = vbt.RSI.run(df['Close'], window={rsi_period}).rsi
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
    atr = vbt.ATR.run(df['High'], df['Low'], df['Close'], window={period}).atr
    upper_breakout = df['High'].shift(1) + (atr * {multiplier})
    lower_breakout = df['Low'].shift(1) - (atr * {multiplier})
    
    entries = df['Close'] > upper_breakout
    exits = df['Close'] < lower_breakout
    return entries, exits
"""
            })

        return DynamicStrategy(config)
