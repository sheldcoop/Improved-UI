"""tests/integration/test_paper_api.py — Paper trading HTTP + E2E tests.

Consolidates:
  - test_paper_routes.py  (Flask HTTP endpoint tests — settings, monitors, positions)
  - test_paper_e2e.py     (end-to-end trade cycle tests)

Design: uses the paper_store and flask_client fixtures from conftest.py.
The Flask app is reloaded with init_scheduler mocked to prevent APScheduler
from starting during tests.
"""
from __future__ import annotations

import os
import sys
import tempfile
import pytest
import numpy as np
import pandas as pd
from unittest.mock import MagicMock, patch

_TESTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _TESTS not in sys.path:
    sys.path.insert(0, _TESTS)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from testlib import make_monitor, make_ohlcv, make_position


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _monitor_payload(symbol: str = "RELIANCE") -> dict:
    return {
        "symbol":     symbol,
        "strategyId": "1",
        "config":     {"period": 14},
        "timeframe":  "15min",
        "slPct":      2.0,
        "tpPct":      5.0,
    }


# ===========================================================================
# Settings endpoints
# ===========================================================================

class TestSettingsEndpoint:

    def test_get_returns_defaults(self, flask_client):
        res = flask_client.get("/api/v1/paper-trading/settings")
        assert res.status_code == 200
        data = res.get_json()
        assert "capitalPct" in data
        assert "virtualCapital" in data

    def test_update_valid_capital_pct(self, flask_client):
        res = flask_client.post("/api/v1/paper-trading/settings",
                                json={"capitalPct": 20.0},
                                content_type="application/json")
        assert res.status_code == 200
        assert res.get_json()["capitalPct"] == 20.0

    def test_update_invalid_pct_returns_400(self, flask_client):
        res = flask_client.post("/api/v1/paper-trading/settings",
                                json={"capitalPct": 150},
                                content_type="application/json")
        assert res.status_code == 400


# ===========================================================================
# Monitor endpoints
# ===========================================================================

class TestMonitorEndpoint:

    def test_create_monitor_success(self, flask_client):
        with patch("routes.paper_routes.start_monitor"):
            res = flask_client.post("/api/v1/paper-trading/monitors",
                                    json=_monitor_payload(),
                                    content_type="application/json")
        assert res.status_code == 201
        data = res.get_json()
        assert data["symbol"] == "RELIANCE"
        assert "id" in data

    def test_create_monitor_missing_symbol_returns_400(self, flask_client):
        payload = _monitor_payload()
        del payload["symbol"]
        with patch("routes.paper_routes.start_monitor"):
            res = flask_client.post("/api/v1/paper-trading/monitors",
                                    json=payload,
                                    content_type="application/json")
        assert res.status_code == 400

    def test_create_monitor_exceeds_limit_returns_409(self, flask_client):
        """Creating more than 3 monitors must return 409 Conflict."""
        with patch("routes.paper_routes.start_monitor"):
            for _ in range(3):
                flask_client.post("/api/v1/paper-trading/monitors",
                                  json=_monitor_payload(),
                                  content_type="application/json")
            res = flask_client.post("/api/v1/paper-trading/monitors",
                                    json=_monitor_payload(),
                                    content_type="application/json")
        assert res.status_code == 409

    def test_delete_nonexistent_monitor_returns_404(self, flask_client):
        with patch("routes.paper_routes.stop_monitor"):
            res = flask_client.delete("/api/v1/paper-trading/monitors/ghost_id")
        assert res.status_code == 404


# ===========================================================================
# Position endpoints
# ===========================================================================

class TestPositionEndpoint:

    def test_get_positions_empty(self, flask_client):
        res = flask_client.get("/api/v1/paper-trading/positions")
        assert res.status_code == 200
        assert isinstance(res.get_json(), list)

    def test_add_position_success(self, flask_client):
        res = flask_client.post("/api/v1/paper-trading/positions",
                                json={"symbol": "NIFTY 50", "side": "LONG",
                                      "qty": 50, "avgPrice": 22000.0},
                                content_type="application/json")
        assert res.status_code == 201
        assert res.get_json()["symbol"] == "NIFTY 50"

    def test_add_position_invalid_side_returns_400(self, flask_client):
        res = flask_client.post("/api/v1/paper-trading/positions",
                                json={"symbol": "NIFTY 50", "side": "SIDEWAYS",
                                      "qty": 50, "avgPrice": 22000.0},
                                content_type="application/json")
        assert res.status_code == 400

    def test_close_nonexistent_position_returns_404(self, flask_client):
        with patch("services.ltp_service.get_ltp", return_value=100.0):
            res = flask_client.delete("/api/v1/paper-trading/positions/ghost")
        assert res.status_code == 404

    def test_get_history_returns_list(self, flask_client):
        res = flask_client.get("/api/v1/paper-trading/history")
        assert res.status_code == 200
        assert isinstance(res.get_json(), list)


