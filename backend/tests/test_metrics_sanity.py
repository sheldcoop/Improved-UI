"""Metric sanity tests — verify BacktestEngine returns mathematically correct values.

Uses fully synthetic, deterministic OHLCV data (daily calendar freq, NOT BusinessDay)
so VBT frequency detection works and we know ground truth.

Tests cover:
  - Calmar  = CAGR / Max Drawdown  (both in %, same units)
  - Win Rate = wins / total_trades  (cross-checked against trade list)
  - Total Return matches equity curve start → end
  - Max Drawdown stored as a positive number (absolute value)
  - startDate / endDate match actual DataFrame index
  - Phase-1: Optuna returns valid grid structure with correct keys
  - Phase-2: Risk params are applied on top of fixed indicator params
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.backtest_engine import BacktestEngine
from services.grid_engine import GridEngine

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ohlcv(
    n: int = 300,
    start_price: float = 100.0,
    end_price: float = 130.0,
    dip_day: int = 80,
    dip_pct: float = 0.06,
) -> pd.DataFrame:
    """Synthetic trending prices with one controlled drawdown.

    Uses freq='D' (calendar days) — NOT BusinessDay — so VBT detect_freq works.
    """
    dates = pd.date_range("2023-01-01", periods=n, freq="D")
    base = np.linspace(start_price, end_price, n)

    # Gaussian-shaped dip centred on dip_day
    dip = np.zeros(n)
    for i in range(n):
        dist = abs(i - dip_day)
        if dist < 20:
            dip[i] = -base[i] * dip_pct * np.exp(-(dist ** 2) / 60)

    close = np.maximum(base + dip, 1.0)
    return pd.DataFrame(
        {
            "open":   close * 0.999,
            "high":   close * 1.005,
            "low":    close * 0.995,
            "close":  close,
            "volume": np.full(n, 1_000_000.0),
        },
        index=dates,
    )


# CODE strategy: one long trade across the full period.
# Must define signal_logic(df) → (entries, exits) — the exec sandbox requires this.
_SINGLE_TRADE_CODE = """\
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits   = pd.Series(False, index=df.index)
    entries.iloc[0]  = True
    exits.iloc[-2]   = True
    return entries, exits
"""

# Multiple trades evenly spaced — gives Phase-2 enough trades to work with
_MULTI_TRADE_CODE = """\
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits   = pd.Series(False, index=df.index)
    entries.iloc[::50] = True
    exits.iloc[25::50] = True
    return entries, exits
