"""Optimization service — replaces OptimizationEngine from engine.py.

Runs Optuna hyperparameter search and Walk-Forward Optimization (WFO)
for strategy parameter tuning.
"""
from __future__ import annotations


import logging
import numpy as np
import pandas as pd
import vectorbt as vbt
import optuna

from services.data_fetcher import DataFetcher
from strategies import StrategyFactory

optuna.logging.set_verbosity(optuna.logging.WARNING)
logger = logging.getLogger(__name__)


class OptimizationEngine:
    """Runs Optuna-based hyperparameter search and Walk-Forward Optimization.

    All methods are static — no instance state is needed.
    """

    @staticmethod
    def run_optuna(
        symbol: str,
        strategy_id: str,
        ranges: dict[str, dict],
        headers: dict,
        n_trials: int = 30,
    ) -> dict:
        """Run Optuna hyperparameter optimisation for a strategy.

        Args:
            symbol: Ticker symbol to fetch data for.
            strategy_id: Strategy identifier string.
            ranges: Parameter search space. Format:
                { 'paramName': { 'min': int, 'max': int, 'step': int } }
            headers: Flask request headers for API key resolution.
            n_trials: Number of Optuna trials to run. Default 30.

        Returns:
            Dict with key 'grid' (list of trial results) and 'wfo' (empty list).
            Each grid item has: paramSet, sharpe, returnPct, drawdown.
            Returns {'error': str} if data fetch fails.

        Example:
            >>> result = OptimizationEngine.run_optuna(
            ...     'NIFTY 50', '3', {'fast': {'min': 5, 'max': 20, 'step': 1}},
            ...     headers, n_trials=20
            ... )
            >>> print(result['grid'][0]['sharpe'])
            1.42
        """
        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(symbol)
        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            return {"error": "No data available for symbol"}

        def objective(trial: optuna.Trial) -> float:
            config: dict = {}
            for param, constraints in ranges.items():
                p_min = int(constraints.get("min", 10))
                p_max = int(constraints.get("max", 50))
                p_step = int(constraints.get("step", 1))
                config[param] = trial.suggest_int(param, p_min, p_max, step=p_step)

            strategy = StrategyFactory.get_strategy(strategy_id, config)
            try:
                entries, exits = strategy.generate_signals(df)
                pf = vbt.Portfolio.from_signals(
                    df["Close"], entries, exits, freq="1D", fees=0.001
                )
                sharpe = pf.sharpe_ratio()
                return float(-999) if np.isnan(sharpe) else float(sharpe)
            except Exception:
                return float(-999)

        study = optuna.create_study(direction="maximize")
        study.optimize(objective, n_trials=n_trials)

        grid_results: list[dict] = []
        for trial in study.trials:
            if trial.value is None or trial.value == -999:
                continue
            config = trial.params
            strategy = StrategyFactory.get_strategy(strategy_id, config)
            entries, exits = strategy.generate_signals(df)
            pf = vbt.Portfolio.from_signals(
                df["Close"], entries, exits, freq="1D", fees=0.001
            )
            grid_results.append({
                "paramSet": trial.params,
                "sharpe": round(pf.sharpe_ratio(), 2),
                "returnPct": round(pf.total_return() * 100, 2),
                "drawdown": round(abs(pf.max_drawdown()) * 100, 2),
            })

        return {"grid": grid_results, "wfo": []}

    @staticmethod
    def run_wfo(
        symbol: str,
        strategy_id: str,
        ranges: dict[str, dict],
        wfo_config: dict,
        headers: dict,
    ) -> list[dict] | dict:
        """Run Walk-Forward Optimisation across rolling train/test windows.

        Args:
            symbol: Ticker symbol to fetch data for.
            strategy_id: Strategy identifier string.
            ranges: Parameter search space (same format as run_optuna).
            wfo_config: WFO window config. Keys:
                - trainWindow (int): Number of bars for training. Default 100.
                - testWindow (int): Number of bars for testing. Default 30.
            headers: Flask request headers for API key resolution.

        Returns:
            List of WFO window result dicts, each with:
            period, type, params, returnPct, sharpe, drawdown.
            Returns {'error': str} if data is insufficient.
        """
        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(symbol)

        train_window = int(wfo_config.get("trainWindow", 100))
        test_window = int(wfo_config.get("testWindow", 30))

        if df is None or (isinstance(df, pd.DataFrame) and len(df) < train_window + test_window):
            return {"error": "Not enough data for WFO"}

        wfo_results: list[dict] = []
        current_idx = train_window
        run_count = 1

        while current_idx + test_window <= len(df):
            train_df = df.iloc[current_idx - train_window: current_idx]
            best_params = OptimizationEngine._find_best_params(train_df, strategy_id, ranges)

            test_df = df.iloc[current_idx: current_idx + test_window]
            strategy = StrategyFactory.get_strategy(strategy_id, best_params)
            entries, exits = strategy.generate_signals(test_df)
            pf = vbt.Portfolio.from_signals(
                test_df["Close"], entries, exits, freq="1D", fees=0.001
            )
            wfo_results.append({
                "period": f"Window {run_count}",
                "type": "TEST",
                "params": str(best_params),
                "returnPct": round(pf.total_return() * 100, 2),
                "sharpe": round(pf.sharpe_ratio(), 2),
                "drawdown": round(abs(pf.max_drawdown()) * 100, 2),
            })
            current_idx += test_window
            run_count += 1

        return wfo_results

    @staticmethod
    def _find_best_params(
        df: pd.DataFrame,
        strategy_id: str,
        ranges: dict[str, dict],
    ) -> dict:
        """Find best parameters for a training window using Optuna.

        Args:
            df: Training window DataFrame.
            strategy_id: Strategy identifier string.
            ranges: Parameter search space.

        Returns:
            Dict of best parameter values found by Optuna.
        """
        def objective(trial: optuna.Trial) -> float:
            config: dict = {}
            for param, constraints in ranges.items():
                p_min = int(constraints.get("min", 10))
                p_max = int(constraints.get("max", 50))
                p_step = int(constraints.get("step", 1))
                config[param] = trial.suggest_int(param, p_min, p_max, step=p_step)

            strategy = StrategyFactory.get_strategy(strategy_id, config)
            entries, exits = strategy.generate_signals(df)
            return float(
                vbt.Portfolio.from_signals(df["Close"], entries, exits, freq="1D").sharpe_ratio()
            )

        study = optuna.create_study(direction="maximize")
        study.optimize(objective, n_trials=10)
        return study.best_params
