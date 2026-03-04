"""tests/test_signal_checker.py — Unit tests for signal_checker.py."""
from __future__ import annotations

import sys
import os
import pandas as pd
import numpy as np
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_df(n: int = 100, last_close: float = 100.0) -> pd.DataFrame:
    """Build a minimal OHLCV DataFrame for testing."""
    closes = np.linspace(90, 110, n)
    closes[-1] = last_close
    return pd.DataFrame({
        "open":   closes * 0.99,
        "high":   closes * 1.01,
        "low":    closes * 0.98,
        "close":  closes,
        "volume": np.ones(n) * 1_000_000,
    })


def _make_monitor(strategy_id: str = "1") -> dict:
    return {
        "id":          "mon_test",
        "symbol":      "RELIANCE",
        "strategy_id": strategy_id,
        "config":      {"period": 14, "lower": 30, "upper": 70},
        "timeframe":   "15min",
        "capital_pct": 10.0,
    }


# ---------------------------------------------------------------------------
# check_signal_on_df (no network — replay mode)
# ---------------------------------------------------------------------------

from services.signal_checker import check_signal_on_df, _compute_qty


def test_buy_signal_on_last_bar():
    """When strategy fires entry on last bar, expect BUY."""
    monitor = _make_monitor()
    df = _make_df()
    mock_entries = pd.Series([False] * len(df))
    mock_entries.iloc[-1] = True
    mock_exits = pd.Series([False] * len(df))
    mock_warnings = []

    mock_strategy = MagicMock()
    mock_strategy.generate_signals.return_value = (mock_entries, mock_exits, mock_warnings)

    with patch("strategies.presets.StrategyFactory") as mock_factory:
        mock_factory.get_strategy.return_value = mock_strategy
        signal, ltp = check_signal_on_df(df, monitor["strategy_id"], monitor["config"])

    assert signal == "BUY"
    assert ltp == pytest.approx(df["close"].iloc[-1])


def test_sell_signal_on_last_bar():
    """When strategy fires exit on last bar, expect SELL."""
    monitor = _make_monitor()
    df = _make_df()
    mock_entries = pd.Series([False] * len(df))
    mock_exits   = pd.Series([False] * len(df))
    mock_exits.iloc[-1] = True

    mock_strategy = MagicMock()
    mock_strategy.generate_signals.return_value = (mock_entries, mock_exits, [])

    with patch("strategies.presets.StrategyFactory") as mock_factory:
        mock_factory.get_strategy.return_value = mock_strategy
        signal, ltp = check_signal_on_df(df, monitor["strategy_id"], monitor["config"])

    assert signal == "SELL"


def test_no_signal_returns_hold():
    """When no entry or exit on last bar, expect HOLD."""
    monitor = _make_monitor()
    df = _make_df()
    mock_entries = pd.Series([False] * len(df))
    mock_exits   = pd.Series([False] * len(df))

    mock_strategy = MagicMock()
    mock_strategy.generate_signals.return_value = (mock_entries, mock_exits, [])

    with patch("strategies.presets.StrategyFactory") as mock_factory:
        mock_factory.get_strategy.return_value = mock_strategy
        signal, ltp = check_signal_on_df(df, monitor["strategy_id"], monitor["config"])

    assert signal == "HOLD"


def test_pyramiding_blocked_when_position_open():
    """BUY signal + has_open_position=True → must return HOLD (pyramiding=1)."""
    monitor = _make_monitor()
    df = _make_df()
    mock_entries = pd.Series([False] * len(df))
    mock_entries.iloc[-1] = True
    mock_exits = pd.Series([False] * len(df))

    mock_strategy = MagicMock()
    mock_strategy.generate_signals.return_value = (mock_entries, mock_exits, [])

    with patch("services.signal_checker._fetch_candles", return_value=df), \
         patch("strategies.presets.StrategyFactory") as mock_factory:
        mock_factory.get_strategy.return_value = mock_strategy
        from services.signal_checker import check_signal
        signal, qty, ltp = check_signal(monitor, has_open_position=True)

    assert signal == "HOLD"
    assert qty == 0


# ---------------------------------------------------------------------------
# _compute_qty
# ---------------------------------------------------------------------------

def test_compute_qty_basic():
    """10% of ₹1,00,000 at ₹2000/share = 5 shares."""
    assert _compute_qty(100_000, 10.0, 2000.0) == 5


def test_compute_qty_minimum_one():
    """When LTP is very high, qty should never be 0."""
    assert _compute_qty(1000, 10.0, 999_999.0) == 1


def test_compute_qty_zero_ltp_returns_one():
    """Guard against division by zero."""
    assert _compute_qty(100_000, 10.0, 0.0) == 1
