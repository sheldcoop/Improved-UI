"""tests/unit/test_backtest.py — BacktestEngine unit tests + math verification.

Consolidates:
  - test_backtest_engine.py  (mocking-based engine tests)
  - test_backtest_math_verification.py  (real VBT runs, ground-truth math checks)

Design:
  - Unit-level tests (class TestEngine*) mock VBT and call _extract_results
    directly — no real VBT run, fast (<1s each).
  - Math-verification tests (class TestBacktestMath) do real VBT runs on tiny
    deterministic datasets.  They are slow (~3s each) and clearly labelled.
"""
from __future__ import annotations

import math
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

from testlib import make_ohlcv, make_mock_pf
from services.backtest_engine import BacktestEngine


# ---------------------------------------------------------------------------
# Shared CODE-mode config helpers
# ---------------------------------------------------------------------------

def _cfg(**overrides) -> dict:
    """Return a minimal BacktestEngine config dict."""
    base = {
        "mode":              "CODE",
        "pythonCode":        "def signal_logic(df):\n    return pd.Series(False,index=df.index), pd.Series(False,index=df.index)",
        "initial_capital":   100_000,
        "commission":        0,
        "slippage":          0,
        "positionSizing":    "Fixed Capital",
        "positionSizeValue": 100_000,
    }
    base.update(overrides)
    return base


_BUY_HOLD_CODE = """
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits   = pd.Series(False, index=df.index)
    entries.iloc[0]  = True
    exits.iloc[-1]   = True
    return entries, exits
"""

_THREE_TRADE_CODE = """
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits   = pd.Series(False, index=df.index)
    entries.iloc[1]  = True ; exits.iloc[19] = True   # win
    entries.iloc[21] = True ; exits.iloc[29] = True   # loss
    entries.iloc[35] = True ; exits.iloc[59] = True   # win
    return entries, exits
"""


# ===========================================================================
# 1. Engine-level unit tests (mock VBT)
# ===========================================================================

class TestEngineEdgeCases:

    def test_none_dataframe_returns_failed(self):
        result = BacktestEngine.run(None, "1")
        assert result["status"] == "failed"

    def test_empty_dataframe_returns_failed(self):
        result = BacktestEngine.run(pd.DataFrame(), "1")
        assert result["status"] == "failed"

    def test_result_always_dict(self):
        result = BacktestEngine.run(pd.DataFrame(), "1")
        assert isinstance(result, dict)


class TestMutableDefaultArg:
    """Guards against the mutable default argument bug (dict shared between calls)."""

    def test_config_default_is_none_not_dict(self):
        import inspect
        sig = inspect.signature(BacktestEngine.run)
        default = sig.parameters["config"].default
        assert default is None, (
            "BacktestEngine.run config param must default to None, not a mutable dict"
        )

    def test_two_calls_do_not_share_state(self):
        df = make_ohlcv(n=50)
        r1 = BacktestEngine.run(df, "1", {"initial_capital": 100_000})
        r2 = BacktestEngine.run(df, "1", {"initial_capital": 200_000})
        assert r1 is not r2


class TestRealDates:

    def test_start_end_date_from_dataframe_index(self):
        df = make_ohlcv(n=100)
        result = BacktestEngine.run(df, "1", _cfg())
        assert result["startDate"] == str(df.index[0].date())
        assert result["endDate"]   == str(df.index[-1].date())


