"""tests/integration/test_strategy_api.py — Strategy HTTP endpoint integration tests.

Consolidates:
  - test_strategy_sanity.py::TestPreviewEndpoint   (preview HTTP)
  - test_cross_component_sanity.py                 (preview ↔ backtest ↔ signals consistency)

Requires: Flask test client + real signal/backtest path (DataFetcher mocked).
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

_TESTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _TESTS not in sys.path:
    sys.path.insert(0, _TESTS)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from testlib import make_oscillating
from strategies import StrategyFactory
from services.backtest_engine import BacktestEngine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

N_BARS = 100   # preview route uses tail(100)


def _make_df(n: int = N_BARS) -> pd.DataFrame:
    dates = pd.date_range("2023-01-01", periods=n, freq="D")
    close = np.linspace(100, 130, n)
    return pd.DataFrame(
        {"open": close*0.999, "high": close*1.005,
         "low": close*0.995, "close": close,
         "volume": np.ones(n)*1_000_000},
        index=dates,
    )


def _rule(indicator, period, operator, value, compare_type="STATIC") -> dict:
    return {"type": "RULE", "indicator": indicator, "period": period,
            "operator": operator, "compareType": compare_type, "value": value}


def _group(logic: str, *conditions) -> dict:
    return {"type": "GROUP", "logic": logic, "conditions": list(conditions)}


def _mock_fetcher(df: pd.DataFrame):
    """Patch DataFetcher in strategy_routes — no real API call."""
    return patch(
        "routes.strategy_routes.DataFetcher",
        return_value=MagicMock(fetch_historical_data=MagicMock(return_value=df)),
    )


_RSI_ENTRY = _group("AND", _rule("RSI", 14, "Crosses Above", 30.0))
_RSI_EXIT  = _group("AND", _rule("RSI", 14, "Crosses Above", 70.0))

_CODE = """
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits   = pd.Series(False, index=df.index)
    entries.iloc[5]  = True
    entries.iloc[50] = True
    exits.iloc[25]   = True
    exits.iloc[70]   = True
    return entries, exits
