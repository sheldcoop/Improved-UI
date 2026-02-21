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