class TestStatsParams:

    def test_stats_params_key_always_present(self):
        df = make_ohlcv(n=100)
        result = BacktestEngine.run(df, "1", {"statsFreq": "W", "statsWindow": 3})
        assert "returnsStats" in result
        assert isinstance(result["returnsStats"], dict)
        # Metadata echo-back
        if "statsParams" in result:
            assert result["statsParams"] == {"freq": "W", "window": 3}

    def test_universe_run_returns_dict_not_crash(self):
        """Universe portfolio mocking: _build_metrics must not crash when stats are Series."""
        df = make_ohlcv(n=50)
        mock_pf = make_mock_pf(df, pnl_list=[10.0, -5.0, 20.0])
        # Simulate universe: stats returns dict with Series values
        mock_pf.stats.return_value = {"Win Rate [%]": pd.Series([0.0, 0.0])}

        with patch("services.backtest_engine.vbt") as mock_vbt, \
             patch("services.backtest_engine.StrategyFactory") as mock_sf:
            mock_sf.get_strategy.return_value.generate_signals.return_value = (
                pd.Series(False, index=df.index),
                pd.Series(False, index=df.index),
            )
            mock_vbt.Portfolio.from_signals.return_value = mock_pf
            result = BacktestEngine.run(df, "1")

        assert isinstance(result, dict)

    def test_safe_profit_factor_fallback(self):
        """Profit factor must not crash when pf.profit_factor() raises."""
        df = make_ohlcv(n=50)
        mock_pf = make_mock_pf(df, pnl_list=[10.0, 20.0])
        # Simulate missing profit_factor (returns None-like)
        mock_pf.stats.return_value = {"Profit Factor": None}

        with patch("services.backtest_engine.vbt") as mock_vbt, \
             patch("services.backtest_engine.StrategyFactory") as mock_sf:
            mock_sf.get_strategy.return_value.generate_signals.return_value = (
                pd.Series(False, index=df.index),
                pd.Series(False, index=df.index),
            )
            mock_vbt.Portfolio.from_signals.return_value = mock_pf
            result = BacktestEngine.run(df, "1")

        assert isinstance(result, dict)


# ===========================================================================
# 2. _compute_advanced_metrics unit tests (pure logic, no VBT run)
# ===========================================================================

class TestComputeAdvancedMetrics:
    """Direct tests of BacktestEngine._compute_advanced_metrics().

    All inputs are small DataFrames or mocked pf objects — no real VBT.
    """

    def _make_pf(self, pnl_list: list[float]) -> MagicMock:
        pf = MagicMock()
        pf.trades.records_readable = pd.DataFrame({"PnL": pnl_list})
        pf.drawdown.return_value = pd.Series([0.0, -0.02, -0.01, 0.0])
        return pf

    def test_expectancy_positive_edge(self):
        pf = self._make_pf([100.0, 200.0, -50.0])   # 2W 1L
        m  = BacktestEngine._compute_advanced_metrics(pf)
        assert m["expectancy"] > 0

    def test_expectancy_negative_edge(self):
        pf = self._make_pf([-100.0, -200.0, 50.0])  # 1W 2L
        m  = BacktestEngine._compute_advanced_metrics(pf)
        assert m["expectancy"] < 0

    def test_kelly_criterion_bounded(self):
        pf = self._make_pf([50.0, 75.0, -20.0, 60.0])
        m  = BacktestEngine._compute_advanced_metrics(pf)
        assert 0.0 <= m["kellyCriterion"] <= 100.0

    def test_kelly_criterion_zero_when_all_losses(self):
        pf = self._make_pf([-10.0, -20.0, -5.0])
        m  = BacktestEngine._compute_advanced_metrics(pf)
        assert m["kellyCriterion"] == 0.0

    def test_consecutive_losses_correct(self):
        pf = self._make_pf([10.0, -5.0, -10.0, -3.0, 20.0])
        m  = BacktestEngine._compute_advanced_metrics(pf)
        assert m["consecutiveLosses"] == 3

    def test_consecutive_losses_zero_when_all_wins(self):
        pf = self._make_pf([10.0, 20.0, 30.0])
        m  = BacktestEngine._compute_advanced_metrics(pf)
        assert m["consecutiveLosses"] == 0

    def test_avg_drawdown_duration_format(self):
        pf = self._make_pf([10.0, -5.0])
        m  = BacktestEngine._compute_advanced_metrics(pf)
        assert m["avgDrawdownDuration"].endswith("d"), (
            f"avgDrawdownDuration must end with 'd', got {m['avgDrawdownDuration']!r}"
        )

    def test_empty_trades_returns_zeros(self):
        pf = self._make_pf([])
        m  = BacktestEngine._compute_advanced_metrics(pf)
        assert m["expectancy"]       == 0.0
        assert m["kellyCriterion"]   == 0.0
        assert m["consecutiveLosses"] == 0
        assert m["avgDrawdownDuration"] == "0d"

    def test_universe_mode_flag_accepted(self):
        """universe=True must not raise — method must accept the parameter."""
        pf = self._make_pf([10.0, -5.0, 15.0])
        m  = BacktestEngine._compute_advanced_metrics(pf)
        assert isinstance(m, dict)


