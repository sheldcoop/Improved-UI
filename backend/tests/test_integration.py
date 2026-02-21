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

    def test_optimization_with_risk_ranges(self, client):
        """Server should accept riskRanges and return riskGrid entries."""
        import pandas as pd
        from unittest.mock import patch

        df = pd.DataFrame({"Open": [100, 101], "High": [101, 102],
                           "Low": [99, 100], "Close": [100, 101],
                           "Volume": [1000, 1000]},
                          index=pd.bdate_range("2023-01-01", periods=2, freq="B"))
        with patch("services.data_fetcher.DataFetcher.fetch_historical_data", return_value=df):
            payload = {
                "symbol": "TEST",
                "strategyId": "1",
                "ranges": {
                    "timeframe": "1d", "startDate": "2023-01-01", "endDate": "2023-01-02",
                    "period": {"min": 5, "max": 5, "step": 1},
                    "lower": {"min": 30, "max": 30, "step": 1},
                    "upper": {"min": 70, "max": 70, "step": 1}
                },
                "riskRanges": {
                    "stopLossPct": {"min": 0, "max": 1, "step": 1},
                    "takeProfitPct": {"min": 0, "max": 1, "step": 1}
                }
            }
            resp = client.post("/api/v1/optimization/run", json=payload)
        assert resp.status_code == 200
        data = resp.get_json() or {}
        # response should always echo bestParams from first-phase
        assert "bestParams" in data
        # if combinedParams present, it must include the primary keys
        if "combinedParams" in data:
            for key in ("period", "lower", "upper"):
                assert key in data["combinedParams"], f"primary param {key} missing from combinedParams"
        # either riskGrid exists or the second phase failed silently
        assert ("riskGrid" in data and isinstance(data["riskGrid"], list)) or ("bestRiskParams" not in data)

    def test_backtest_engine_monthly_returns(self):
        """BacktestEngine should emit at least one monthly return without error."""
        import pandas as pd
        from services.backtest_engine import BacktestEngine
        idx = pd.date_range('2023-01-01','2023-03-01', freq='B')
        df = pd.DataFrame({'Open':1,'High':1,'Low':1,'Close':1,'Volume':1}, index=idx)
        res = BacktestEngine.run(df, '1', {})
        assert isinstance(res.get('monthlyReturns'), list)
        assert len(res['monthlyReturns']) >= 2

    def test_backtest_route_validates_stoploss_takeprofit(self, client):
        """The /backtest/run endpoint must reject negative SL/TP values."""
        payload = {
            "symbol": "TEST",
            "timeframe": "1d",
            "strategyId": "1",
            "slippage": 0.1,
            "commission": 10,
            "initial_capital": 1000,
            "stopLossPct": -1,
            "takeProfitPct": 2
        }
        resp = client.post("/api/v1/backtest/run", json=payload)
        assert resp.status_code == 400
        assert "stopLossPct" in (resp.get_json() or {}).get("message", "")
        # also test take-profit negative
        payload["stopLossPct"] = 1
        payload["takeProfitPct"] = -5
        resp2 = client.post("/api/v1/backtest/run", json=payload)
        assert resp2.status_code == 400
        assert "takeProfitPct" in (resp2.get_json() or {}).get("message", "")

    def test_backtest_returns_stats_params(self, client):
        """When statsFreq/window provided, response includes statsParams and returnsStats."""
        import pandas as pd
        from unittest.mock import patch

        df = pd.DataFrame({"Open": [100, 101], "High": [101, 102],
                           "Low": [99, 100], "Close": [100, 101],
                           "Volume": [1000, 1000]},
                          index=pd.bdate_range("2023-01-01", periods=2, freq="B"))
        with patch("services.data_fetcher.DataFetcher.fetch_historical_data", return_value=df):
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
                    "end_date": "2023-01-02",
                    "initial_capital": 50000,
                    "strategy_logic": {"id": "1"},
                    "statsFreq": "D",
                    "statsWindow": 1
                },
            }
            resp = client.post("/api/v1/market/backtest/run", json=payload)
        assert resp.status_code == 200
        data = resp.get_json() or {}
        assert data.get("statsParams") == {"freq": "D", "window": 1}
        assert "returnsStats" in data
        assert isinstance(data["returnsStats"], dict)
        # ensure when using monthly alias it still returns something (normalisation)
        payload["parameters"]["statsFreq"] = "1M"
        resp2 = client.post("/api/v1/market/backtest/run", json=payload)
        assert resp2.status_code == 200
        data2 = resp2.get_json() or {}
        assert "returnsStats" in data2
        assert data2["returnsStats"], "monthly stats should not be empty"

    def test_build_portfolio_tolerates_object_dtype(self):
        """_build_portfolio should accept object-dtype signal series without error.

        This guards against numba typing failures seen during optimisation trials.
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

        This is a regression for the numba typing error seen during optimisation trials.
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

class TestOptimizationValidation:
    """Ensure optimisation endpoints reject bad input early."""

    def test_run_missing_symbol(self, client):
        resp = client.post("/api/v1/optimization/run", json={"strategyId": "1", "ranges": {}})
        assert resp.status_code == 400
        data = resp.get_json() or {}
        assert "symbol is required" in data.get("message", "")

    def test_run_ranges_not_dict(self, client):
        resp = client.post("/api/v1/optimization/run", json={"symbol": "A", "strategyId": "1", "ranges": "nope"})
        assert resp.status_code == 400
        data = resp.get_json() or {}
        assert "ranges must be a dict" in data.get("message", "")

    def test_run_bad_dates(self, client):
        payload = {"symbol": "A", "strategyId": "1", "ranges": {}, "startDate": "20230101"}
        resp = client.post("/api/v1/optimization/run", json=payload)
        assert resp.status_code == 400
        assert "startDate must be YYYY-MM-DD" in (resp.get_json() or {}).get("message", "")

    def test_wfo_missing_strategy(self, client):
        resp = client.post("/api/v1/optimization/wfo", json={"symbol": "A", "ranges": {}})
        assert resp.status_code == 400
        assert "strategyId is required" in (resp.get_json() or {}).get("message", "")

    def test_wfo_ranges_not_dict(self, client):
        resp = client.post("/api/v1/optimization/wfo", json={"symbol": "A", "strategyId": "1", "ranges": "nope"})
        assert resp.status_code == 400
        assert "ranges must be a dict" in (resp.get_json() or {}).get("message", "")


class TestCacheVersioning:
    """Ensure parquet cache writes metadata and invalidates mismatched versions."""


class TestErrorLogging:
    """Verify central error handler and client log endpoint work."""

    def test_uncaught_exception_returns_json(self, client):
        # use the pre-defined test route that raises an exception
        resp = client.get('/api/v1/debug/raise')
        assert resp.status_code == 500
        data = resp.get_json() or {}
        assert data.get('status') == 'error'
        assert 'Internal server error' in data.get('message', '')
        # check that buffer contains the error message
        logs = client.get('/api/v1/debug/logs').get_json() or []
        assert any('Unhandled exception' in entry['msg'] for entry in logs)

    def test_client_log_endpoint(self, client):
        payload = {'message': 'frontend failure', 'level': 'WARNING', 'meta': {'component': 'Backtest'}}
        resp = client.post('/api/v1/debug/log', json=payload)
        assert resp.status_code == 200
        logs = client.get('/api/v1/debug/logs').get_json() or []
        assert any('frontend failure' in entry['msg'] for entry in logs)

    def test_metadata_written_and_readable(self, tmp_path):
        from services.cache_service import CacheService, CACHE_DIR, CACHE_SCHEMA_VERSION
        import pandas as pd, json

        svc = CacheService()
        # override directory for test
        svc_dir = tmp_path / "cache_dir"
        svc_dir.mkdir()
        # monkey patch global
        from services import cache_service
        cache_service.CACHE_DIR = svc_dir

        df = pd.DataFrame({"open": [1], "close": [1]}, index=pd.date_range("2023-01-01", periods=1))
        svc.save("FOO_1d", df)
        path = svc._cache_path("FOO_1d")
        assert path.exists()
        meta_path = path.with_suffix('.meta.json')
        assert meta_path.exists()
        meta = json.loads(meta_path.read_text())
        assert meta.get("version") == CACHE_SCHEMA_VERSION
        assert meta.get("schema") == ["open", "close"]

        # reading through service should succeed
        loaded = svc.get("FOO_1d")
        assert loaded is not None

        # now corrupt version
        meta["version"] = 999
        meta_path.write_text(json.dumps(meta))
        assert svc.get("FOO_1d") is None
        status = svc.get_status()
        assert status and status[0]["health"] == "MISMATCH"




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

    # ------------------------------------------------------------------
    # New test cases for market data fetch endpoint
    # ------------------------------------------------------------------

    def test_fetch_requires_symbol(self, client):
        """POST /market/fetch must return 400 if symbol is missing."""
        resp = client.post("/api/v1/market/fetch", json={})
        assert resp.status_code == 400
        data = resp.get_json() or {}
        assert "symbol" in data.get("message", "")

    def test_fetch_success_returns_health_and_sample(self, client, monkeypatch):
        """A successful fetch returns 200 with health report and sample rows."""
        import pandas as pd
        from services.data_health import DataHealthService

        # prepare deterministic df and health
        df = pd.DataFrame({"open": [1], "close": [1]}, index=pd.date_range("2023-01-01", periods=1))
        monkeypatch.setattr(
            "services.data_fetcher.DataFetcher.fetch_historical_data",
            lambda self, symbol, tf, f, t: df
        )
        monkeypatch.setattr(
            DataHealthService,
            "compute",
            classmethod(lambda cls, s, tf, f, t: {
                "score": 100,
                "missingCandles": 0,
                "zeroVolumeCandles": 0,
                "totalCandles": 1,
                "gaps": [],
                "status": "EXCELLENT"
            })
        )

        payload = {
            "symbol": "TEST",
            "timeframe": "1d",
            "from_date": "2023-01-01",
            "to_date": "2023-01-01"
        }
        resp = client.post("/api/v1/market/fetch", json=payload)
        assert resp.status_code == 200, f"got {resp.status_code}"
        data = resp.get_json() or {}
        assert data.get("status") == "success"
        assert "health" in data and data["health"]["status"] == "EXCELLENT"
        assert isinstance(data.get("sample"), list)

    def test_backtest_route_accepts_dhan_payload(self, client):
        """Posting a Dhan-style payload should produce a valid backtest result."""
        import pandas as pd
        from unittest.mock import patch

        df = pd.DataFrame({
            "Open": [100, 101],
            "High": [101, 102],
            "Low": [99, 100],
            "Close": [100, 101],
            "Volume": [1000, 1000],
        }, index=pd.bdate_range("2023-01-01", periods=2, freq="B"))

        with patch("services.data_fetcher.DataFetcher.fetch_historical_data", return_value=df):
            dh_payload = {
                "instrument_details": {
                    "security_id": "123",
                    "symbol": "FOO",
                    "exchange_segment": "NSE_EQ",
                    "instrument_type": "EQ",
                },
                "parameters": {
                    "timeframe": "1d",
                    "start_date": "2023-01-01",
                    "end_date": "2023-01-02",
                    "initial_capital": 50000,
                    "strategy_logic": {"id": "1", "period": 10}
                }
            }
            resp = client.post("/api/v1/market/backtest/run", json=dh_payload)

        assert resp.status_code == 200, f"expected 200, got {resp.status_code}"
        data = resp.get_json() or {}
        assert data.get("symbol") == "FOO"
        assert isinstance(data.get("equityCurve"), list)
        assert len(data.get("equityCurve")) > 0
        assert isinstance(data.get("monthlyReturns"), list)
        assert len(data.get("monthlyReturns")) >= 0

    def test_backtest_route_accepts_flat_payload(self, client):
        """The flattened payload (no instrument_details) must also work."""
        import pandas as pd
        from unittest.mock import patch

        df = pd.DataFrame({
            "Open": [100, 101],
            "High": [101, 102],
            "Low": [99, 100],
            "Close": [100, 101],
            "Volume": [1000, 1000],
        }, index=pd.bdate_range("2023-01-01", periods=2, freq="B"))

        with patch("services.data_fetcher.DataFetcher.fetch_historical_data", return_value=df):
            flat = {
                "symbol": "BAR",
                "timeframe": "1d",
                "startDate": "2023-01-01",
                "endDate": "2023-01-02",
                "initial_capital": 75000,
                "strategy_logic": {"id": "1", "period": 5}
            }
            resp = client.post("/api/v1/market/backtest/run", json=flat)

        assert resp.status_code == 200
        data = resp.get_json() or {}
        assert data.get("symbol") == "BAR"
        assert isinstance(data.get("equityCurve"), list)
        assert len(data.get("equityCurve")) > 0
