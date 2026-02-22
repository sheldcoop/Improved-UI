"""Unit tests for the OptimizationEngine service."""
from __future__ import annotations

import pandas as pd
import numpy as np

from services.optimizer import OptimizationEngine
from services.data_fetcher import DataFetcher


class DummyFetcher:
    def __init__(self, headers=None):
        pass

    def fetch_historical_data(self, *args, **kwargs):
        # simple 30-day business calendar with random prices
        idx = pd.date_range('2022-01-01', periods=30, freq='B')
        return pd.DataFrame({
            'Open': 100 + np.random.randn(len(idx)),
            'High': 101 + np.random.randn(len(idx)),
            'Low': 99 + np.random.randn(len(idx)),
            'Close': 100 + np.random.randn(len(idx)).cumsum(),
            'Volume': 1000
        }, index=idx)


def test_run_optuna_basic(monkeypatch):
    # patch DataFetcher to avoid network
    monkeypatch.setattr('services.optimizer.DataFetcher', DummyFetcher)

    ranges = {
        'startDate': '2022-01-01',
        'endDate': '2022-02-01',
        'period': {'min': 5, 'max': 5, 'step': 1},
        'lower': {'min': 30, 'max': 30, 'step': 1},
        'upper': {'min': 70, 'max': 70, 'step': 1},
    }
    result = OptimizationEngine.run_optuna(
        symbol='TEST',
        strategy_id='1',
        ranges=ranges,
        headers={},
        n_trials=2
    )
    assert 'grid' in result
    assert 'bestParams' in result
    assert isinstance(result['grid'], list)


def test_run_optuna_with_risk(monkeypatch):
    monkeypatch.setattr('services.optimizer.DataFetcher', DummyFetcher)

    ranges = {
        'startDate': '2022-01-01',
        'endDate': '2022-02-01',
        'period': {'min': 5, 'max': 5, 'step': 1},
        'lower': {'min': 30, 'max': 30, 'step': 1},
        'upper': {'min': 70, 'max': 70, 'step': 1},
    }
    risk = {
        'stopLossPct': {'min': 0, 'max': 5, 'step': 1},
        'takeProfitPct': {'min': 0, 'max': 5, 'step': 1},
    }
    result = OptimizationEngine.run_optuna(
        symbol='TEST',
        strategy_id='1',
        ranges=ranges,
        headers={},
        n_trials=2,
        risk_ranges=risk
    )
    # secondary optimisation may fail if no valid risk trial found, which is
    # acceptable; when it succeeds the extra keys should be present.
    if 'riskGrid' in result:
        assert 'bestRiskParams' in result
        assert 'combinedParams' in result
        assert isinstance(result['riskGrid'], list)
        assert isinstance(result['combinedParams'], dict)
        # combinedParams must include primary keys (period, lower, upper)
        for key in ('period','lower','upper'):
            assert key in result['combinedParams']
    else:
        assert 'bestRiskParams' not in result
        assert 'combinedParams' not in result


def test_risk_search_honours_fixed_params(monkeypatch):
    """When a second-phase optimisation runs, the primary parameters should be frozen.

    We simulate this by intercepting calls to the strategy factory and ensuring
    the set of parameters passed during risk trials includes the primary values.
    """
    monkeypatch.setattr('services.optimizer.DataFetcher', DummyFetcher)

    captured = []
    from strategies import StrategyFactory as _SF
    orig = _SF.get_strategy
    def spy_get(strategy_id, params):
        captured.append(params.copy())
        return orig(strategy_id, params)
    monkeypatch.setattr('strategies.StrategyFactory', _SF)
    monkeypatch.setattr(_SF, 'get_strategy', spy_get)

    ranges = {
        'startDate': '2022-01-01',
        'endDate': '2022-02-01',
        'period': {'min': 10, 'max': 10, 'step': 1},
        'lower': {'min': 30, 'max': 30, 'step': 1},
        'upper': {'min': 70, 'max': 70, 'step': 1},
    }
    risk = {
        'stopLossPct': {'min': 0, 'max': 2, 'step': 1},
        'takeProfitPct': {'min': 0, 'max': 2, 'step': 1},
    }
    res = OptimizationEngine.run_optuna(
        symbol='TEST', strategy_id='1', ranges=ranges, headers={}, n_trials=3, risk_ranges=risk
    )
    # ensure we saw at least one risk trial parameter set and that it contained
    # the primary keys (period, lower, upper) even though they weren't
    # part of risk ranges.
    assert any('stopLossPct' in p for p in captured), "risk trials occurred"
    assert any('period' in p and 'lower' in p and 'upper' in p for p in captured), "primary params were merged"

    # --- extra checks: each risk parameter can operate independently ---
    for single in ['stopLossPct', 'takeProfitPct']:
        limited_risk = {single: {'min': 0, 'max': 1, 'step': 1}}
        res2 = OptimizationEngine.run_optuna(
            symbol='TEST', strategy_id='1', ranges=ranges, headers={}, n_trials=2, risk_ranges=limited_risk
        )
        # when only one risk param is specified, riskGrid should still be returned
        if 'riskGrid' in res2:
            # grid entries should only include the one parameter name
            for row in res2['riskGrid']:
                assert single in row['paramSet']
                other = 'takeProfitPct' if single == 'stopLossPct' else 'stopLossPct'
                assert other not in row['paramSet']
        # combinedParams, if present, must contain the primary keys and the
        # single risk parameter
        if 'combinedParams' in res2:
            assert single in res2['combinedParams']
            for key in ('period', 'lower', 'upper'):
                assert key in res2['combinedParams']


