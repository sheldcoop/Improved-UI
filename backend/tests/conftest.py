"""tests/conftest.py — Shared fixtures and helpers for the entire test suite.

All test files import from here instead of each defining their own copies.
Previously the same helpers (_make_ohlcv, flask_client, mock_pf, etc.)
were duplicated across 5+ files — this file eliminates that duplication.
"""
from __future__ import annotations

import os
import sys
import tempfile
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

# Ensure backend/ root is always on sys.path so imports work from any subdir
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
    """Generate deterministic synthetic OHLCV data.

    Uses calendar-day frequency by default (freq='D') so VBT detect_freq works.
    BusinessDay ('B') should be avoided in tests because VBT cannot compute
    returns.stats() on it.

    Args:
        n:           Number of bars.
        start_price: Opening price.
        end_price:   Closing price (linear trend).
        freq:        Pandas date frequency string.
        seed:        Random seed for reproducibility.

    Returns:
        OHLCV DataFrame with lowercase column names.
    """
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
    """Sinusoidal prices that cause RSI to cross 30 and 70 multiple times.

    Used by cross-component and preview endpoint tests so RSI-based
    VISUAL strategies generate at least one entry/exit signal.
    """
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
    """Build a MagicMock VBT Portfolio for unit tests.

    Avoids importing vectorbt, so runs without the VBT dependency.

    Args:
        df:            OHLCV DataFrame (used for index alignment).
        pnl_list:      List of per-trade PnL values.
        sharpe:        Sharpe ratio mock value.
        max_dd:        Max drawdown mock value (negative fraction).
        win_rate:      Win rate mock value (fraction 0-1).
        profit_factor: Profit factor mock value.
        total_trades:  Number of trades.
        total_return:  Total portfolio return (fraction).

    Returns:
        MagicMock that mimics a single-asset vbt.Portfolio.
    """
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
# Shared paper-store fixture
# ---------------------------------------------------------------------------

@pytest.fixture
def paper_store(tmp_path):
    """Isolated paper_store backed by a temp SQLite DB.

    Each test that uses this fixture gets a fresh empty database.
    The fixture patches paper_store._DB_PATH so nothing is written
    to the real data/paper_trading.db.
    """
    import services.paper_store as ps

    _db = str(tmp_path / "paper_trading.db")
    ps._DB_PATH = type(
        "_TmpPath",
        (),
        {
            "__str__":     lambda self, _db=_db: _db,
            "__truediv__": lambda self, o: self,
        },
    )()
    ps.init_db()
    yield ps
    # Cleanup handled by tmp_path fixture


# ---------------------------------------------------------------------------
# Shared Flask test client fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def flask_app():
    """Create the Flask app once per test session.

    Patches init_scheduler so APScheduler is never started during tests.
    Uses a session-scoped temp DB.
    """
    import services.paper_store as ps

    _tmp = tempfile.mkdtemp()
    _db = os.path.join(_tmp, "paper_trading.db")
    ps._DB_PATH = type(
        "_TmpPath",
        (),
        {
            "__str__":     lambda self, _db=_db: _db,
            "__truediv__": lambda self, o: self,
        },
    )()
    ps.init_db()

    with patch("services.paper_scheduler.init_scheduler", MagicMock()):
        import importlib
        import app as app_module
        importlib.reload(app_module)
        app_module.app.config["TESTING"] = True
        yield app_module.app


@pytest.fixture
def flask_client(flask_app):
    """Per-test Flask test client."""
    with flask_app.test_client() as client:
        yield client


# ---------------------------------------------------------------------------
# Common monitor / position helpers
# ---------------------------------------------------------------------------

def make_monitor(monitor_id: str = "mon1", symbol: str = "RELIANCE") -> dict:
    """Return a minimal valid monitor dict for paper_store tests."""
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
    """Return a minimal valid position dict for paper_store tests."""
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
