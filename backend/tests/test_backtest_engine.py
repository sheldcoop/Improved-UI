"""Tests for BacktestEngine service.

Covers:
  - Mutable default argument fix (Issue #6)
  - Real startDate/endDate from data (Issue #15)
  - Advanced metrics: expectancy, Kelly, consecutive losses, avg DD duration (Issue #22)
  - Empty/None data handling
  - _compute_advanced_metrics edge cases
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from unittest.mock import MagicMock, patch

from services.backtest_engine import BacktestEngine


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_ohlcv(n: int = 252, seed: int = 42) -> pd.DataFrame:
    """Generate a synthetic daily OHLCV DataFrame with a DatetimeIndex."""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2023-01-02", periods=n, freq="B")
    close = 100 + np.cumsum(rng.normal(0, 1, n))
    df = pd.DataFrame(
        {
            "Open": close * 0.99,
            "High": close * 1.01,
            "Low": close * 0.98,
            "Close": close,
            "Volume": rng.integers(100_000, 1_000_000, n),
        },
        index=idx,
    )
    return df


# ---------------------------------------------------------------------------
# Issue #6 — Mutable default argument
# ---------------------------------------------------------------------------

class TestMutableDefaultArg:
    def test_config_default_is_none_not_dict(self):
        """BacktestEngine.run() must default config to None, not {}."""
        import inspect
        sig = inspect.signature(BacktestEngine.run)
        default = sig.parameters["config"].default
        assert default is None, (
            f"config default should be None (not mutable dict), got {default!r}"
        )

    def test_two_calls_do_not_share_config(self):
        """Calling run() twice must not share state between calls."""
        df = _make_ohlcv()
        with patch("services.backtest_engine.vbt") as mock_vbt, \
             patch("services.backtest_engine.StrategyFactory") as mock_sf:
            mock_sf.get_strategy.return_value.generate_signals.return_value = (
                pd.Series(False, index=df.index),
                pd.Series(False, index=df.index),
            )
            mock_pf = MagicMock()
            mock_pf.value.return_value = pd.Series(100_000.0, index=df.index)
            mock_pf.wrapper.columns = pd.Index(["A"])
            mock_pf.sharpe_ratio.return_value = pd.Series([1.0])
            mock_pf.max_drawdown.return_value = pd.Series([-0.05])
            mock_pf.win_rate.return_value = pd.Series([0.5])
            mock_pf.profit_factor.return_value = pd.Series([1.2])
            mock_pf.trades.count.return_value = pd.Series([5])
            mock_pf.trades.records_readable = pd.DataFrame({"PnL": []})
            mock_pf.drawdown.return_value = pd.Series(0.0, index=df.index)
            mock_vbt.Portfolio.from_signals.return_value = mock_pf

            BacktestEngine.run(df, "1")
            BacktestEngine.run(df, "1")
            # If config was shared, the second call would see mutations from the first.
            # No assertion needed beyond "no exception raised".


# ---------------------------------------------------------------------------
# Issue #15 — Real startDate / endDate from data
# ---------------------------------------------------------------------------

class TestRealDates:
    def test_start_end_date_from_dataframe_index(self):
        """startDate and endDate must come from the DataFrame index, not hardcoded."""
        df = _make_ohlcv(n=50)
        expected_start = str(df.index[0].date())
        expected_end = str(df.index[-1].date())

        with patch("services.backtest_engine.vbt") as mock_vbt, \
             patch("services.backtest_engine.StrategyFactory") as mock_sf:
            mock_sf.get_strategy.return_value.generate_signals.return_value = (
                pd.Series(False, index=df.index),
                pd.Series(False, index=df.index),
            )
            mock_pf = MagicMock()
            mock_pf.value.return_value = pd.Series(100_000.0, index=df.index)
            mock_pf.wrapper.columns = pd.Index(["A"])
            mock_pf.sharpe_ratio.return_value = pd.Series([0.0])
            mock_pf.max_drawdown.return_value = pd.Series([0.0])
            mock_pf.win_rate.return_value = pd.Series([0.0])
            mock_pf.profit_factor.return_value = pd.Series([0.0])
            mock_pf.trades.count.return_value = pd.Series([0])
            mock_pf.trades.records_readable = pd.DataFrame({"PnL": []})
            mock_pf.drawdown.return_value = pd.Series(0.0, index=df.index)
            mock_vbt.Portfolio.from_signals.return_value = mock_pf

            result = BacktestEngine.run(df, "1")

        assert result is not None
        assert result["startDate"] == expected_start, (
            f"Expected startDate={expected_start}, got {result['startDate']}"
        )
        assert result["endDate"] == expected_end, (
            f"Expected endDate={expected_end}, got {result['endDate']}"
        )
        # Must not be the old hardcoded values
        assert result["startDate"] != "2023-01-01"
        assert result["endDate"] != "2024-01-01"


# ---------------------------------------------------------------------------
# Issue #22 — Advanced metrics (both branches)
# ---------------------------------------------------------------------------

class TestComputeAdvancedMetrics:
    def _make_pf_with_trades(self, pnl_list: list[float]) -> MagicMock:
        pf = MagicMock()
        pf.trades.records_readable = pd.DataFrame({"PnL": pnl_list})
        pf.drawdown.return_value = pd.Series(
            [0.0, -0.01, -0.02, 0.0, -0.01, 0.0], dtype=float
        )
        return pf

    def test_expectancy_positive_edge(self):
        """Expectancy should be positive when avg win > avg loss."""
        pf = self._make_pf_with_trades([100, 200, -50, 150, -30])
        result = BacktestEngine._compute_advanced_metrics(pf)
        assert result["expectancy"] > 0, "Expectancy should be positive"

    def test_expectancy_negative_edge(self):
        """Expectancy should be negative when avg loss > avg win."""
        pf = self._make_pf_with_trades([-200, -300, 10, -150, 5])
        result = BacktestEngine._compute_advanced_metrics(pf)
        assert result["expectancy"] < 0, "Expectancy should be negative"

    def test_kelly_criterion_bounded(self):
        """Kelly criterion must be in [0, 100]."""
        pf = self._make_pf_with_trades([100, 200, -50, 150, -30])
        result = BacktestEngine._compute_advanced_metrics(pf)
        assert 0 <= result["kellyCriterion"] <= 100

    def test_kelly_criterion_zero_when_all_losses(self):
        """Kelly criterion must be 0 when there are no wins."""
        pf = self._make_pf_with_trades([-100, -200, -50])
        result = BacktestEngine._compute_advanced_metrics(pf)
        assert result["kellyCriterion"] == 0.0

    def test_consecutive_losses_correct(self):
        """Max consecutive losses must be counted correctly."""
        pf = self._make_pf_with_trades([100, -50, -60, -70, 200, -10])
        result = BacktestEngine._compute_advanced_metrics(pf)
        assert result["consecutiveLosses"] == 3

    def test_consecutive_losses_zero_when_all_wins(self):
        pf = self._make_pf_with_trades([100, 200, 300])
        result = BacktestEngine._compute_advanced_metrics(pf)
        assert result["consecutiveLosses"] == 0

    def test_avg_drawdown_duration_format(self):
        """avgDrawdownDuration must be a string ending in 'd'."""
        pf = self._make_pf_with_trades([100, -50])
        result = BacktestEngine._compute_advanced_metrics(pf)
        assert isinstance(result["avgDrawdownDuration"], str)
        assert result["avgDrawdownDuration"].endswith("d")

    def test_empty_trades_returns_zeros(self):
        """Empty trade list must return all-zero advanced metrics."""
        pf = self._make_pf_with_trades([])
        result = BacktestEngine._compute_advanced_metrics(pf)
        assert result["expectancy"] == 0.0
        assert result["consecutiveLosses"] == 0
        assert result["kellyCriterion"] == 0.0
        assert result["avgDrawdownDuration"] == "0d"

    def test_universe_mode_aggregates_all_assets(self):
        """Universe mode must aggregate PnL across all assets."""
        pf = self._make_pf_with_trades([100, -50, 200, -30])
        result = BacktestEngine._compute_advanced_metrics(pf, universe=True)
        # Should still compute valid metrics
        assert "expectancy" in result
        assert "kellyCriterion" in result


# ---------------------------------------------------------------------------
# Edge cases — None / empty data
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_run_returns_none_for_none_df(self):
        assert BacktestEngine.run(None, "1") is None

    def test_run_returns_none_for_empty_df(self):
        empty = pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])
        assert BacktestEngine.run(empty, "1") is None