"""

_BASE_CONFIG = {
    "mode":              "CODE",       # required — otherwise DynamicStrategy falls to VISUAL path
    "pythonCode":        _SINGLE_TRADE_CODE,
    "initial_capital":   100_000,
    "commission":        0,
    "slippage":          0,
    "positionSizing":    "Fixed Capital",
    "positionSizeValue": 100_000,
}


def _run(extra_config: dict | None = None) -> dict:
    df = _make_ohlcv()
    cfg = {**_BASE_CONFIG, **(extra_config or {})}
    result = BacktestEngine.run(df, "custom", cfg)
    assert result is not None, "BacktestEngine returned None"
    assert result.get("status") != "failed", f"Backtest failed: {result.get('error')}"
    return result


# ---------------------------------------------------------------------------
# Calmar ratio
# ---------------------------------------------------------------------------

class TestCalmarRatio:

    def test_calmar_equals_cagr_over_max_drawdown(self):
        """Calmar must equal CAGR% / MaxDD% — both in percentage points."""
        m = _run()["metrics"]
        max_dd = m.get("maxDrawdownPct") or 0.0
        cagr   = m.get("cagr") or 0.0
        calmar = m.get("calmarRatio") or 0.0
        if max_dd > 0:
            expected = round(cagr / max_dd, 2)
            assert abs(calmar - expected) < 0.05, (
                f"Calmar={calmar} but CAGR/DD = {expected} "
                f"(cagr={cagr}, dd={max_dd})"
            )

    def test_calmar_not_inflated(self):
        """Calmar should be a single/low double-digit on realistic 1-year data."""
        m = _run()["metrics"]
        calmar = m.get("calmarRatio") or 0.0
        # The old VBT bug gave 422. Anything > 100 on ~6% DD data is wrong.
        assert calmar < 100, f"Calmar looks inflated: {calmar}"

    def test_calmar_zero_when_no_drawdown(self):
        """No division-by-zero when max drawdown is 0."""
        # Strictly monotone prices → no drawdown possible
        n = 300
        dates  = pd.date_range("2023-01-01", periods=n, freq="D")
        close  = np.linspace(100, 130, n)
        df = pd.DataFrame(
            {"open": close*0.999, "high": close*1.005,
             "low":  close*0.995, "close": close,
             "volume": np.ones(n) * 1_000_000},
            index=dates,
        )
        result = BacktestEngine.run(df, "custom", _BASE_CONFIG)
        if result and result.get("status") != "failed":
            m = result["metrics"]
            if (m.get("maxDrawdownPct") or 0.0) == 0.0:
                assert (m.get("calmarRatio") or 0.0) == 0.0, (
                    "Calmar should be 0 when max drawdown is 0"
                )


# ---------------------------------------------------------------------------
# Win rate
# ---------------------------------------------------------------------------

class TestWinRate:

    def test_win_rate_matches_trade_list(self):
        """Win rate in metrics must equal wins/total from the trade list."""
        result = _run()
        m      = result["metrics"]
        trades = result.get("trades", [])
        total  = m.get("totalTrades") or 0
        if total > 0 and trades:
            wins = sum(1 for t in trades if (t.get("pnl") or 0) > 0)
            expected_wr = round((wins / total) * 100, 1)
            assert abs((m.get("winRate") or 0) - expected_wr) < 1.0, (
                f"Win rate mismatch: metrics={m.get('winRate')}%, "
                f"trade list={expected_wr}% ({wins}/{total})"
            )

    def test_win_rate_in_valid_range(self):
        m = _run()["metrics"]
        wr = m.get("winRate") or 0.0
        assert 0.0 <= wr <= 100.0, f"winRate {wr} out of [0, 100]"


# ---------------------------------------------------------------------------
# Total return
# ---------------------------------------------------------------------------

class TestTotalReturn:

    def test_return_matches_equity_curve(self):
        """Total return must match equity[0] → equity[-1] ratio."""
        result = _run()
        equity = result.get("equityCurve", [])
        if len(equity) >= 2:
            start_val = equity[0]["value"]
            end_val   = equity[-1]["value"]
            computed  = round((end_val - start_val) / start_val * 100, 1)
            reported  = round((result["metrics"].get("totalReturnPct") or 0), 1)
            assert abs(computed - reported) < 0.5, (
                f"Equity curve gives {computed}%, metrics gives {reported}%"
            )

    def test_positive_return_on_uptrend(self):
        """Buy-and-hold on a 30%-uptrend must yield a positive return."""
        m = _run()["metrics"]
        total_ret = m.get("totalReturnPct") or 0.0
        assert total_ret > 0, (
            f"Expected positive return on uptrend data, got {total_ret}%"
        )


# ---------------------------------------------------------------------------
# Max drawdown
# ---------------------------------------------------------------------------

class TestMaxDrawdown:

    def test_max_drawdown_is_non_negative(self):
        """maxDrawdownPct is stored as absolute value — must be >= 0."""
        m = _run()["metrics"]
        dd = m.get("maxDrawdownPct") or 0.0
        assert dd >= 0, f"maxDrawdownPct should be non-negative, got {dd}"

    def test_max_drawdown_less_than_total_return(self):
        """On a net-profitable run the DD should be smaller than gross return."""
        m = _run()["metrics"]
        ret = m.get("totalReturnPct") or 0.0
        dd  = m.get("maxDrawdownPct") or 0.0
        if ret > 0:
            assert dd < ret + 5, (
                f"Max drawdown ({dd}%) is surprisingly large vs return ({ret}%)"
            )


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

class TestDates:

    def test_start_end_dates_match_dataframe(self):
        df     = _make_ohlcv()
        result = BacktestEngine.run(df, "custom", _BASE_CONFIG)
        assert result["startDate"] == str(df.index[0].date()), (
            f"startDate {result['startDate']} != {df.index[0].date()}"
        )
        assert result["endDate"] == str(df.index[-1].date()), (
            f"endDate {result['endDate']} != {df.index[-1].date()}"
        )


# ---------------------------------------------------------------------------
# Phase-1 optimisation (indicator params via _find_best_params)
# ---------------------------------------------------------------------------

class TestPhase1Optimisation:
    """Uses GridEngine._find_best_params directly — no network call required."""

    _RANGES = {
        "period": {"min": 5,  "max": 20, "step": 5},
        "lower":  {"min": 20, "max": 40, "step": 10},
        "upper":  {"min": 60, "max": 80, "step": 10},
    }
    _CFG = {"initial_capital": 100_000, "commission": 20, "slippage": 0.0}

    def test_phase1_returns_valid_structure(self):
        """_find_best_params(return_trials=True) must return (dict, list[dict])."""
        df = _make_ohlcv(n=500)
        best_params, grid = GridEngine._find_best_params(
            df=df, strategy_id="1", ranges=self._RANGES,
            scoring_metric="sharpe", return_trials=True,
            n_trials=10, config=self._CFG,
        )
        assert isinstance(best_params, dict), "best_params is not a dict"
        assert isinstance(grid, list),        "grid is not a list"
        assert len(grid) > 0,                 "grid is empty — no valid trials"
        # Verify actual grid schema (keys from grid_engine.py line 255-263)
        top = grid[0]
        for key in ("paramSet", "score", "winRate", "drawdown", "trades", "returnPct"):
            assert key in top, f"Missing key '{key}' in grid row. Got: {list(top.keys())}"

    def test_phase1_best_params_within_ranges(self):
        """Every best param must fall inside its declared search range."""
        df = _make_ohlcv(n=500)
        best_params, _ = GridEngine._find_best_params(
            df=df, strategy_id="1", ranges=self._RANGES,
            scoring_metric="sharpe", return_trials=True,
            n_trials=10, config=self._CFG,
        )
        for param, bounds in self._RANGES.items():
            if param in best_params:
                val = best_params[param]
                assert bounds["min"] <= val <= bounds["max"], (
                    f"Param '{param}'={val} outside [{bounds['min']}, {bounds['max']}]"
                )

    def test_phase1_score_is_finite(self):
        """Best score must be a finite real number — not NaN or ±inf."""
        df = _make_ohlcv(n=500)
        _, grid = GridEngine._find_best_params(
            df=df, strategy_id="1", ranges=self._RANGES,
            scoring_metric="sharpe", return_trials=True,
            n_trials=10, config=self._CFG,
        )
        if grid:
            score = grid[0]["score"]
            assert isinstance(score, (int, float)), "Score is not numeric"
            assert score == score,   "Score is NaN"    # NaN != NaN
            assert abs(score) < 1e6, f"Score looks inflated: {score}"


# ---------------------------------------------------------------------------
# Phase-2 optimisation (risk params with fixed indicator params)
# ---------------------------------------------------------------------------

class TestPhase2Optimisation:

    def test_phase2_calmar_formula_holds_with_sl_tp(self):
        """With stop-loss + take-profit applied, Calmar still equals CAGR/MaxDD."""
        df = _make_ohlcv(n=500)
        cfg = {
            **_BASE_CONFIG,
            "mode":          "CODE",
            "pythonCode":    _MULTI_TRADE_CODE,
            "stopLossPct":   3.0,
            "takeProfitPct": 8.0,
        }
        result = BacktestEngine.run(df, "custom", cfg)
        if result and result.get("status") != "failed":
            m = result["metrics"]
            max_dd = m.get("maxDrawdownPct") or 0.0
            cagr   = m.get("cagr") or 0.0
            calmar = m.get("calmarRatio") or 0.0
            if max_dd > 0:
                expected = round(cagr / max_dd, 2)
                assert abs(calmar - expected) < 0.05, (
                    f"Phase-2 Calmar={calmar} != CAGR/DD={expected}"
                )

    def test_phase2_risk_search_finds_valid_params(self):
        """Phase-2: searching risk ranges with fixed indicator params returns a grid."""
        df = _make_ohlcv(n=500)
        fixed_params = {"period": 14, "lower": 30, "upper": 70}
        risk_ranges  = {
            "stopLossPct":   {"min": 2.0, "max": 6.0,  "step": 2.0},
            "takeProfitPct": {"min": 4.0, "max": 10.0, "step": 3.0},
        }
        cfg = {"initial_capital": 100_000, "commission": 20, "slippage": 0.0}
        best_params, grid = GridEngine._find_best_params(
            df=df, strategy_id="1", ranges=risk_ranges,
            scoring_metric="sharpe", return_trials=True,
            n_trials=8, config=cfg, fixed_params=fixed_params,
        )
        assert isinstance(grid, list), "Phase-2 grid is not a list"
        assert len(grid) > 0,          "Phase-2 found no valid risk param sets"
        # best_params contains the optimised risk params
        assert "stopLossPct"   in best_params, "stopLossPct not in Phase-2 best_params"
        assert "takeProfitPct" in best_params, "takeProfitPct not in Phase-2 best_params"
        # fixed params are applied at trial time but returned separately — not in best_params
        # (this is by design in _find_best_params)

    def test_phase2_score_is_finite(self):
        """Phase-2 scores must also be finite numbers."""
        df = _make_ohlcv(n=500)
        risk_ranges = {
            "stopLossPct":   {"min": 2.0, "max": 8.0,  "step": 2.0},
            "takeProfitPct": {"min": 4.0, "max": 12.0, "step": 4.0},
        }
        cfg = {"initial_capital": 100_000, "commission": 20, "slippage": 0.0}
        _, grid = GridEngine._find_best_params(
            df=df, strategy_id="1", ranges=risk_ranges,
            scoring_metric="drawdown", return_trials=True,
            n_trials=8, config=cfg,
            fixed_params={"period": 14, "lower": 30, "upper": 70},
        )
        for row in grid:
            s = row["score"]
            assert s == s,   f"NaN score in Phase-2 grid: {row}"
            assert abs(s) < 1e6, f"Inflated score in Phase-2 grid: {s}"
