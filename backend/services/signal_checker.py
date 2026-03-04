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
    """Fetch recent OHLCV candles using the cache-first DataFetcher.

    Uses the Parquet cache when available (populated from earlier backtests)
    and only hits the Dhan API on a cache miss.

    Args:
        symbol: NSE ticker/index symbol (e.g. 'RELIANCE', 'NIFTY 50').
        timeframe: Candle interval (e.g. '15min', 'daily').
        lookback: Number of bars to request.

    Returns:
        DataFrame with columns: open, high, low, close, volume.

    Raises:
        RuntimeError: If data fetch fails or returns empty DataFrame.
    """
    from services.data_fetcher import DataFetcher
    from services.dhan_fetcher import DhanDataFetcher  # for _TF_MAP only

    calendar_days = _trading_days_needed(timeframe, lookback)
    to_date   = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=calendar_days)).strftime("%Y-%m-%d")

    # Normalise the timeframe string to what DataFetcher/DhanHistoricalService expects
    normalised_tf = DhanDataFetcher._TF_MAP.get(timeframe, timeframe)

    fetcher = DataFetcher()
    df = fetcher.fetch_historical_data(
        symbol=symbol,
        timeframe=normalised_tf,
        from_date=from_date,
        to_date=to_date,
    )

    if df is None or df.empty:
        # Do not raise an exception, as this occurs gracefully out of market hours
        return pd.DataFrame()

    return df.tail(lookback)



def check_signal(
    monitor: dict,
    virtual_capital: float = 100_000.0,
    has_open_position: bool = False,
) -> tuple[SignalResult, int, float, dict]:
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
        Tuple of (signal, qty, ltp, indicators) where:
          - signal: 'BUY', 'SELL', or 'HOLD'
          - qty: Number of units to trade (0 for HOLD/SELL)
          - ltp: Last traded price used for sizing
          - indicators: Dict of indicator values at signal time

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
    if df.empty:
        logger.info(f"Market data unavailable for {symbol} (Market closed?). Holding position.")
        # If no LTP is available, we return 0.0 (ltp_service.py's global ticker handles actual tracking)
        return "HOLD", 0, 0.0, {}
    
    
    # Phase 1 Fix: Temporarily disable nextBarEntry shift during live signal generation.
    # Otherwise, pandas .shift(1) drops the newest signal off the edge of the dataframe.
    next_bar_entry = bool(config.get("nextBarEntry", True))
    eval_config = config.copy()
    eval_config["nextBarEntry"] = False
    
    strategy = StrategyFactory.get_strategy(strategy_id, eval_config)
    entries, exits, warnings, indicators = strategy.generate_signals(df)

    if next_bar_entry and len(entries) >= 2:
        # Wait for candle to close: execute on the Open of the NEW candle based on the LAST COMPLETED candle
        idx = -2
    else:
        # Immediate execution: evaluate the currently forming candle
        idx = -1

    last_entry = bool(entries.iloc[idx])
    last_exit  = bool(exits.iloc[idx])

    ltp = float(df["close"].iloc[-1])

    if warnings:
        for w in warnings:
            logger.warning(f"Signal warning [{symbol}]: {w}")

    current_indicators = {}
    if indicators:
        for k, v in indicators.items():
            if isinstance(v, pd.Series):
                try:
                    val = float(v.iloc[idx])
                    if not math.isnan(val) and not math.isinf(val):
                        current_indicators[k] = val
                except Exception:
                    pass

    # Determine signal
    if last_entry and not has_open_position:
        qty = _compute_qty(virtual_capital, capital_pct, ltp)
        logger.info(f"BUY signal: {symbol} qty={qty} @ ₹{ltp:.2f}")
        return "BUY", qty, ltp, current_indicators

    if last_exit and has_open_position:
        logger.info(f"SELL signal: {symbol} @ ₹{ltp:.2f}")
        return "SELL", 0, ltp, current_indicators

    return "HOLD", 0, ltp, current_indicators


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