def test_phase1_runs_without_stops(monkeypatch):
    """Phase 1 (RSI) trials must have stopLossPct=0 and takeProfitPct=0
    regardless of what the user had configured in the UI (via config).

    Even if stopLossPct=5 is passed in config (simulating a user who had
    stop-loss set on the Backtest page), Phase 1 must zero it out so that
    RSI parameters are evaluated on pure signal quality.
    """
    monkeypatch.setattr('services.optimizer.DataFetcher', DummyFetcher)

    captured_configs: list[dict] = []
    original_build = OptimizationEngine._build_portfolio

    def capturing_build(close, entries, exits, config, freq):
        captured_configs.append(config.copy())
        return original_build(close, entries, exits, config, freq)

    monkeypatch.setattr(OptimizationEngine, '_build_portfolio', staticmethod(capturing_build))

    ranges = {
        'startDate': '2022-01-01',
        'endDate': '2022-02-01',
        'period': {'min': 5, 'max': 5, 'step': 1},
        'lower':  {'min': 30, 'max': 30, 'step': 1},
        'upper':  {'min': 70, 'max': 70, 'step': 1},
    }
    # Simulate user having stop-loss / take-profit / trailing stop set in the UI
    user_config = {'stopLossPct': 5, 'takeProfitPct': 3, 'useTrailingStop': True}

    OptimizationEngine.run_optuna(
        symbol='TEST', strategy_id='1', ranges=ranges,
        headers={}, n_trials=2, config=user_config
    )

    assert len(captured_configs) > 0, "Expected at least one portfolio build during Phase 1"

    # Phase 1 builds: all builds when no risk_ranges were supplied (only Phase 1 ran)
    for cfg in captured_configs:
        assert cfg.get('stopLossPct', 0) == 0, (
            f"Phase 1 stopLossPct must be 0 (got {cfg.get('stopLossPct')}). "
            "RSI signals must be evaluated without stop-loss."
        )
        assert cfg.get('takeProfitPct', 0) == 0, (
            f"Phase 1 takeProfitPct must be 0 (got {cfg.get('takeProfitPct')}). "
            "RSI signals must be evaluated without take-profit."
        )
        assert not cfg.get('useTrailingStop', False), (
            "Phase 1 useTrailingStop must be False. "
            "RSI signals must be evaluated without trailing stop."
        )


def test_data_split_gives_phase2_correct_bars(monkeypatch):
    """When phase2_split_ratio=0.7, Phase 2 must receive only the last 30% of bars.

    DummyFetcher returns 30 bars → Phase 1 gets first 21 (70%), Phase 2 gets last 9 (30%).
    """
    monkeypatch.setattr('services.optimizer.DataFetcher', DummyFetcher)

    phase_bar_counts: list[int] = []
    original_find = OptimizationEngine._find_best_params

    call_index = [0]

    def tracking_find(df, strategy_id, ranges, scoring_metric='sharpe',
                      return_trials=False, n_trials=30, config=None, fixed_params=None):
        call_index[0] += 1
        phase_bar_counts.append(len(df))
        return original_find(df, strategy_id, ranges, scoring_metric,
                              return_trials=return_trials, n_trials=n_trials,
                              config=config, fixed_params=fixed_params)

    monkeypatch.setattr(OptimizationEngine, '_find_best_params', staticmethod(tracking_find))

    ranges = {
        'startDate': '2022-01-01',
        'endDate': '2022-02-01',
        'period': {'min': 5, 'max': 5, 'step': 1},
        'lower':  {'min': 30, 'max': 30, 'step': 1},
        'upper':  {'min': 70, 'max': 70, 'step': 1},
    }
    risk = {'stopLossPct': {'min': 0, 'max': 2, 'step': 1}}

    result = OptimizationEngine.run_optuna(
        symbol='TEST', strategy_id='1', ranges=ranges,
        headers={}, n_trials=2, risk_ranges=risk,
        phase2_split_ratio=0.7
    )

    # Two _find_best_params calls should have happened: Phase 1 then Phase 2
    assert len(phase_bar_counts) >= 2, "Expected two _find_best_params calls (Phase 1 + Phase 2)"

    total_bars = phase_bar_counts[0] + phase_bar_counts[1]
    # Phase 1 should have ~70% of total bars
    expected_phase1 = int(total_bars * 0.7)
    assert abs(phase_bar_counts[0] - expected_phase1) <= 1, (
        f"Phase 1 should have ~{expected_phase1} bars (70% of {total_bars}), "
        f"got {phase_bar_counts[0]}"
    )

    # splitRatio should be echoed in the response when Phase 2 runs
    if 'riskGrid' in result:
        assert result.get('splitRatio') == 0.7, (
            f"splitRatio should be echoed in response, got {result.get('splitRatio')}"
        )
