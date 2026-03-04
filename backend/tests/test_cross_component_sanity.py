"""Cross-component consistency tests.

Verifies that BacktestEngine and the preview endpoint both call
DynamicStrategy.generate_signals() on the same data and produce
identical entry / exit signals.

Design constraints:
  - Exactly N_BARS=100 bars of synthetic data so df.tail(100) inside
    the preview route equals the full dataset — no truncation divergence.
  - CODE mode: deterministic signals at known iloc positions so we have
    exact ground truth without relying on indicator library internals.
  - VISUAL mode: one additional test using RSI crossover to verify the
    full VISUAL path also stays consistent.

What we prove:
  test 1 — preview entry_dates  == DynamicStrategy.generate_signals() dates
  test 2 — preview exit_dates   == DynamicStrategy.generate_signals() dates
  test 3 — BacktestEngine trade entryDates ⊆ preview entry_dates
  test 4 — BacktestEngine totalTrades  ≤  preview entry_count   (VBT may
            skip overlapping entries; it cannot invent new ones)
  test 5 — VISUAL mode: preview entry_count == direct signal count
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from strategies import StrategyFactory
from services.backtest_engine import BacktestEngine

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Must equal the tail window used in strategy_routes.py preview endpoint
N_BARS = 100

# CODE strategy: two entries and two exits at fixed iloc positions.
# With non-overlapping trades this also lets us verify the backtest
# trade entryDates subset check.
_CODE = """\
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits   = pd.Series(False, index=df.index)
    entries.iloc[5]  = True
    entries.iloc[50] = True
    exits.iloc[25]   = True
    exits.iloc[70]   = True
    return entries, exits