"""

_CODE_BACKTEST_CFG = {
    "mode": "CODE", "pythonCode": _CODE,
    "initial_capital": 100_000, "commission": 0, "slippage": 0,
    "positionSizing": "Fixed Capital", "positionSizeValue": 100_000,
}
_CODE_PREVIEW_PAYLOAD = {"symbol": "TEST", "timeframe": "1d", "mode": "CODE", "pythonCode": _CODE}


def _preview_payload(entry_group=None, exit_group=None, **extra) -> dict:
    payload: dict = {
        "symbol":    "TEST",
        "timeframe": "1d",
        "mode":      "VISUAL",
        "entryLogic": entry_group or _RSI_ENTRY,
        "exitLogic":  exit_group  or _RSI_EXIT,
    }
    payload.update(extra)
    return payload


def _direct_signals(df: pd.DataFrame, config: dict):
    """Run DynamicStrategy.generate_signals() directly — ground truth for tests."""
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    strategy = StrategyFactory.get_strategy("custom", config)
    entries, exits, _ = strategy.generate_signals(df)
    return entries.astype(bool), exits.astype(bool)


# ===========================================================================
# Preview endpoint
# ===========================================================================

class TestPreviewEndpoint:

    def test_required_keys_present(self, flask_client):
        df = make_oscillating(n=100, cycles=3)
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview",
                                     json=_preview_payload())
        assert resp.status_code == 200
        data = resp.get_json()
        for key in ("status", "entry_count", "exit_count",
                    "entry_dates", "exit_dates", "warnings"):
            assert key in data, f"Missing: {key}"

    def test_entry_count_matches_dates_length(self, flask_client):
        df = make_oscillating(n=100, cycles=3)
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview",
                                     json=_preview_payload())
        data = resp.get_json()
        assert data["entry_count"] == len(data["entry_dates"])
        assert data["exit_count"]  == len(data["exit_dates"])

    def test_empty_exit_flags_warning(self, flask_client):
        df = make_oscillating(n=100, cycles=3)
        payload = _preview_payload(exit_group=_group("AND"))  # no conditions
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview", json=payload)
        data = resp.get_json()
        assert data.get("empty_exit") is True or \
               any("exit" in w.lower() for w in data.get("warnings", []))

    def test_sl_tp_flags_warning(self, flask_client):
        df = make_oscillating(n=100, cycles=3)
        payload = _preview_payload(stopLossPct=2.0, takeProfitPct=6.0)
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview", json=payload)
        data = resp.get_json()
        assert data.get("sl_tp_ignored") is True or \
               any("sl" in w.lower() or "stop" in w.lower() or "tp" in w.lower()
                   for w in data.get("warnings", []))

    def test_broken_code_mode_returns_json_not_html(self, flask_client):
        df = make_oscillating(n=50, cycles=2)
        payload = {
            "symbol": "TEST", "timeframe": "1d",
            "mode": "CODE",
            "pythonCode": "def signal_logic(df): return this_will_fail(df)",
        }
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview", json=payload)
        assert resp.content_type.startswith("application/json")
        assert resp.get_json() is not None


# ===========================================================================
# Cross-component consistency: preview ↔ direct signals ↔ backtest
# ===========================================================================

class TestCrossComponentConsistency:
    """Same data in → same signals out, regardless of call path."""

    def test_code_mode_entry_dates_match(self, flask_client):
        df = _make_df()
        entries, _ = _direct_signals(df, _CODE_BACKTEST_CFG)
        expected = [str(d.date()) if hasattr(d, "date") else str(d)
                    for d in df.index[entries]]
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview",
                                     json=_CODE_PREVIEW_PAYLOAD)
        assert resp.status_code == 200
        assert resp.get_json()["entry_dates"] == expected

    def test_code_mode_exit_dates_match(self, flask_client):
        df = _make_df()
        _, exits = _direct_signals(df, _CODE_BACKTEST_CFG)
        expected = [str(d.date()) if hasattr(d, "date") else str(d)
                    for d in df.index[exits]]
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview",
                                     json=_CODE_PREVIEW_PAYLOAD)
        assert resp.get_json()["exit_dates"] == expected

    def test_backtest_entry_dates_subset_of_preview(self, flask_client):
        """VBT may skip entries (already in position) but cannot invent new ones."""
        df = _make_df()
        result = BacktestEngine.run(df, "custom", _CODE_BACKTEST_CFG)
        assert result and result.get("status") != "failed"
        backtest_dates = {t["entryDate"][:10] for t in result.get("trades", [])}
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview",
                                     json=_CODE_PREVIEW_PAYLOAD)
        preview_dates = set(resp.get_json()["entry_dates"])
        for d in backtest_dates:
            assert d in preview_dates, f"BacktestEngine trade date {d!r} not in preview"

    def test_backtest_trade_count_not_greater_than_preview_entries(self, flask_client):
        df = _make_df()
        result = BacktestEngine.run(df, "custom", _CODE_BACKTEST_CFG)
        assert result and result.get("status") != "failed"
        n_trades = result["metrics"].get("totalTrades", 0)
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview",
                                     json=_CODE_PREVIEW_PAYLOAD)
        preview_entry_count = resp.get_json()["entry_count"]
        assert n_trades <= preview_entry_count

    def test_visual_mode_preview_matches_direct_signals(self, flask_client):
        """VISUAL RSI mode: preview count must equal direct generate_signals count."""
        df = make_oscillating(n=100, cycles=3)
        visual_cfg  = {"mode": "VISUAL", "entryLogic": _RSI_ENTRY, "exitLogic": _RSI_EXIT}
        preview_payload = {"symbol": "TEST", "timeframe": "1d", **visual_cfg}
        entries, _ = _direct_signals(df, visual_cfg)
        direct_count = int(entries.sum())
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview", json=preview_payload)
        assert resp.status_code == 200
        assert resp.get_json()["entry_count"] == direct_count
