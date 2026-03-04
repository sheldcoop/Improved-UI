"""services/signal_checker.py — Live signal evaluation for paper trading.

Fetches recent candles from Dhan, runs the strategy engine, and inspects
only the last bar to decide whether to BUY, SELL, or HOLD.
"""
from __future__ import annotations

import math
from logging import getLogger
from datetime import datetime, timedelta
from typing import Literal

import pandas as pd

logger = getLogger(__name__)

# How many candles to fetch for indicator warmup
_LOOKBACK_BARS = 200

# Bars per trading day by timeframe (NSE: 9:15 AM – 3:30 PM = 375 min)
_BARS_PER_DAY: dict[str, float] = {
    "1min":  375,
    "5min":  75,
    "15min": 25,
    "30min": 12.5,
    "60min": 6.25,
    "1hr":   6.25,
    "daily": 1,
}

SignalResult = Literal["BUY", "SELL", "HOLD"]


def _trading_days_needed(timeframe: str, bars: int) -> int:
    """Return calendar days required to get `bars` candles for `timeframe`.

    Args:
        timeframe: Candle interval string (e.g. '15min', 'daily').
        bars: Number of bars needed.

    Returns:
        Calendar days (adds 40% buffer for weekends/holidays).
    """
    bpd = _BARS_PER_DAY.get(timeframe, 25)
    trading_days = math.ceil(bars / bpd)
    return math.ceil(trading_days * 1.4)  # ~40% buffer for weekends


def _fetch_candles(symbol: str, timeframe: str, lookback: int = _LOOKBACK_BARS) -> pd.DataFrame:
    """Fetch recent OHLCV candles from the data fetcher service.

    Args:
        symbol: NSE ticker/index symbol (e.g. 'RELIANCE', 'NIFTY 50').
        timeframe: Candle interval (e.g. '15min', 'daily').
        lookback: Number of bars to request.

    Returns:
        DataFrame with columns: open, high, low, close, volume.

    Raises:
        RuntimeError: If data fetch fails or returns empty DataFrame.
    """
    from services.dhan_fetcher import DhanDataFetcher

    calendar_days = _trading_days_needed(timeframe, lookback)
    to_date   = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=calendar_days)).strftime("%Y-%m-%d")

    fetcher = DhanDataFetcher()
    is_intraday = timeframe != "daily"

    if is_intraday:
        df = fetcher.get_historical_intraday(symbol, timeframe, from_date, to_date)
    else:
        df = fetcher.get_historical_daily(symbol, from_date, to_date)

    if df is None or df.empty:
        raise RuntimeError(f"No data returned for {symbol} / {timeframe}")

    return df.tail(lookback)


def check_signal(
    monitor: dict,
    virtual_capital: float = 100_000.0,
    has_open_position: bool = False,
) -> tuple[SignalResult, int, float]:
    """Evaluate the strategy on the most recent candle and return a trading signal.

    Decision logic:
      - Entry (entries.iloc[-1] == True) AND no open position → BUY
      - Exit  (exits.iloc[-1]   == True) AND open position exists → SELL
      - Otherwise                                                  → HOLD

    Pyramiding is capped at 1: a second BUY on the same symbol is blocked
    when has_open_position=True.

    Args:
        monitor: Monitor config dict with keys: symbol, strategy_id, config,
            timeframe, capital_pct.
        virtual_capital: Current available virtual capital in ₹.
        has_open_position: Whether an open position already exists for this symbol.

    Returns:
        Tuple of (signal, qty, ltp) where:
          - signal: 'BUY', 'SELL', or 'HOLD'
          - qty: Number of units to trade (0 for HOLD/SELL)
          - ltp: Last traded price used for sizing

    Raises:
        RuntimeError: If candle fetch or signal computation fails.
    """
    from strategies.presets import StrategyFactory

    symbol     = monitor["symbol"]
    timeframe  = monitor.get("timeframe", "15min")
    strategy_id = monitor["strategy_id"]
    config     = monitor.get("config", {})
    capital_pct = float(monitor.get("capital_pct", 10.0))

    # Load saved strategy config for custom strategies (same pattern as backtest engine)
    if strategy_id not in ("1", "2", "3", "4", "5", "6", "7") and not config.get("entryLogic") and not config.get("pythonCode"):
        from services.strategy_store import StrategyStore
        saved = StrategyStore.get_by_id(strategy_id)
        if saved:
            for k, v in saved.items():
                if k not in config or not config[k]:
                    config[k] = v

    logger.info(f"Checking signal: {symbol} / {strategy_id} / {timeframe}")

    df = _fetch_candles(symbol, timeframe)
    strategy = StrategyFactory.get_strategy(strategy_id, config)
    entries, exits, warnings = strategy.generate_signals(df)

    last_entry = bool(entries.iloc[-1])
    last_exit  = bool(exits.iloc[-1])
    ltp        = float(df["close"].iloc[-1])

    if warnings:
        for w in warnings:
            logger.warning(f"Signal warning [{symbol}]: {w}")

    # Determine signal
    if last_entry and not has_open_position:
        qty = _compute_qty(virtual_capital, capital_pct, ltp)
        logger.info(f"BUY signal: {symbol} qty={qty} @ ₹{ltp:.2f}")
        return "BUY", qty, ltp

    if last_exit and has_open_position:
        logger.info(f"SELL signal: {symbol} @ ₹{ltp:.2f}")
        return "SELL", 0, ltp

    return "HOLD", 0, ltp


def _compute_qty(capital: float, pct: float, ltp: float) -> int:
    """Calculate the number of units to buy based on capital allocation.

    Args:
        capital: Total virtual capital in ₹.
        pct: Percentage of capital to allocate (e.g. 10.0 = 10%).
        ltp: Last traded price per unit.

    Returns:
        Maximum whole units purchasable (minimum 1).
    """
    if ltp <= 0:
        return 1
    allocated = capital * (pct / 100.0)
    qty = math.floor(allocated / ltp)
    return max(1, qty)


def check_signal_on_df(
    df: pd.DataFrame,
    strategy_id: str,
    config: dict,
    bar_index: int = -1,
) -> tuple[SignalResult, float]:
    """Run signal check on a pre-loaded DataFrame (used for Replay mode).

    Args:
        df: OHLCV DataFrame (all bars up to and including the bar to evaluate).
        strategy_id: Preset or saved strategy ID.
        config: Strategy parameters dict.
        bar_index: Bar index to evaluate (-1 = last bar).

    Returns:
        Tuple of (signal, ltp).
    """
    from strategies.presets import StrategyFactory

    strategy = StrategyFactory.get_strategy(strategy_id, config)
    entries, exits, _ = strategy.generate_signals(df.iloc[:bar_index + 1] if bar_index != -1 else df)

    last_entry = bool(entries.iloc[-1])
    last_exit  = bool(exits.iloc[-1])
    ltp        = float(df["close"].iloc[bar_index if bar_index != -1 else -1])

    if last_entry:
        return "BUY", ltp
    if last_exit:
        return "SELL", ltp
    return "HOLD", ltp