# ===========================================================================
# End-to-end trade flow tests
# ===========================================================================

class TestPaperTradingE2E:
    """Full paper trading lifecycle without HTTP layer — uses services directly."""

    def _mock_strategy(self, entries_last: bool = False,
                       exits_last: bool = False, n: int = 100) -> MagicMock:
        mock = MagicMock()
        entries = pd.Series([False] * n)
        exits   = pd.Series([False] * n)
        if entries_last: entries.iloc[-1] = True
        if exits_last:   exits.iloc[-1]   = True
        mock.generate_signals.return_value = (entries, exits, [])
        return mock

    def test_buy_signal_detected(self, paper_store):
        """BUY signal fires on last bar → check_signal returns 'BUY'."""
        monitor = make_monitor("e2e_buy")
        paper_store.save_monitor(monitor)
        df = make_ohlcv(n=100)

        with patch("services.signal_checker._fetch_candles", return_value=df), \
             patch("strategies.presets.StrategyFactory") as mock_sf:
            mock_sf.get_strategy.return_value = self._mock_strategy(entries_last=True)
            from services.signal_checker import check_signal
            signal, qty, ltp = check_signal(monitor, has_open_position=False)

        assert signal == "BUY"
        assert qty >= 1

    def test_sell_signal_detected(self, paper_store):
        """SELL signal fires on last bar → check_signal returns 'SELL'."""
        monitor = make_monitor("e2e_sell")
        paper_store.save_monitor(monitor)
        df = make_ohlcv(n=100)

        with patch("services.signal_checker._fetch_candles", return_value=df), \
             patch("strategies.presets.StrategyFactory") as mock_sf:
            mock_sf.get_strategy.return_value = self._mock_strategy(exits_last=True)
            from services.signal_checker import check_signal
            signal, _, _ = check_signal(monitor, has_open_position=True)

        assert signal == "SELL"

    def test_full_long_trade_pnl(self, paper_store):
        """Open LONG @ 100, close @ 120, 10 units → PnL = +200."""
        paper_store.save_position(make_position(
            "e2e_pnl", symbol="INFY", avg_price=100.0, qty=10
        ))
        closed = paper_store.close_position("e2e_pnl", exit_price=120.0)
        assert closed["pnl"] == pytest.approx(200.0, abs=0.01)
        history = paper_store.get_trade_history()
        assert any(h["symbol"] == "INFY" for h in history)

    def test_sl_auto_close_exit_reason(self, paper_store):
        """SL triggered: close_position records negative PnL and exit_reason='SL'."""
        paper_store.save_position(make_position(
            "e2e_sl", symbol="TCS", avg_price=3000.0, qty=5,
            sl_price=2850.0, tp_price=None,
        ))
        # Simulate what refresh_all_positions does when SL fires:
        closed = paper_store.close_position(
            "e2e_sl", exit_price=2800.0, exit_reason="SL"
        )
        assert closed is not None
        assert closed["exit_reason"] == "SL"
        assert closed["pnl"] < 0
        history = paper_store.get_trade_history()
        assert any(h.get("exit_reason") == "SL" for h in history)

    def test_tp_auto_close_exit_reason(self, paper_store):
        """TP triggered: close_position records positive PnL and exit_reason='TP'."""
        paper_store.save_position(make_position(
            "e2e_tp", symbol="HDFC", avg_price=1500.0, qty=10,
            sl_price=None, tp_price=1650.0,
        ))
        closed = paper_store.close_position(
            "e2e_tp", exit_price=1700.0, exit_reason="TP"
        )
        assert closed is not None
        assert closed["exit_reason"] == "TP"
        assert closed["pnl"] > 0
        history = paper_store.get_trade_history()
        assert any(h.get("exit_reason") == "TP" for h in history)

    def test_position_moves_to_history_after_close(self, paper_store):
        """Closed position disappears from open positions and appears in history."""
        paper_store.save_position(make_position("e2e_move"))
        paper_store.close_position("e2e_move", exit_price=3050.0, exit_reason="SIGNAL")
        assert not any(p["id"] == "e2e_move" for p in paper_store.get_positions())
        history = paper_store.get_trade_history()
        assert any(h["exit_reason"] == "SIGNAL" for h in history)