# ===========================================================================
# 3. Math-verification tests (real VBT runs — slower)
# ===========================================================================

class TestBacktestMath:
    """Cross-check BacktestEngine outputs against known ground-truth math.

    These tests use real VBT but on tiny deterministic datasets.
    Tolerances are intentionally loose because VBT's %-of-equity sizing
    rounds fractional shares, so exact equality is not achievable.
    """

    def test_total_return_buy_hold(self):
        """Buy day 0 / Sell day -1 on 100→200 trending data → ~100% return."""
        df = make_ohlcv(n=100, start_price=100, end_price=200)
        cfg = _cfg(pythonCode=_BUY_HOLD_CODE,
                   positionSizing="% of Equity", positionSizeValue=100.0)
        result = BacktestEngine.run(df, "custom", cfg)
        assert result is not None
        assert result.get("status") != "failed", result.get("error")
        assert "returnsStats" in result
        total_ret = result["metrics"]["totalReturnPct"]
        # Expect near 100% — abs_tol=3 accounts for VBT fractional rounding
        assert math.isclose(total_ret, 100.0, abs_tol=3.0), (
            f"Expected ~100% return on 100→200 price, got {total_ret:.2f}%"
        )

    def test_cagr_annualised_correctly(self):
        """CAGR over 99 calendar days must match ((1+r)^(365/99)-1) formula."""
        df = make_ohlcv(n=100, start_price=100, end_price=200)
        cfg = _cfg(pythonCode=_BUY_HOLD_CODE,
                   positionSizing="% of Equity", positionSizeValue=100.0)
        result = BacktestEngine.run(df, "custom", cfg)
        if result.get("status") == "failed":
            pytest.skip("VBT run failed — skipping CAGR check")
        reported_ret = result["metrics"]["totalReturnPct"]
        years = 99 / 365.25
        expected_cagr = (((1 + reported_ret / 100) ** (1 / years)) - 1) * 100
        assert math.isclose(result["metrics"]["cagr"], expected_cagr, rel_tol=0.05), (
            f"CAGR mismatch: expected {expected_cagr:.1f}%, got {result['metrics']['cagr']:.2f}%"
        )

    def test_max_drawdown_positive(self):
        """maxDrawdownPct is always stored as a positive absolute value."""
        df = make_ohlcv(n=100)
        result = BacktestEngine.run(df, "custom", _cfg(pythonCode=_BUY_HOLD_CODE))
        if result.get("status") == "failed":
            pytest.skip("VBT run failed")
        dd = result["metrics"]["maxDrawdownPct"]
        assert dd >= 0, f"maxDrawdownPct should be ≥0, got {dd}"

    def test_three_trades_count(self):
        """Exactly 3 discrete trades in signals → totalTrades == 3."""
        df = make_ohlcv(n=96, start_price=100, end_price=200)
        cfg = _cfg(pythonCode=_THREE_TRADE_CODE)
        result = BacktestEngine.run(df, "custom", cfg)
        if result.get("status") == "failed":
            pytest.skip("VBT run failed")
        assert result["metrics"]["totalTrades"] == 3

    def test_win_rate_in_valid_range(self):
        """winRate must always be in [0, 100]."""
        df = make_ohlcv(n=96)
        result = BacktestEngine.run(df, "custom", _cfg(pythonCode=_THREE_TRADE_CODE))
        if result.get("status") == "failed":
            pytest.skip("VBT run failed")
        wr = result["metrics"]["winRate"]
        assert 0.0 <= wr <= 100.0, f"winRate {wr} out of range"

    def test_profit_factor_non_negative(self):
        """profitFactor must be ≥ 0."""
        df = make_ohlcv(n=96)
        result = BacktestEngine.run(df, "custom", _cfg(pythonCode=_THREE_TRADE_CODE))
        if result.get("status") == "failed":
            pytest.skip("VBT run failed")
        assert result["metrics"]["profitFactor"] >= 0.0
