"""tests/test_ltp_service.py — Unit tests for ltp_service.py."""
from __future__ import annotations

import sys
import os
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.ltp_service import _calc_pnl, _is_sl_hit, _is_tp_hit


# ---------------------------------------------------------------------------
# PnL calculations
# ---------------------------------------------------------------------------

def test_long_pnl_positive():
    """LONG 10 @ 100, LTP 110 → P&L = +100 (+10%)."""
    pnl, pnl_pct = _calc_pnl("LONG", 100.0, 110.0, 10)
    assert pnl == pytest.approx(100.0)
    assert pnl_pct == pytest.approx(10.0)


def test_long_pnl_negative():
    """LONG 10 @ 100, LTP 90 → P&L = -100 (-10%)."""
    pnl, pnl_pct = _calc_pnl("LONG", 100.0, 90.0, 10)
    assert pnl == pytest.approx(-100.0)
    assert pnl_pct == pytest.approx(-10.0)


def test_short_pnl_positive():
    """SHORT 10 @ 100, LTP 90 → P&L = +100 (+10%)."""
    pnl, pnl_pct = _calc_pnl("SHORT", 100.0, 90.0, 10)
    assert pnl == pytest.approx(100.0)
    assert pnl_pct == pytest.approx(10.0)


def test_short_pnl_negative():
    """SHORT 10 @ 100, LTP 110 → P&L = -100 (-10%)."""
    pnl, pnl_pct = _calc_pnl("SHORT", 100.0, 110.0, 10)
    assert pnl == pytest.approx(-100.0)
    assert pnl_pct == pytest.approx(-10.0)


# ---------------------------------------------------------------------------
# Stop-loss checks
# ---------------------------------------------------------------------------

def test_long_sl_hit_when_ltp_below_sl():
    assert _is_sl_hit("LONG", ltp=95.0, sl_price=100.0) is True


def test_long_sl_not_hit_when_ltp_above_sl():
    assert _is_sl_hit("LONG", ltp=105.0, sl_price=100.0) is False


def test_short_sl_hit_when_ltp_above_sl():
    assert _is_sl_hit("SHORT", ltp=105.0, sl_price=100.0) is True


def test_short_sl_not_hit_when_ltp_below_sl():
    assert _is_sl_hit("SHORT", ltp=95.0, sl_price=100.0) is False


def test_sl_none_never_triggers():
    assert _is_sl_hit("LONG", ltp=1.0, sl_price=None) is False
    assert _is_sl_hit("SHORT", ltp=999.0, sl_price=None) is False


# ---------------------------------------------------------------------------
# Take-profit checks
# ---------------------------------------------------------------------------

def test_long_tp_hit_when_ltp_above_tp():
    assert _is_tp_hit("LONG", ltp=110.0, tp_price=105.0) is True


def test_long_tp_not_hit_when_ltp_below_tp():
    assert _is_tp_hit("LONG", ltp=100.0, tp_price=105.0) is False


def test_short_tp_hit_when_ltp_below_tp():
    assert _is_tp_hit("SHORT", ltp=95.0, tp_price=100.0) is True


def test_short_tp_not_hit_when_ltp_above_tp():
    assert _is_tp_hit("SHORT", ltp=105.0, tp_price=100.0) is False


def test_tp_none_never_triggers():
    assert _is_tp_hit("LONG", ltp=9999.0, tp_price=None) is False


# ---------------------------------------------------------------------------
# refresh_all_positions (integration — all mocked)
# ---------------------------------------------------------------------------

def test_refresh_closes_on_sl():
    """Position whose LTP hits SL should be auto-closed."""
    mock_positions = [{
        "id": "p_sl", "symbol": "RELIANCE", "side": "LONG",
        "qty": 10, "avg_price": 100.0, "ltp": 100.0,
        "pnl": 0.0, "pnl_pct": 0.0,
        "sl_price": 95.0, "tp_price": None,
    }]

    with patch("services.paper_store") as mock_store, \
         patch("services.ltp_service.get_ltp", return_value=90.0):
        mock_store.get_positions.return_value = mock_positions
        from services.ltp_service import refresh_all_positions
        refresh_all_positions()
        mock_store.close_position.assert_called_once_with("p_sl", 90.0, exit_reason="SL")


def test_refresh_closes_on_tp():
    """Position whose LTP hits TP should be auto-closed."""
    mock_positions = [{
        "id": "p_tp", "symbol": "RELIANCE", "side": "LONG",
        "qty": 10, "avg_price": 100.0, "ltp": 100.0,
        "pnl": 0.0, "pnl_pct": 0.0,
        "sl_price": None, "tp_price": 115.0,
    }]

    with patch("services.paper_store") as mock_store, \
         patch("services.ltp_service.get_ltp", return_value=120.0):
        mock_store.get_positions.return_value = mock_positions
        from services.ltp_service import refresh_all_positions
        refresh_all_positions()
        mock_store.close_position.assert_called_once_with("p_tp", 120.0, exit_reason="TP")
