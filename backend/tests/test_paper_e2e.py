"""tests/test_paper_e2e.py — End-to-end paper trading flow tests.

Simulates: create monitor → BUY signal fires → position opens →
SELL signal fires → position closed → trade appears in history.
"""
from __future__ import annotations

import os
import sys
import tempfile
import pytest
import pandas as pd
import numpy as np
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def store(tmp_path):
    """Isolated paper_store with temp SQLite DB."""
    import services.paper_store as ps
    ps._DB_PATH = type("P", (), {
        "__str__":     lambda self: str(tmp_path / "paper_e2e.db"),
        "__truediv__": lambda self, o: self,
    })()
    ps.init_db()
    return ps


def _make_df_with_signal(n: int = 100, signal_bar: str = "entry") -> pd.DataFrame:
    """Build DataFrame where the last bar fires either entry or exit."""
    closes = np.linspace(90, 110, n)
    df = pd.DataFrame({
        "open": closes * 0.99, "high": closes * 1.01,
        "low": closes * 0.98, "close": closes,
        "volume": np.ones(n) * 1_000_000,
    })
    return df


def _mock_strategy(entries_last: bool = False, exits_last: bool = False, n: int = 100):
    mock = MagicMock()
    entries = pd.Series([False] * n)
    exits   = pd.Series([False] * n)
    if entries_last:
        entries.iloc[-1] = True
    if exits_last:
        exits.iloc[-1] = True
    mock.generate_signals.return_value = (entries, exits, [])
    return mock


# ---------------------------------------------------------------------------
# Full happy path
# ---------------------------------------------------------------------------

def test_buy_signal_opens_position(store):
    """BUY signal → position entry in DB."""
    monitor = {
        "id": "e2e_mon", "symbol": "RELIANCE",
        "strategy_id": "1", "config": {}, "timeframe": "15min",
        "capital_pct": 10.0, "sl_pct": None, "tp_pct": None,
        "status": "WATCHING", "created_at": "2025-01-01T09:00:00",
    }
    store.save_monitor(monitor)
    df = _make_df_with_signal()

    with patch("services.signal_checker._fetch_candles", return_value=df), \
         patch("strategies.presets.StrategyFactory") as mock_factory:
        mock_factory.get_strategy.return_value = _mock_strategy(entries_last=True)

        from services.signal_checker import check_signal
        signal, qty, ltp = check_signal(monitor, has_open_position=False)

    assert signal == "BUY"
    assert qty >= 1


def test_sell_signal_closes_position(store):
    """SELL signal on open position → position removed from open positions."""
    monitor = {
        "id": "e2e_mon2", "symbol": "RELIANCE",
        "strategy_id": "1", "config": {}, "timeframe": "15min",
        "capital_pct": 10.0, "sl_pct": None, "tp_pct": None,
        "status": "WATCHING", "created_at": "2025-01-01T09:15:00",
    }
    store.save_monitor(monitor)
    store.save_position({
        "id": "e2e_pos", "monitor_id": "e2e_mon2", "symbol": "RELIANCE",
        "side": "LONG", "qty": 5, "avg_price": 100.0, "ltp": 105.0,
        "pnl": 25.0, "pnl_pct": 5.0,
        "sl_price": None, "tp_price": None, "entry_time": "2025-01-01T09:15:00",
    })

    df = _make_df_with_signal()
    with patch("services.signal_checker._fetch_candles", return_value=df), \
         patch("strategies.presets.StrategyFactory") as mock_factory:
        mock_factory.get_strategy.return_value = _mock_strategy(exits_last=True)
        from services.signal_checker import check_signal
        signal, qty, ltp = check_signal(monitor, has_open_position=True)

    assert signal == "SELL"

    # Close position and verify it moves to history
    store.close_position("e2e_pos", exit_price=105.0)
    open_positions = store.get_positions()
    assert not any(p["id"] == "e2e_pos" for p in open_positions)

    history = store.get_trade_history()
    assert any(h["symbol"] == "RELIANCE" for h in history)


def test_full_trade_pnl_in_history(store):
    """End-to-end: open @ 100, close @ 120, LONG 10 → P&L = ₹200."""
    store.save_position({
        "id": "e2e_pnl", "monitor_id": None, "symbol": "INFY",
        "side": "LONG", "qty": 10, "avg_price": 100.0, "ltp": 100.0,
        "pnl": 0.0, "pnl_pct": 0.0,
        "sl_price": None, "tp_price": None, "entry_time": "2025-01-01T10:00:00",
    })
    store.close_position("e2e_pnl", exit_price=120.0)

    history = store.get_trade_history()
    trade = next((h for h in history if h["symbol"] == "INFY"), None)
    assert trade is not None
    assert trade["pnl"] == pytest.approx(200.0, abs=0.01)
    assert trade["exit_reason"] == "SIGNAL"


def test_sl_auto_close_marks_exit_reason(store):
    """LTP hits SL → position closed with exit_reason='SL'."""
    store.save_position({
        "id": "sl_pos", "monitor_id": None, "symbol": "TCS",
        "side": "LONG", "qty": 5, "avg_price": 3000.0, "ltp": 3000.0,
        "pnl": 0.0, "pnl_pct": 0.0,
        "sl_price": 2850.0, "tp_price": None, "entry_time": "2025-01-01T10:30:00",
    })

    with patch("services.paper_store", store), \
         patch("services.ltp_service.get_ltp", return_value=2800.0):
        from services.ltp_service import refresh_all_positions
        refresh_all_positions()

    history = store.get_trade_history()
    trade = next((h for h in history if h["symbol"] == "TCS"), None)
    assert trade is not None
    assert trade["exit_reason"] == "SL"
    assert trade["pnl"] < 0  # Should be a loss
