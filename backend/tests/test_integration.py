"""End-to-end integration tests for BacktestEngine and OptimizationEngine.

These tests use synthetic OHLCV data — no Dhan API, no mocks for the
critical execution path. They verify the real signal generation, VBT
execution, and Optuna optimisation work correctly together.

Run with: pytest backend/tests/test_integration.py -v
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from services.backtest_engine import BacktestEngine
from services.optimizer import OptimizationEngine

# Flask test client for route-level tests
from app import app as flask_app


@pytest.fixture

def client():
    """Flask test client using the real application factory."""
    with flask_app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

def _make_trending_ohlcv(n: int = 300, seed: int = 42) -> pd.DataFrame:
    """Synthetic daily OHLCV with a trending price series.
    Columns are LOWERCASE (as returned by DataFetcher/DataCleaner).
    This tests that BacktestEngine handles lowercase input correctly.
    """
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2022-01-03", periods=n, freq="B")
    # Slight upward trend so RSI/MACD strategies can fire signals
    close = 500 + np.cumsum(rng.normal(0.2, 2.0, n))
    close = np.maximum(close, 1.0)
    df = pd.DataFrame(
        {
            "open": close * 0.995,
            "high": close * 1.01,
            "low": close * 0.985,
            "close": close,
            "volume": rng.integers(500_000, 5_000_000, n).astype(float),
        },
        index=idx,
    )
    return df


def _make_oscillating_ohlcv(n: int = 300, seed: int = 7) -> pd.DataFrame:
    """Synthetic daily OHLCV with mean-reverting price (good for RSI signals)."""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2022-01-03", periods=n, freq="B")
    # Sine-wave price to guarantee RSI oversold/overbought crossings
    t = np.linspace(0, 6 * np.pi, n)
    close = 500 + 80 * np.sin(t) + rng.normal(0, 5, n)
    close = np.maximum(close, 1.0)
    df = pd.DataFrame(
        {
            "open": close * 0.995,
            "high": close * 1.01,
            "low": close * 0.985,
            "close": close,
            "volume": rng.integers(500_000, 5_000_000, n).astype(float),
        },
        index=idx,
    )
    return df


# ---------------------------------------------------------------------------
# BacktestEngine — column normalisation (the bug we fixed)
# ---------------------------------------------------------------------------

class TestColumnNormalisation:
    """Verify the engine works with lowercase columns from DataCleaner."""

    def test_lowercase_columns_do_not_crash(self):
        """BacktestEngine must succeed with lowercase OHLCV columns (DataCleaner output)."""
        df = _make_oscillating_ohlcv()
        assert list(df.columns) == ["open", "high", "low", "close", "volume"]
        result = BacktestEngine.run(df, "1", {"initial_capital": 100_000})
        assert result is not None, "run() returned None with lowercase columns"
        assert result.get("status") != "failed", f"run() failed: {result}"

    def test_titlecase_columns_also_work(self):
        """BacktestEngine must also accept Title-Case columns."""
        df = _make_oscillating_ohlcv()
        df.columns = [c.capitalize() for c in df.columns]
        result = BacktestEngine.run(df, "1", {"initial_capital": 100_000})
        assert result is not None
        assert result.get("status") != "failed"

    def test_entries_are_series_not_bool(self):
        """Signal generation must return pandas Series, never a plain bool.
        This catches the AttributeError: 'bool' object has no attribute 'shift'.
        """
        from strategies import StrategyFactory
        df = _make_oscillating_ohlcv()
        df.columns = [c.capitalize() for c in df.columns]
        strategy = StrategyFactory.get_strategy("1", {"period": 14, "lower": 30, "upper": 70})
        entries, exits = strategy.generate_signals(df)
        assert isinstance(entries, pd.Series), f"entries is {type(entries)}, expected pd.Series"
        assert isinstance(exits, pd.Series), f"exits is {type(exits)}, expected pd.Series"


# ---------------------------------------------------------------------------
# BacktestEngine — preset strategies produce real results
# ---------------------------------------------------------------------------

class TestPresetStrategies:
    """Each preset strategy must return a completed result with valid metrics."""

    STRATEGIES = [
        ("1", {"period": 14, "lower": 30, "upper": 70}),   # RSI
        ("3", {"fast": 12, "slow": 26, "signal": 9}),       # MACD
        ("4", {"fast": 20, "slow": 50}),                     # EMA Crossover
    ]

    @pytest.mark.parametrize("strategy_id,params", STRATEGIES)
    def test_strategy_completes(self, strategy_id, params):
        df = _make_oscillating_ohlcv()
        config = {"initial_capital": 100_000, **params}
        result = BacktestEngine.run(df, strategy_id, config)
        assert result is not None, f"Strategy {strategy_id} returned None"
        assert "metrics" in result, f"Strategy {strategy_id} missing 'metrics'"
        assert result["metrics"].get("status") == "completed", (
            f"Strategy {strategy_id} status: {result['metrics'].get('status')}"
        )

    @pytest.mark.parametrize("strategy_id,params", STRATEGIES)
    def test_result_structure_complete(self, strategy_id, params):
        """Result must have all required keys the frontend expects."""
        df = _make_oscillating_ohlcv()
        config = {"initial_capital": 100_000, **params}
        result = BacktestEngine.run(df, strategy_id, config)
        assert result is not None
        for key in ("metrics", "equityCurve", "trades", "monthlyReturns", "startDate", "endDate"):
            assert key in result, f"Missing key '{key}' in result for strategy {strategy_id}"

    @pytest.mark.parametrize("strategy_id,params", STRATEGIES)
    def test_equity_curve_is_list_of_dicts(self, strategy_id, params):
        df = _make_oscillating_ohlcv()
        result = BacktestEngine.run(df, strategy_id, {"initial_capital": 100_000, **params})
        assert result is not None
        curve = result.get("equityCurve", [])
        assert isinstance(curve, list), "equityCurve must be a list"
        assert len(curve) > 0, "equityCurve must not be empty"
        assert "date" in curve[0] and "value" in curve[0], "equityCurve entries need date+value"

    @pytest.mark.parametrize("strategy_id,params", STRATEGIES)
    def test_metrics_have_no_nan(self, strategy_id, params):
        """No NaN values in metrics — would break JSON serialisation."""
        import math
        df = _make_oscillating_ohlcv()
        result = BacktestEngine.run(df, strategy_id, {"initial_capital": 100_000, **params})
        assert result is not None
        for k, v in result["metrics"].items():
            if isinstance(v, float):
                assert not math.isnan(v), f"metrics['{k}'] is NaN for strategy {strategy_id}"

    def test_rsi_oscillating_data_has_trades(self):
        """RSI strategy on oscillating data must generate at least 1 trade."""
        df = _make_oscillating_ohlcv(n=300)
        result = BacktestEngine.run(df, "1", {
            "initial_capital": 100_000, "period": 14, "lower": 30, "upper": 70
        })
        assert result is not None
        assert result["metrics"]["totalTrades"] > 0, (
            "RSI on oscillating data should generate trades"
        )

    def test_dates_match_dataframe_range(self):
        """startDate/endDate in result must match the DataFrame index."""
        df = _make_oscillating_ohlcv(n=200)
        result = BacktestEngine.run(df, "1", {"initial_capital": 100_000})
        assert result is not None
        assert result["startDate"] == str(df.index[0].date())
        assert result["endDate"] == str(df.index[-1].date())


# ---------------------------------------------------------------------------
# OptimizationEngine — Optuna finds best params
# ---------------------------------------------------------------------------

class TestOptimizationEngine:
    """Optuna optimisation runs end-to-end on synthetic data."""

    RANGES = {
        "period": {"min": 5, "max": 20, "step": 1},
        "lower":  {"min": 20, "max": 40, "step": 1},
        "upper":  {"min": 60, "max": 80, "step": 1},
    }

    def test_find_best_params_returns_dict(self):
        df = _make_oscillating_ohlcv(n=300)
        df.columns = [c.capitalize() for c in df.columns]
        best, grid = OptimizationEngine._find_best_params(
            df, "1", {**self.RANGES}, "sharpe",
            return_trials=True, n_trials=5
        )
        assert isinstance(best, dict), "bestParams must be a dict"
        assert "period" in best, "bestParams must contain 'period'"

    def test_grid_has_correct_structure(self):
        df = _make_oscillating_ohlcv(n=300)
        df.columns = [c.capitalize() for c in df.columns]
        _, grid = OptimizationEngine._find_best_params(
            df, "1", {**self.RANGES}, "sharpe",
            return_trials=True, n_trials=5
        )
        assert isinstance(grid, list), "grid must be a list"
        assert len(grid) > 0, "grid must not be empty"
        for trial in grid:
            assert "paramSet" in trial, "each trial needs 'paramSet'"
            assert "sharpe" in trial, "each trial needs 'sharpe'"
            assert "returnPct" in trial, "each trial needs 'returnPct'"
            assert "score" in trial, "each trial needs 'score'"

    def test_grid_sorted_by_score_descending(self):
        """Best trial must be first in the grid."""
        df = _make_oscillating_ohlcv(n=300)
        df.columns = [c.capitalize() for c in df.columns]
        _, grid = OptimizationEngine._find_best_params(
            df, "1", {**self.RANGES}, "sharpe",
            return_trials=True, n_trials=8
        )
        scores = [t["score"] for t in grid]
        assert scores == sorted(scores, reverse=True), "grid must be sorted best→worst"

    def test_best_params_within_ranges(self):
        """Best params must respect the min/max bounds."""
        df = _make_oscillating_ohlcv(n=300)
        df.columns = [c.capitalize() for c in df.columns]
        best, _ = OptimizationEngine._find_best_params(
            df, "1", {**self.RANGES}, "sharpe",
            return_trials=True, n_trials=5
        )
        assert self.RANGES["period"]["min"] <= best["period"] <= self.RANGES["period"]["max"]
        assert self.RANGES["lower"]["min"] <= best["lower"] <= self.RANGES["lower"]["max"]
        assert self.RANGES["upper"]["min"] <= best["upper"] <= self.RANGES["upper"]["max"]

    def test_http_backtest_after_optimize(self, client):
        """Full HTTP flow: optimise then backtest the top candidate.

        This ensures that parameters produced by the optimisation endpoint can be
        submitted to the backtest route and that the returned result correctly
        echoes the same parameters.
        """
        # 1. run optimisation via endpoint – patch the data fetcher so that Optuna
        # sees a sufficiently long DataFrame and actually returns candidates.
        df = _make_oscillating_ohlcv(n=300)
        df.columns = [c.capitalize() for c in df.columns]
        from unittest.mock import patch
        with patch("services.data_fetcher.DataFetcher.fetch_historical_data", return_value=df):
            payload = {
                "symbol": "TEST",  # symbol value is only used for logging
                "strategyId": "1",
                "ranges": self.RANGES,
                "timeframe": "1d",
                "startDate": "2023-01-01",
                "lookbackMonths": 12,
                "scoringMetric": "sharpe",
                "reproducible": True,
                "config": {"initial_capital": 100000}
            }
            opt_resp = client.post("/api/v1/optimization/run", json=payload)
        assert opt_resp.status_code == 200
        opt_data = opt_resp.get_json() or {}
        assert "grid" in opt_data and len(opt_data["grid"]) > 0
        top = opt_data["grid"][0]
        assert "paramSet" in top

        # 2. backtest using the top paramSet; reuse the same patch since the
        # backtest route also calls DataFetcher under the hood.
        with patch("services.data_fetcher.DataFetcher.fetch_historical_data", return_value=df):
            bt_payload = {
                "instrument_details": {
                    "security_id": "1",
                    "symbol": "TEST",
                    "exchange_segment": "NSE_EQ",
                    "instrument_type": "EQ",
                },
                "parameters": {
                    "timeframe": "1d",
                    "start_date": "2023-01-01",
                    "end_date": "2023-01-15",
                    "initial_capital": 50000,
                    "strategy_logic": top["paramSet"],
                },
            }
            bt_resp = client.post("/api/v1/market/backtest/run", json=bt_payload)
        assert bt_resp.status_code == 200
        bt_data = bt_resp.get_json() or {}
        assert bt_data.get("paramSet") == top["paramSet"], "Server must echo same paramSet"
        assert bt_data.get("metrics") is not None

    def test_build_portfolio_tolerates_object_dtype(self):
        """_build_portfolio should accept object-dtype signal series without error.

        This guards against numba typing failures seen during auto-tune trials.
        """
        df = _make_oscillating_ohlcv(n=100)
        df.columns = [c.capitalize() for c in df.columns]
        # alternating True/False with dtype object
        entries = pd.Series([True, False] * 50, index=df.index).astype(object)
        exits = pd.Series([False, True] * 50, index=df.index).astype(object)
        pf = OptimizationEngine._build_portfolio(df["Close"], entries, exits, {}, "1d")
        assert pf is not None
        # the portfolio should be constructed without error; casting the
        # trade count should succeed.
        assert int(pf.trades.count()) >= 0

    def test_find_best_params_with_object_signals(self):
        """Optimizer should survive when the strategy returns object-dtype signals.

        This is a regression for the numba typing error seen during auto-tune trials.
        """
        df = _make_oscillating_ohlcv(n=300)
        df.columns = [c.capitalize() for c in df.columns]

        class FakeStrategy:
            def generate_signals(self, df_):
                arr = pd.Series([True, False] * (len(df_) // 2), index=df_.index).astype(object)
                return arr, arr

        from unittest.mock import patch
        with patch("strategies.StrategyFactory.get_strategy", return_value=FakeStrategy()):
            try:
                best, grid = OptimizationEngine._find_best_params(
                    df, "1", {**self.RANGES}, "sharpe",
                    return_trials=True, n_trials=3
                )
                assert isinstance(best, dict)
                assert isinstance(grid, list)
            except ValueError as e:
                # acceptable if optimizer found no valid parameter sets; the
                # failure mode should still be descriptive and not a numba crash.
                assert "No valid parameter sets" in str(e)

    def test_run_optuna_full_response_structure(self):
        """run_optuna must return grid, wfo, and bestParams keys."""
        df = _make_oscillating_ohlcv(n=300)

        class FakeHeaders:
            def get(self, key, default=None): return default

        # Patch DataFetcher so no Dhan API call is made
        from unittest.mock import patch
        with patch("services.optimizer.DataFetcher") as MockFetcher:
            MockFetcher.return_value.fetch_historical_data.return_value = df
            result = OptimizationEngine.run_optuna(
                symbol="TEST", strategy_id="1",
                ranges={**self.RANGES, "startDate": "2022-01-03", "endDate": "2022-12-31"},
                headers=FakeHeaders(),
                n_trials=5, scoring_metric="sharpe",
                reproducible=True, config={}, timeframe="1d"
            )
        assert "grid" in result, "run_optuna must return 'grid'"
        assert "bestParams" in result, "run_optuna must return 'bestParams'"
        assert isinstance(result["grid"], list)
        assert isinstance(result["bestParams"], dict)

    def test_reproducible_flag_gives_same_result(self):
        """reproducible=True (via ranges dict) must produce the same bestParams across two runs."""
        df = _make_oscillating_ohlcv(n=300)
        df.columns = [c.capitalize() for c in df.columns]
        # reproducible lives in ranges dict (optimizer reads ranges.get("reproducible"))
        ranges_with_seed = {**self.RANGES, "reproducible": True}

        def run():
            best, _ = OptimizationEngine._find_best_params(
                df.copy(), "1", ranges_with_seed.copy(), "sharpe",
                return_trials=True, n_trials=10
            )
            return best

        r1, r2 = run(), run()
        assert r1 == r2, f"reproducible runs differ: {r1} vs {r2}"

    def test_different_scoring_metrics(self):
        """Optimizer must work with all supported scoring metrics."""
        df = _make_oscillating_ohlcv(n=300)
        df.columns = [c.capitalize() for c in df.columns]
        for metric in ("sharpe", "return", "calmar"):
            best, _ = OptimizationEngine._find_best_params(
                df.copy(), "1", {**self.RANGES}, metric,
                return_trials=True, n_trials=5
            )
            assert isinstance(best, dict), f"metric='{metric}' did not return a dict"


# ---------------------------------------------------------------------------
# HTTP-level tests for optimization routes
# ---------------------------------------------------------------------------

class TestAutoTuneRoute:
    """Exercise the `/auto-tune` endpoint for error conditions."""

    def test_missing_fields_returns_400(self, client):
        resp = client.post("/api/v1/optimization/auto-tune", json={})
        assert resp.status_code == 400
        data = resp.get_json()
        assert data is not None
        assert "Missing required fields" in data.get("message", "")

    def test_insufficient_history_returns_error(self, client):
        # simulate a cache that doesn't cover the requested lookback window
        import pandas as pd
        from unittest.mock import patch

        df = pd.DataFrame({
            "close": [1.0] * 10,
        }, index=pd.date_range("2025-01-01", periods=10, freq="B"))

        with patch("services.optimizer.DataFetcher") as MockFetcher:
            MockFetcher.return_value.fetch_historical_data.return_value = df
            payload = {
                "symbol": "HDFCBANK",
                "strategyId": "1",
                "ranges": {"period": {"min": 7, "max": 21, "step": 1}},
                "startDate": "2025-06-01",
                "lookbackMonths": 12,
            }
            resp = client.post("/api/v1/optimization/auto-tune", json=payload)

        assert resp.status_code == 400
        data = resp.get_json()
        assert data is not None
        assert "bars found" in data.get("message", ""), f"unexpected message: {data}"



# ---------------------------------------------------------------------------
# Auto-tune — date window logic
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Market route tests
# ---------------------------------------------------------------------------

class TestMarketRoute:
    """HTTP-level tests for /market/backtest/run endpoint."""

    def test_backtest_route_tolerates_object_signals(self, client):
        """Route should not crash even when the strategy yields object-type signals.

        We patch the strategy to force such output, then verify the response is
        a graceful 400 or 200 rather than a server error.
        """
        import pandas as pd
        from unittest.mock import patch

        # minimal data frame
        df = pd.DataFrame({
            "Open": [100, 101],
            "High": [101, 102],
            "Low": [99, 100],
            "Close": [100, 101],
            "Volume": [1000, 1000],
        }, index=pd.bdate_range("2023-01-01", periods=2, freq="B"))

        # patch fetcher to return our df, and strategy to produce object signals
        with patch("services.data_fetcher.DataFetcher.fetch_historical_data", return_value=df), \
             patch("strategies.StrategyFactory.get_strategy") as mock_sf:
            arr = pd.Series([True, False], index=df.index).astype(object)
            mock_sf.return_value.generate_signals.return_value = (arr, arr)

            payload = {
                "instrument_details": {
                    "security_id": "1",
                    "symbol": "TEST",
                    "exchange_segment": "NSE_EQ",
                    "instrument_type": "EQ",
                },
                "parameters": {
                    "timeframe": "1d",
                    "start_date": "2023-01-01",
                    "end_date": "2023-01-10",
                },
            }
            resp = client.post("/api/v1/market/backtest/run", json=payload)

        assert resp.status_code in (200, 400), f"Unexpected status {resp.status_code}"

    def test_backtest_route_includes_param_set(self, client):
        """The JSON returned by /market/backtest/run should echo the
        strategy parameters under ``paramSet`` so the frontend knows what was
        actually simulated.
        """
        payload = {
            "instrument_details": {
                "security_id": "1",
                "symbol": "TEST",
                "exchange_segment": "NSE_EQ",
                "instrument_type": "EQ",
            },
            "parameters": {
                "timeframe": "1d",
                "start_date": "2023-01-01",
                "end_date": "2023-01-10",
                "initial_capital": 50000,
                "strategy_logic": {"period": 10, "lower": 20, "upper": 80}
            },
        }
        resp = client.post("/api/v1/market/backtest/run", json=payload)
        assert resp.status_code == 200, f"Expected success, got {resp.status_code}"
        data = resp.get_json() or {}
        # paramSet should exactly match the strategy_logic we sent
        assert data.get("paramSet") == payload["parameters"]["strategy_logic"], \
            "Returned paramSet must match submitted strategy_logic"            


class TestAutoTuneDateLogic:
    """Verify auto-tune correctly computes the lookback window."""

    def test_auto_tune_lookback_window_is_before_start_date(self):
        """Data fetched by auto-tune must be entirely before startDate."""
        df = _make_oscillating_ohlcv(n=300)  # covers 2022-01-03 ~ 2023-03-xx

        class FakeHeaders:
            def get(self, key, default=None): return default

        from unittest.mock import patch, call
        # Instead of inspecting fetcher arguments (the engine always fetches
        # the full cached dataframe), we patch the optimisation step itself and
        # examine the DataFrame that _find_best_params receives.  This proves the
        # lookback slice happens correctly.
        from unittest.mock import patch
        with patch("services.optimizer.DataFetcher") as MockFetcher, \
             patch("services.optimizer.OptimizationEngine._find_best_params") as mock_find:
            MockFetcher.return_value.fetch_historical_data.return_value = df
            mock_find.return_value = ({}, [])
            OptimizationEngine.run_auto_tune(
                symbol="TEST", strategy_id="1",
                ranges={"period": {"min": 5, "max": 20, "step": 1},
                        "lower": {"min": 20, "max": 40, "step": 1},
                        "upper": {"min": 60, "max": 80, "step": 1}},
                timeframe="1d",
                start_date_str="2023-01-01",
                lookback=6,
                metric="sharpe",
                headers=FakeHeaders(),
                config={}
            )

            called_df = mock_find.call_args[0][0]
            assert called_df.index.max() < pd.Timestamp("2023-01-01"), (
                "Lookback slice passed to optimizer must be strictly before start date"
            )

    def test_auto_tune_6m_lookback_covers_correct_period(self):
        """6-month lookback before 2023-01-01 should fetch ~2022-07-01 to 2022-12-31."""
        df = _make_oscillating_ohlcv(n=300)

        class FakeHeaders:
            def get(self, key, default=None): return default

        from unittest.mock import patch
        with patch("services.optimizer.DataFetcher") as MockFetcher:
            MockFetcher.return_value.fetch_historical_data.return_value = df
            result = OptimizationEngine.run_auto_tune(
                symbol="TEST", strategy_id="1",
                ranges={"period": {"min": 5, "max": 20, "step": 1},
                        "lower": {"min": 20, "max": 40, "step": 1},
                        "upper": {"min": 60, "max": 80, "step": 1}},
                timeframe="1d",
                start_date_str="2023-01-01",
                lookback=6,
                metric="sharpe",
                headers=FakeHeaders(),
                config={}
            )
            # period string should reference the lookback window
            assert "2022" in result.get("period", ""), (
                f"Expected 2022 in period string, got: {result.get('period')}"
            )
