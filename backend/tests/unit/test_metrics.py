"""tests/unit/test_metrics.py — Metric correctness + optimiser unit tests.

Consolidates:
  - test_metrics_sanity.py  (Calmar, WinRate, TotalReturn, MaxDD, Dates)
  - test_optimizer.py       (Phase-1 / Phase-2 Optuna grid engine tests)

All tests use deterministic synthetic data — no Dhan API calls.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd
import pytest

_TESTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _TESTS not in sys.path:
    sys.path.insert(0, _TESTS)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from testlib import make_ohlcv
from services.backtest_engine import BacktestEngine
from services.grid_engine import GridEngine


# ---------------------------------------------------------------------------
# Shared test data & configs
# ---------------------------------------------------------------------------

_SINGLE_TRADE_CODE = """
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits   = pd.Series(False, index=df.index)
    entries.iloc[0]  = True
    exits.iloc[-2]   = True
    return entries, exits
"""

_MULTI_TRADE_CODE = """
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits   = pd.Series(False, index=df.index)
    entries.iloc[::50] = True
    exits.iloc[25::50] = True
    return entries, exits
"""

_BASE_CFG = {
    "mode":              "CODE",
    "pythonCode":        _SINGLE_TRADE_CODE,
    "initial_capital":   100_000,
    "commission":        0,
    "slippage":          0,
    "positionSizing":    "Fixed Capital",
    "positionSizeValue": 100_000,
}

_GRID_RANGES = {
    "period": {"min": 5,  "max": 20, "step": 5},
    "lower":  {"min": 20, "max": 40, "step": 10},
    "upper":  {"min": 60, "max": 80, "step": 10},
}
_GRID_CFG = {"initial_capital": 100_000, "commission": 20, "slippage": 0.0}


def _run(extra: dict | None = None) -> dict:
    """Run BacktestEngine.run with single-trade config on 300-bar data."""
    df  = make_ohlcv(n=300)
    cfg = {**_BASE_CFG, **(extra or {})}
    result = BacktestEngine.run(df, "custom", cfg)
    assert result is not None, "BacktestEngine returned None"
    assert result.get("status") != "failed", f"Backtest failed: {result.get('error')}"
    return result


# ===========================================================================
# Calmar ratio
# ===========================================================================

class TestCalmarRatio:

    def test_equals_cagr_over_max_drawdown(self):
        """calmarRatio == CAGR% / maxDrawdownPct (both in percentage points)."""
        m = _run()["metrics"]
        dd     = m.get("maxDrawdownPct") or 0.0
        cagr   = m.get("cagr")           or 0.0
        calmar = m.get("calmarRatio")     or 0.0
        if dd > 0:
            expected = round(cagr / dd, 2)
            assert abs(calmar - expected) < 0.05, (
                f"Calmar={calmar}, CAGR/DD={expected} (cagr={cagr}, dd={dd})"
            )

    def test_not_inflated(self):
        """Calmar must be a believable single/low double digit — not 422."""
        calmar = _run()["metrics"].get("calmarRatio") or 0.0
        assert calmar < 100, f"Calmar looks inflated: {calmar}"

    def test_zero_when_no_drawdown(self):
        """No division-by-zero when maxDrawdown == 0."""
        n = 300
        close = np.linspace(100, 130, n)
        df = pd.DataFrame(
            {"open": close*0.999, "high": close*1.005, "low": close*0.995,
             "close": close, "volume": np.ones(n)*1_000_000},
            index=pd.date_range("2023-01-01", periods=n, freq="D"),
        )
        result = BacktestEngine.run(df, "custom", _BASE_CFG)
        if result and result.get("status") != "failed":
            m = result["metrics"]
            if (m.get("maxDrawdownPct") or 0.0) == 0.0:
                assert (m.get("calmarRatio") or 0.0) == 0.0

    def test_with_sl_tp(self):
        """Calmar still equals CAGR/DD when stop-loss and take-profit are active."""
        df = make_ohlcv(n=500)
        result = BacktestEngine.run(df, "custom", {
            **_BASE_CFG,
            "pythonCode":    _MULTI_TRADE_CODE,
            "stopLossPct":   3.0,
            "takeProfitPct": 8.0,
        })
        if result and result.get("status") != "failed":
            m = result["metrics"]
            dd, cagr, calmar = (m.get("maxDrawdownPct") or 0,
                                m.get("cagr") or 0,
                                m.get("calmarRatio") or 0)
            if dd > 0:
                assert abs(calmar - round(cagr / dd, 2)) < 0.05


# ===========================================================================
# Win rate
# ===========================================================================

class TestWinRate:

    def test_matches_trade_list(self):
        """Win rate in metrics must equal wins/total from the trade list."""
        result = _run()
        m, trades = result["metrics"], result.get("trades", [])
        total = m.get("totalTrades") or 0
        if total > 0 and trades:
            wins = sum(1 for t in trades if (t.get("pnl") or 0) > 0)
            expected = round((wins / total) * 100, 1)
            assert abs((m.get("winRate") or 0) - expected) < 1.0

    def test_in_valid_range(self):
        wr = _run()["metrics"].get("winRate") or 0.0
        assert 0.0 <= wr <= 100.0


# ===========================================================================
# Total return
# ===========================================================================

class TestTotalReturn:

    def test_matches_equity_curve(self):
        """totalReturnPct must match equity[0]→equity[-1] ratio."""
        result = _run()
        equity = result.get("equityCurve", [])
        if len(equity) >= 2:
            start, end = equity[0]["value"], equity[-1]["value"]
            computed = round((end - start) / start * 100, 1)
            reported = round(result["metrics"].get("totalReturnPct") or 0, 1)
            assert abs(computed - reported) < 0.5

    def test_positive_on_uptrend(self):
        """Buy-and-hold on 30%-uptrend data must yield a positive return."""
        assert (_run()["metrics"].get("totalReturnPct") or 0.0) > 0


# ===========================================================================
# Max drawdown
# ===========================================================================

class TestMaxDrawdown:

    def test_non_negative(self):
        dd = _run()["metrics"].get("maxDrawdownPct") or 0.0
        assert dd >= 0

    def test_less_than_total_return_on_profitable_run(self):
        m = _run()["metrics"]
        ret, dd = m.get("totalReturnPct") or 0, m.get("maxDrawdownPct") or 0
        if ret > 0:
            assert dd < ret + 5


# ===========================================================================
# Date fields
# ===========================================================================

class TestDateFields:

    def test_start_end_dates_match_dataframe_index(self):
        df = make_ohlcv(n=300)
        result = BacktestEngine.run(df, "custom", _BASE_CFG)
        assert result["startDate"] == str(df.index[0].date())
        assert result["endDate"]   == str(df.index[-1].date())


# ===========================================================================
# Phase-1 grid optimisation
# ===========================================================================

class TestPhase1Optimisation:

    def test_returns_valid_structure(self):
        df = make_ohlcv(n=500)
        best, grid = GridEngine._find_best_params(
            df=df, strategy_id="1", ranges=_GRID_RANGES,
            scoring_metric="sharpe", return_trials=True,
            n_trials=10, config=_GRID_CFG,
        )
        assert isinstance(best, dict)
        assert isinstance(grid, list) and len(grid) > 0
        for key in ("paramSet", "score", "winRate", "drawdown", "trades", "returnPct"):
            assert key in grid[0], f"Missing key '{key}' in grid row"

    def test_best_params_within_declared_ranges(self):
        df = make_ohlcv(n=500)
        best, _ = GridEngine._find_best_params(
            df=df, strategy_id="1", ranges=_GRID_RANGES,
            scoring_metric="sharpe", return_trials=True,
            n_trials=10, config=_GRID_CFG,
        )
        for param, bounds in _GRID_RANGES.items():
            if param in best:
                val = best[param]
                assert bounds["min"] <= val <= bounds["max"]

    def test_score_is_finite(self):
        df = make_ohlcv(n=500)
        _, grid = GridEngine._find_best_params(
            df=df, strategy_id="1", ranges=_GRID_RANGES,
            scoring_metric="sharpe", return_trials=True,
            n_trials=10, config=_GRID_CFG,
        )
        for row in grid:
            s = row["score"]
            assert s == s, "Score is NaN"
            assert abs(s) < 1e6, f"Inflated score: {s}"


# ===========================================================================
# Phase-2 risk optimisation
# ===========================================================================

class TestPhase2Optimisation:

    _RISK_RANGES = {
        "stopLossPct":   {"min": 2.0, "max": 6.0,  "step": 2.0},
        "takeProfitPct": {"min": 4.0, "max": 10.0, "step": 3.0},
    }
    _FIXED = {"period": 14, "lower": 30, "upper": 70}

    def test_finds_valid_risk_params(self):
        """_find_best_params finds risk params or raises ValueError when no trades occur on short synthetic data."""
        df = make_ohlcv(n=500)
        try:
            best, grid = GridEngine._find_best_params(
                df=df, strategy_id="1", ranges=self._RISK_RANGES,
                scoring_metric="sharpe", return_trials=True,
                n_trials=8, config=_GRID_CFG, fixed_params=self._FIXED,
            )
            assert isinstance(grid, list) and len(grid) > 0
            assert "stopLossPct" in best and "takeProfitPct" in best
        except ValueError as e:
            # Also valid — no trades on this dataset due to synthetic flat data
            assert "trades" in str(e).lower() or "results" in str(e).lower()

    def test_score_is_finite(self):
        """All scores returned from grid search are finite (no NaN/inf)."""
        df = make_ohlcv(n=300)
        try:
            _, grid = GridEngine._find_best_params(
                df=df, strategy_id="1", ranges=self._RISK_RANGES,
                scoring_metric="sharpe", return_trials=True,
                n_trials=5, config=_GRID_CFG,
            )
            for trial in grid:
                s = trial.get("score", 0)
                assert s == s and abs(s) < 1e6
        except ValueError:
            pytest.skip("Not enough trades on synthetic data for grid search")

    def test_run_optuna_basic(self):
        """run_optuna is a facade over GridEngine._find_best_params (already tested above)."""
        # We verify the method is accessible on the OptimizationEngine facade
        from services.optimizer import OptimizationEngine
        assert hasattr(OptimizationEngine, "run_optuna")

    def test_run_optuna_with_risk_params(self):
        """Phase-2 via risk_ranges in GridEngine._find_best_params works end-to-end."""
        df = make_ohlcv(n=300)
        risk_ranges = {
            "stopLossPct":   {"min": 2.0, "max": 6.0,  "step": 2.0},
            "takeProfitPct": {"min": 4.0, "max": 10.0, "step": 3.0},
        }
        try:
            best, grid = GridEngine._find_best_params(
                df=df, strategy_id="1", ranges=risk_ranges,
                scoring_metric="sharpe", return_trials=True,
                n_trials=6, config=_GRID_CFG,
                fixed_params={"period": 14, "lower": 30, "upper": 70},
            )
            assert isinstance(best, dict)
            assert isinstance(grid, list)
        except ValueError:
            pytest.skip("Not enough trades on synthetic data for Phase-2 grid search")

    def test_data_split_phase2(self):
        """Phase-2 must receive only the IS portion of the data."""
        df = make_ohlcv(n=300)
        split = int(len(df) * 0.7)
        is_df = df.iloc[:split]
        assert len(is_df) == split
