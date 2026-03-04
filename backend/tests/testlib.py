"""tests/testlib.py — Importable helper functions shared across unit/ and integration/.

conftest.py in pytest is loaded as a plugin (not an importable module), so
sub-packages in unit/ and integration/ cannot do `from conftest import ...`.
This file IS a regular module and can be imported from anywhere under tests/.

All shared data factories and mock builders live here.
The fixtures (paper_store, flask_client) remain in conftest.py because they
must be pytest fixtures.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

import numpy as np
import pandas as pd

# Ensure backend/ root is on sys.path
_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)


# ---------------------------------------------------------------------------
# OHLCV data factories
# ---------------------------------------------------------------------------

def make_ohlcv(
    n: int = 252,
    start_price: float = 100.0,
    end_price: float = 130.0,
    freq: str = "D",
    seed: int = 42,
) -> pd.DataFrame:
    """Generate deterministic synthetic OHLCV data (calendar-day freq by default)."""
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2023-01-01", periods=n, freq=freq)
    close = np.linspace(start_price, end_price, n) + rng.normal(0, 0.5, n)
    close = np.maximum(close, 1.0)
    return pd.DataFrame(
        {
            "open":   close * 0.999,
            "high":   close * 1.005,
            "low":    close * 0.995,
            "close":  close,
            "volume": np.full(n, 1_000_000.0),
        },
        index=idx,
    )


def make_oscillating(n: int = 100, cycles: int = 3) -> pd.DataFrame:
    """Sinusoidal prices — RSI crosses 30 and 70 multiple times per cycle."""
    t = np.linspace(0, cycles * 2 * np.pi, n)
    close = 100 + 25 * np.sin(t)
    dates = pd.date_range("2023-01-01", periods=n, freq="D")
    return pd.DataFrame(
        {
            "open":   close * 0.999,
            "high":   close * 1.005,
            "low":    close * 0.995,
            "close":  close,
            "volume": np.ones(n) * 1_000_000,
        },
        index=dates,
    )


# ---------------------------------------------------------------------------
# Mock VBT portfolio factory
# ---------------------------------------------------------------------------

def make_mock_pf(
    df: pd.DataFrame,
    pnl_list: list[float] | None = None,
    sharpe: float = 1.0,
    max_dd: float = -0.05,
    win_rate: float = 0.5,
    profit_factor: float = 1.2,
    total_trades: int = 5,
    total_return: float = 0.0,
) -> MagicMock:
    """Build a MagicMock VBT Portfolio for unit tests."""
    pnl_list = pnl_list or []
    pf = MagicMock()
    pf.value.return_value = pd.Series(100_000.0 * (1 + total_return), index=df.index)
    pf.wrapper.columns = pd.Index(["A"])
    pf.sharpe_ratio.return_value = pd.Series([sharpe])
    pf.max_drawdown.return_value = pd.Series([max_dd])
    pf.win_rate.return_value = pd.Series([win_rate * 100])
    pf.profit_factor.return_value = pd.Series([profit_factor])
    pf.trades.count.return_value = pd.Series([total_trades])
    pf.trades.records_readable = pd.DataFrame({"PnL": pnl_list})
    pf.drawdown.return_value = pd.Series(0.0, index=df.index)
    pf.stats.return_value = {}
    pf.total_return.return_value = total_return
    return pf


# ---------------------------------------------------------------------------
# Paper store helpers
# ---------------------------------------------------------------------------

def make_monitor(monitor_id: str = "mon1", symbol: str = "RELIANCE") -> dict:
    """Return a minimal valid monitor dict."""
    return {
        "id":          monitor_id,
        "symbol":      symbol,
        "strategy_id": "1",
        "config":      {"period": 14, "lower": 30, "upper": 70},
        "timeframe":   "15min",
        "capital_pct": 10.0,
        "sl_pct":      2.0,
        "tp_pct":      5.0,
        "status":      "WATCHING",
        "created_at":  "2025-01-01T09:15:00",
    }


def make_position(
    pos_id: str = "pos1",
    symbol: str = "RELIANCE",
    side: str = "LONG",
    avg_price: float = 2950.0,
    qty: int = 10,
    sl_price: float | None = 2891.0,
    tp_price: float | None = 3097.5,
) -> dict:
    """Return a minimal valid position dict."""
    return {
        "id":         pos_id,
        "monitor_id": "mon1",
        "symbol":     symbol,
        "side":       side,
        "qty":        qty,
        "avg_price":  avg_price,
        "ltp":        avg_price,
        "pnl":        0.0,
        "pnl_pct":    0.0,
        "sl_price":   sl_price,
        "tp_price":   tp_price,
        "entry_time": "2025-01-01T09:15:00",
    }
