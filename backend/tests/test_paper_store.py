"""tests/test_paper_store.py — CRUD + persistence tests for paper_store."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import pytest

# Point the store at a temp DB for tests
_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()

# Patch DB path BEFORE importing paper_store
import importlib
os.environ["PAPER_DB_PATH"] = _tmp_db.name

# Ensure backend/ is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import services.paper_store as ps
# Override the internal path so tests use the temp DB
ps._DB_PATH = type("P", (), {"__str__": lambda self: _tmp_db.name, "__truediv__": lambda self, o: self})()
import services.paper_store as ps


def setup_function():
    """Create fresh tables before each test."""
    ps.init_db()


# ---------------------------------------------------------------------------
# Monitors
# ---------------------------------------------------------------------------

def _make_monitor(monitor_id: str = "mon1") -> dict:
    return {
        "id":          monitor_id,
        "symbol":      "RELIANCE",
        "strategy_id": "1",
        "config":      {"period": 14, "lower": 30, "upper": 70},
        "timeframe":   "15min",
        "capital_pct": 10.0,
        "sl_pct":      2.0,
        "tp_pct":      5.0,
        "status":      "WATCHING",
        "created_at":  "2025-01-01T09:15:00",
    }


def test_save_and_get_monitor():
    monitor = _make_monitor()
    ps.save_monitor(monitor)
    monitors = ps.get_monitors()
    assert any(m["id"] == "mon1" for m in monitors)


def test_monitor_config_round_trips_as_dict():
    monitor = _make_monitor()
    ps.save_monitor(monitor)
    retrieved = next(m for m in ps.get_monitors() if m["id"] == "mon1")
    assert isinstance(retrieved["config"], dict)
    assert retrieved["config"]["period"] == 14


def test_delete_monitor():
    ps.save_monitor(_make_monitor("to_delete"))
    deleted = ps.delete_monitor("to_delete")
    assert deleted is True
    assert not any(m["id"] == "to_delete" for m in ps.get_monitors())


def test_delete_nonexistent_monitor_returns_false():
    assert ps.delete_monitor("does_not_exist") is False


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------

def _make_position(pos_id: str = "pos1") -> dict:
    return {
        "id":          pos_id,
        "monitor_id":  "mon1",
        "symbol":      "RELIANCE",
        "side":        "LONG",
        "qty":         10,
        "avg_price":   2950.0,
        "ltp":         2950.0,
        "pnl":         0.0,
        "pnl_pct":     0.0,
        "sl_price":    2891.0,
        "tp_price":    3097.5,
        "entry_time":  "2025-01-01T09:15:00",
    }


def test_save_and_get_position():
    ps.save_position(_make_position())
    positions = ps.get_positions()
    assert any(p["id"] == "pos1" for p in positions)


def test_update_position_ltp():
    ps.save_position(_make_position("upd_pos"))
    ps.update_position_ltp("upd_pos", 3000.0, 500.0, 1.69)
    positions = ps.get_positions()
    pos = next(p for p in positions if p["id"] == "upd_pos")
    assert pos["ltp"] == 3000.0
    assert pos["pnl"] == 500.0


def test_get_position_by_symbol():
    ps.save_position(_make_position("sym_pos"))
    pos = ps.get_position_by_symbol("RELIANCE")
    assert pos is not None
    assert pos["symbol"] == "RELIANCE"


def test_get_position_by_symbol_returns_none_when_missing():
    assert ps.get_position_by_symbol("NOTEXIST") is None


# ---------------------------------------------------------------------------
# Close position → trade history
# ---------------------------------------------------------------------------

def test_close_position_moves_to_history():
    ps.save_position(_make_position("close_me"))
    closed = ps.close_position("close_me", exit_price=3050.0, exit_reason="SIGNAL")
    assert closed is not None
    # Position no longer in open positions
    assert not any(p["id"] == "close_me" for p in ps.get_positions())
    # Appears in trade history
    history = ps.get_trade_history()
    assert any(h["symbol"] == "RELIANCE" and h["exit_reason"] == "SIGNAL" for h in history)


def test_close_position_calculates_pnl_correctly():
    """LONG 10 units @ 2950, exit @ 3050 → P&L = +1000"""
    ps.save_position(_make_position("pnl_pos"))
    closed = ps.close_position("pnl_pos", exit_price=3050.0)
    assert closed["pnl"] == pytest.approx(1000.0, abs=0.01)


def test_close_nonexistent_position_returns_none():
    assert ps.close_position("ghost", exit_price=100.0) is None


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def test_settings_round_trip():
    ps.set_setting("capital_pct", "15.0")
    assert ps.get_setting("capital_pct") == "15.0"


def test_settings_default_value():
    assert ps.get_setting("nonexistent_key", "42") == "42"


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def teardown_module():
    try:
        os.unlink(_tmp_db.name)
    except Exception:
        pass
