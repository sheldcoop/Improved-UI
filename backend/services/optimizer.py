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
        scoring_metric: str = "sharpe",
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
                
                if scoring_metric == "total_return":
                    score = pf.total_return()
                elif scoring_metric == "calmar":
                    # Calmar = CAGR / MaxDrawdown. VectorBT provides calmar_ratio directly as a method/property.
                    score = pf.calmar_ratio() if callable(pf.calmar_ratio) else pf.calmar_ratio
                elif scoring_metric == "drawdown":
                    # We maximize, so returning -MaxDrawdown helps Optuna find the minimum.
                    score = -abs(pf.max_drawdown())
                else: # Default: sharpe
                    score = pf.sharpe_ratio()
                
                return float(-999) if np.isnan(score) else float(score)
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
                - scoringMetric (str): Metric to optimize (default 'sharpe').
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
        metric = wfo_config.get("scoringMetric", "sharpe")

        if df is None or (isinstance(df, pd.DataFrame) and len(df) < train_window + test_window):
            return {"error": "Not enough data for WFO"}

        wfo_results: list[dict] = []
        current_idx = train_window
        run_count = 1

        while current_idx + test_window <= len(df):
            train_df = df.iloc[current_idx - train_window: current_idx]
            best_params = OptimizationEngine._find_best_params(train_df, strategy_id, ranges, metric)

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
                "returnPct": round(float(pf.total_return()) * 100, 2),
                "sharpe": round(float(pf.sharpe_ratio()), 2),
                "drawdown": round(float(abs(pf.max_drawdown())) * 100, 2),
            })
            current_idx += test_window
            run_count += 1

        return wfo_results

    @staticmethod
    def generate_wfo_portfolio(
        symbol: str,
        strategy_id: str,
        ranges: dict[str, dict],
        wfo_config: dict,
        headers: dict,
    ) -> dict:
        """Run WFO and generate a single continuous out-of-sample portfolio result.

        This method concatenates the signals from all OOS test windows and returns
        a consolidated result structure compatible with the Analytics page.
        """
        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(symbol)

        train_window = int(wfo_config.get("trainWindow", 126)) # Default ~6 months
        test_window = int(wfo_config.get("testWindow", 42))   # Default ~2 months
        metric = wfo_config.get("scoringMetric", "sharpe")

        if df is None or (isinstance(df, pd.DataFrame) and len(df) < train_window + test_window):
            return {"error": "Not enough data for concatenated WFO results."}

        # Initialize global result containers indexed like df
        all_entries = pd.Series(False, index=df.index)
        all_exits = pd.Series(False, index=df.index)
        param_history = []

        current_idx = train_window
        while current_idx + test_window <= len(df):
            # 1. Train on in-sample window
            train_df = df.iloc[current_idx - train_window : current_idx]
            best_params = OptimizationEngine._find_best_params(train_df, strategy_id, ranges, metric)
            
            # 2. Test on out-of-sample window
            test_df = df.iloc[current_idx : current_idx + test_window]
            strategy = StrategyFactory.get_strategy(strategy_id, best_params)
            entries, exits = strategy.generate_signals(test_df)
            
            # 3. Concatenate signals
            all_entries.iloc[current_idx : current_idx + test_window] = entries.values
            all_exits.iloc[current_idx : current_idx + test_window] = exits.values
            
            param_history.append({
                "start": str(test_df.index[0].date()),
                "end": str(test_df.index[-1].date()),
                "params": best_params
            })
            
            current_idx += test_window

        # 4. Filter data to only includes OOS range for the final portfolio
        # Using slice-based indexing is safe even if current_idx == len(df)
        oos_range = df.index[train_window : current_idx]
        oos_mask = df.index.isin(oos_range)
        oos_df = df.loc[oos_mask]
        oos_entries = all_entries.loc[oos_mask]
        oos_exits = all_exits.loc[oos_mask]

        if oos_df.empty:
            return {"error": "Calibration failed - no OOS data generated."}

        # 5. Run single portfolio over all concatenated segments
        # Note: VectorBT handles signal alignment automatically
        from services.backtest_engine import BacktestEngine
        
        # We use BacktestEngine's logic for consistency in extraction
        # but we need to run pf.from_signals directly here since signals are pre-filtered
        pf = vbt.Portfolio.from_signals(
            oos_df["Close"], oos_entries, oos_exits, 
            init_cash=wfo_config.get("initial_capital", 100000),
            fees=0.001, freq="1D"
        )
        
        results = BacktestEngine._extract_results(pf, oos_df)
        results["paramHistory"] = param_history
        results["isDynamic"] = True
        
        from utils.json_utils import clean_float_values
        return clean_float_values(results)

    @staticmethod
    def _find_best_params(
        df: pd.DataFrame,
        strategy_id: str,
        ranges: dict[str, dict],
        scoring_metric: str = "sharpe",
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

            try:
                strategy = StrategyFactory.get_strategy(strategy_id, config)
                entries, exits = strategy.generate_signals(df)
                
                if entries.sum() == 0:
                    return float(-999)

                pf = vbt.Portfolio.from_signals(df["Close"], entries, exits, freq="1D")
                
                if scoring_metric == "total_return":
                    score = pf.total_return()
                elif scoring_metric == "calmar":
                    score = pf.calmar_ratio() if callable(pf.calmar_ratio) else pf.calmar_ratio
                elif scoring_metric == "drawdown":
                    score = -abs(pf.max_drawdown())
                else: # Default: sharpe
                    score = pf.sharpe_ratio()
                    
                if np.isnan(score):
                    return float(-999)
                    
                logger.debug(f"Trial {trial.number}: {config} -> Score: {score:.4f}")
                return float(score)
            except Exception as e:
                logger.debug(f"Trial {trial.number} failed: {e}")
                return float(-999)

        logger.info(f"Starting Optuna search for {strategy_id} on {len(df)} bars...")
        study = optuna.create_study(direction="maximize")
        study.optimize(objective, n_trials=10)
        
        if len([t for t in study.trials if t.value is not None and t.value != -999]) == 0:
            logger.warning("Optuna found no valid parameter sets. Returning default or raising.")
            raise ValueError("Optimization failed: No valid parameter sets found in search space.")

        logger.info(f"Optuna complete. Best Params: {study.best_params} | Best Score: {study.best_value:.4f}")
        return study.best_params