"""

_BACKTEST_CFG = {
    "mode":              "CODE",
    "pythonCode":        _CODE,
    "initial_capital":   100_000,
    "commission":        0,
    "slippage":          0,
    "positionSizing":    "Fixed Capital",
    "positionSizeValue": 100_000,
}

_PREVIEW_PAYLOAD = {
    "symbol":     "TEST",
    "timeframe":  "1d",
    "mode":       "CODE",
    "pythonCode": _CODE,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_df(n: int = N_BARS) -> pd.DataFrame:
    """Exactly N_BARS calendar-day bars — matches preview tail window exactly."""
    dates = pd.date_range("2023-01-01", periods=n, freq="D")
    close = np.linspace(100, 130, n)
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


def _make_oscillating(n: int = N_BARS, cycles: int = 3) -> pd.DataFrame:
    """Sinusoidal prices that cause RSI to cross 30 and 70 multiple times."""
    t     = np.linspace(0, cycles * 2 * np.pi, n)
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


def _direct_signals(df: pd.DataFrame, config: dict) -> tuple[pd.Series, pd.Series]:
    """Run DynamicStrategy.generate_signals() on df — mirrors what both
    the preview route and BacktestEngine do internally.

    Applies the same preprocessing that both callers apply:
      - lowercase column names
    """
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    strategy = StrategyFactory.get_strategy("custom", config)
    entries, exits, _ = strategy.generate_signals(df)
    return entries.astype(bool), exits.astype(bool)


def _dates_from_mask(df: pd.DataFrame, mask: pd.Series) -> list[str]:
    """Convert a boolean mask over df.index to a list of 'YYYY-MM-DD' strings."""
    return [
        str(d.date()) if hasattr(d, "date") else str(d)
        for d in df.index[mask]
    ]


def _mock_fetcher(df: pd.DataFrame):
    """Patch DataFetcher in strategy_routes so no real API call is made."""
    return patch(
        "routes.strategy_routes.DataFetcher",
        return_value=MagicMock(
            fetch_historical_data=MagicMock(return_value=df)
        ),
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def flask_client():
    """Flask test client shared across all tests in this module."""
    from app import app as flask_app  # noqa: PLC0415
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as client:
        yield client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCrossComponentConsistency:
    """Same data in → same signals out, regardless of call path."""

    # ---- CODE mode --------------------------------------------------------

    def test_preview_entry_dates_match_direct_signal_dates(self, flask_client):
        """Preview entry_dates must equal DynamicStrategy signal dates (CODE mode)."""
        df = _make_df()

        # Ground truth: call generate_signals() directly
        entries, _ = _direct_signals(df, _BACKTEST_CFG)
        expected = _dates_from_mask(df, entries)

        # Preview endpoint
        with _mock_fetcher(df):
            resp = flask_client.post(
                "/api/v1/strategies/preview", json=_PREVIEW_PAYLOAD
            )
        assert resp.status_code == 200, f"Preview HTTP {resp.status_code}"
        preview_dates = resp.get_json()["entry_dates"]

        assert preview_dates == expected, (
            f"Preview entry_dates  : {preview_dates}\n"
            f"Direct signal dates  : {expected}"
        )

    def test_preview_exit_dates_match_direct_signal_dates(self, flask_client):
        """Preview exit_dates must equal DynamicStrategy signal dates (CODE mode)."""
        df = _make_df()

        _, exits = _direct_signals(df, _BACKTEST_CFG)
        expected = _dates_from_mask(df, exits)

        with _mock_fetcher(df):
            resp = flask_client.post(
                "/api/v1/strategies/preview", json=_PREVIEW_PAYLOAD
            )
        preview_dates = resp.get_json()["exit_dates"]

        assert preview_dates == expected, (
            f"Preview exit_dates  : {preview_dates}\n"
            f"Direct signal dates : {expected}"
        )

    def test_preview_entry_count_matches_direct_signal_count(self, flask_client):
        """preview entry_count must equal entries.sum() from direct call (CODE mode)."""
        df = _make_df()

        entries, exits = _direct_signals(df, _BACKTEST_CFG)
        direct_entry_count = int(entries.sum())
        direct_exit_count  = int(exits.sum())

        with _mock_fetcher(df):
            resp = flask_client.post(
                "/api/v1/strategies/preview", json=_PREVIEW_PAYLOAD
            )
        data = resp.get_json()

        assert data["entry_count"] == direct_entry_count, (
            f"Preview entry_count={data['entry_count']} "
            f"!= direct={direct_entry_count}"
        )
        assert data["exit_count"] == direct_exit_count, (
            f"Preview exit_count={data['exit_count']} "
            f"!= direct={direct_exit_count}"
        )

    def test_backtest_entry_dates_are_subset_of_preview_dates(self, flask_client):
        """Every BacktestEngine trade entryDate must appear in preview entry_dates.

        BacktestEngine feeds signals into VBT Portfolio which may skip some
        entries (e.g., already in a position) but can never invent new ones.
        So the set of executed trade entry dates must be a subset of the raw
        signal dates that preview shows.
        """
        df = _make_df()

        # Run full backtest
        result = BacktestEngine.run(df, "custom", _BACKTEST_CFG)
        assert result is not None
        assert result.get("status") != "failed", (
            f"BacktestEngine failed: {result.get('error')}"
        )
        # Truncate datetime strings to YYYY-MM-DD for comparison
        backtest_entry_dates = [
            t["entryDate"][:10] for t in result.get("trades", [])
        ]

        # Preview signal dates
        with _mock_fetcher(df):
            resp = flask_client.post(
                "/api/v1/strategies/preview", json=_PREVIEW_PAYLOAD
            )
        preview_entry_dates = set(resp.get_json()["entry_dates"])

        for d in backtest_entry_dates:
            assert d in preview_entry_dates, (
                f"BacktestEngine trade entryDate={d!r} not found in "
                f"preview entry_dates={sorted(preview_entry_dates)}"
            )

    def test_backtest_trade_count_not_greater_than_preview_entry_count(
        self, flask_client
    ):
        """BacktestEngine totalTrades must be ≤ preview entry_count.

        VBT may skip signals (e.g., pyramiding=1 and already long) but
        cannot generate trades with no corresponding entry signal.
        """
        df = _make_df()

        result = BacktestEngine.run(df, "custom", _BACKTEST_CFG)
        assert result and result.get("status") != "failed"
        n_trades = result["metrics"].get("totalTrades", 0)

        with _mock_fetcher(df):
            resp = flask_client.post(
                "/api/v1/strategies/preview", json=_PREVIEW_PAYLOAD
            )
        preview_entry_count = resp.get_json()["entry_count"]

        assert n_trades <= preview_entry_count, (
            f"BacktestEngine produced {n_trades} trades but preview only "
            f"shows {preview_entry_count} entry signals — trades cannot "
            f"exceed signal count"
        )

    # ---- VISUAL mode ------------------------------------------------------

    def test_visual_mode_preview_matches_direct_signal_count(self, flask_client):
        """VISUAL mode: preview entry_count must equal DynamicStrategy entry count.

        Uses RSI crossover on oscillating data so both paths exercise the
        full indicator-evaluation pipeline (not just the CODE exec sandbox).
        """
        df = _make_oscillating()   # exactly 100 bars → tail(100) = full df

        entry_group = {
            "type": "GROUP", "logic": "AND",
            "conditions": [
                {"type": "RULE", "indicator": "RSI", "period": 14,
                 "operator": "Crosses Above", "compareType": "STATIC", "value": 30.0},
            ],
        }
        exit_group = {
            "type": "GROUP", "logic": "AND",
            "conditions": [
                {"type": "RULE", "indicator": "RSI", "period": 14,
                 "operator": "Crosses Above", "compareType": "STATIC", "value": 70.0},
            ],
        }

        visual_config = {"mode": "VISUAL", "entryLogic": entry_group, "exitLogic": exit_group}
        preview_payload = {
            "symbol": "TEST", "timeframe": "1d",
            **visual_config,
        }

        # Direct signal generation
        entries, _ = _direct_signals(df, visual_config)
        direct_count = int(entries.sum())

        # Preview
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview", json=preview_payload)
        assert resp.status_code == 200, f"Preview HTTP {resp.status_code}"
        preview_count = resp.get_json()["entry_count"]

        assert preview_count == direct_count, (
            f"VISUAL mode preview entry_count={preview_count} "
            f"!= direct signal count={direct_count}"
        )
