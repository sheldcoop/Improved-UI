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
from utils.alert_manager import AlertManager

optuna.logging.set_verbosity(optuna.logging.WARNING)
logger = logging.getLogger(__name__)


class OptimizationEngine:
    """Runs Optuna-based hyperparameter search and Walk-Forward Optimization.

    All methods are static — no instance state is needed.
    """

    @staticmethod
    def month_to_bars(months: int) -> int:
        """Convert months to approximate trading days (approx 21 days/mo)."""
        return max(20, int(months * 21)) # Minimum 20 bars for technical indicators

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
        # Convert month-based windows to bars (assuming frontend sends months)
        train_m = int(wfo_config.get("trainWindow", 6))
        test_m = int(wfo_config.get("testWindow", 2))
        train_window = OptimizationEngine.month_to_bars(train_m)
        test_window = OptimizationEngine.month_to_bars(test_m)
        metric = wfo_config.get("scoringMetric", "sharpe")

        # 1. Project fetch_start backward to satisfy train_window requirements
        # Senior Developer Tip: If user wants WFO starting 2023 with 6m train, we MUST fetch from 2022-06
        from datetime import datetime
        from dateutil.relativedelta import relativedelta
        
        user_start_str = wfo_config.get("startDate")
        user_end_str = wfo_config.get("endDate")
        user_start_dt = datetime.strptime(user_start_str, "%Y-%m-%d")
        # Subtract training months + 15 day buffer for safety
        fetch_start_dt = user_start_dt - relativedelta(months=train_m) - pd.Timedelta(days=15)
        
        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(
            symbol,
            from_date=str(fetch_start_dt.date()),
            to_date=user_end_str
        )

        # 2. Adjusted Slicing: Keep the training history needed for the first window
        if df is not None and user_end_str:
            try:
                # Slice up to user_end, but keep from fetch_start (which includes training bars)
                df = df.loc[:user_end_str]
                logger.info(f"📊 Processed WFO Data: {df.index.min().date()} to {df.index.max().date()} ({len(df)} bars)")
                logger.info(f"   Target Window: {user_start_str} to {user_end_str}")
            except Exception as e:
                logger.warning(f"WFO slicing failed: {e}")

        if df is None or (isinstance(df, pd.DataFrame) and len(df) < train_window + test_window):
            needed = train_window + test_window
            found = len(df) if df is not None else 0
            return {"error": f"Not enough data for WFO. Need {needed} bars (~{needed//21}m), found {found} bars."}

        wfo_results: list[dict] = []
        current_idx = train_window
        run_count = 1

        logger.info(f"--- WFO EXECUTION START ---")
        logger.info(f"Total Bars: {len(df)} | Train Window: {train_window} | Test Window: {test_window}")

        while current_idx + test_window <= len(df):
            # 1. Slice Training Data
            train_df = df.iloc[current_idx - train_window: current_idx]
            train_start = train_df.index.min().date()
            train_end = train_df.index.max().date()
            
            # 2. Slice Testing Data with Warmup
            # We need warmup data for indicators to be valid at the start of the test window
            warmup_bars = train_window # Use train window size as safe warmup
            if current_idx - warmup_bars < 0:
                warmup_bars = current_idx # Use whatever history we have if less than train_window
            
            test_df_with_warmup = df.iloc[current_idx - warmup_bars : current_idx + test_window]
            test_df = df.iloc[current_idx: current_idx + test_window]
            
            test_start = test_df.index.min().date()
            test_end = test_df.index.max().date()

            logger.info(f"Window {run_count}: Train {train_start} -> {train_end} | Test {test_start} -> {test_end}")
            
            # Confirmation of non-overlap (strict)
            assert test_start > train_end, f"Window {run_count} Overlap Error: Test Start {test_start} is not after Train End {train_end}"

            # 3. Optimize on Train Data
            try:
                best_params = OptimizationEngine._find_best_params(train_df, strategy_id, ranges, metric)
            except Exception as e:
                logger.warning(f"Window {run_count} Optimization Failed: {e}. Skipping window.")
                current_idx += test_window
                run_count += 1
                continue

            # 4. Score on Test Data (using Warmup)
            try:
                strategy = StrategyFactory.get_strategy(strategy_id, best_params)
                
                # Generate signals on EXTENDED data
                entries_full, exits_full = strategy.generate_signals(test_df_with_warmup)
                
                # Slice signals to keep only the TEST period
                # The test period starts after 'warmup_bars' in the extended dataframe
                entries = entries_full.iloc[warmup_bars:]
                exits = exits_full.iloc[warmup_bars:]
                
                # Verify alignment
                if len(entries) != len(test_df):
                    logger.error(f"Signal slicing mismatch! Entries: {len(entries)}, TestDF: {len(test_df)}")
                    # Fallback to direct generation if slicing fails (should not happen)
                    entries, exits = strategy.generate_signals(test_df)

                pf = vbt.Portfolio.from_signals(
                    test_df["Close"], entries, exits, freq="1D", fees=0.001
                )
                
                test_signals = int(entries.sum())
                logger.info(f"Window {run_count} Signals: {test_signals} | Params: {best_params}")

                wfo_results.append({
                    "period": f"Window {run_count}: {test_start} to {test_end}",
                    "type": "TEST",
                    "params": str(best_params),
                    "returnPct": round(float(pf.total_return()) * 100, 2),
                    "sharpe": round(float(pf.sharpe_ratio()), 2),
                    "drawdown": round(float(abs(pf.max_drawdown())) * 100, 2),
                    "trades": test_signals
                })
            except Exception as e:
                logger.error(f"Window {run_count} Test Execution Failed: {e}")

            current_idx += test_window
            run_count += 1

        logger.info(f"--- WFO EXECUTION COMPLETE ---")
        
        # Add diagnostics
        alerts = AlertManager.analyze_wfo(wfo_results, df)
        return {"wfo": wfo_results, "alerts": alerts}

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
        # Convert month-based windows to bars (assuming frontend sends months)
        train_m = int(wfo_config.get("trainWindow", 6))
        test_m = int(wfo_config.get("testWindow", 2))
        train_window = OptimizationEngine.month_to_bars(train_m)
        test_window = OptimizationEngine.month_to_bars(test_m)
        metric = wfo_config.get("scoringMetric", "sharpe")

        # 1. Project fetch_start backward to satisfy train_window requirements
        from datetime import datetime
        from dateutil.relativedelta import relativedelta
        
        user_start_str = wfo_config.get("startDate")
        user_end_str = wfo_config.get("endDate")
        user_start_dt = datetime.strptime(user_start_str, "%Y-%m-%d")
        # Subtract training months + 15 day buffer for safety
        fetch_start_dt = user_start_dt - relativedelta(months=train_m) - pd.Timedelta(days=15)

        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(
            symbol,
            from_date=str(fetch_start_dt.date()),
            to_date=user_end_str
        )

        # 2. Adjusted Slicing for Portfolio
        if df is not None and user_end_str:
            try:
                df = df.loc[:user_end_str]
                logger.info(f"💾 WFO Portfolio Data: {df.index.min().date()} to {df.index.max().date()} ({len(df)} bars)")
            except Exception as e:
                logger.warning(f"Portfolio slicing failed: {e}")

        if df is None or len(df) < train_window + test_window:
            needed = train_window + test_window
            found = len(df) if df is not None else 0
            return {"error": f"Not enough data for concatenated WFO. Need {needed} bars (~{needed//21}m), found {found} bars."}

        # Initialize global result containers indexed like df
        all_entries = pd.Series(False, index=df.index)
        all_exits = pd.Series(False, index=df.index)
        param_history = []

        current_idx = train_window
        while current_idx + test_window <= len(df):
            # 1. Train on in-sample window
            train_df = df.iloc[current_idx - train_window : current_idx]
            try:
                best_params = OptimizationEngine._find_best_params(train_df, strategy_id, ranges, metric)
            except Exception as e:
                logger.warning(f"WFO Portfolio Window Optimization Failed: {e}. Skipping window.")
                current_idx += test_window
                continue
            
            # 2. Test on out-of-sample window with warmup
            warmup_bars = train_window # Use train window as warmup
            if current_idx - warmup_bars < 0: warmup_bars = current_idx
            
            test_df_with_warmup = df.iloc[current_idx - warmup_bars : current_idx + test_window]
            test_df = df.iloc[current_idx : current_idx + test_window] # Restore test_df for logging/calc
            
            strategy = StrategyFactory.get_strategy(strategy_id, best_params)
            entries_full, exits_full = strategy.generate_signals(test_df_with_warmup)
            
            # Slice to keep only test window
            entries = entries_full.iloc[warmup_bars:]
            exits = exits_full.iloc[warmup_bars:]
            
            # 3. Concatenate signals
            all_entries.iloc[current_idx : current_idx + test_window] = entries.values
            all_exits.iloc[current_idx : current_idx + test_window] = exits.values
            
            test_signals = int(entries.sum())
            logger.info(f"WFO Portfolio Window {test_df.index[0].date()}->{test_df.index[-1].date()} | Params: {best_params} | Signals: {test_signals}")
            
            period_str = f"Window {len(param_history)+1}: {test_df.index[0].date()} to {test_df.index[-1].date()}"
            param_history.append({
                "period": period_str, # Added period for WFO tab compatibility
                "start": str(test_df.index[0].date()),
                "end": str(test_df.index[-1].date()),
                "params": str(best_params), # Stringified for table display
                "trades": test_signals,
                "returnPct": round(float(vbt.Portfolio.from_signals(test_df["Close"], entries, exits, freq="1D", fees=0.001).total_return()) * 100, 2),
                "sharpe": round(float(vbt.Portfolio.from_signals(test_df["Close"], entries, exits, freq="1D", fees=0.001).sharpe_ratio()), 2)
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
        results["wfo"] = param_history # Populate wfo field for frontend DebugConsole
        results["isDynamic"] = True
        
        # Dynamic Diagnostics
        results["metrics"]["alerts"] = AlertManager.analyze_wfo(param_history, df) # Use paramHistory as proxy for windows
        
        from utils.json_utils import clean_float_values
        return clean_float_values(results)

    @staticmethod
    def _find_best_params(
        df: pd.DataFrame,
        strategy_id: str,
        ranges: dict[str, dict],
        scoring_metric: str = "sharpe",
        return_trials: bool = False
    ) -> dict | tuple[dict, list[dict]]:
        """Find best parameters for a training window using Optuna.

        Args:
            df: Training window DataFrame.
            strategy_id: Strategy identifier string.
            ranges: Parameter search space.

        Returns:
            Dict of best parameter values found by Optuna.
        """
        trial_logs = []

        def objective(trial: optuna.Trial) -> float:
            config: dict = {}
            for param, constraints in ranges.items():
                val_min = constraints.get("min")
                val_max = constraints.get("max")
                val_step = constraints.get("step")

                # Determine if float or int based on types
                msg_is_float = isinstance(val_min, float) or isinstance(val_max, float) or isinstance(val_step, float)
                
                if msg_is_float:
                    p_min = float(val_min) if val_min is not None else 0.0
                    p_max = float(val_max) if val_max is not None else 10.0
                    p_step = float(val_step) if val_step is not None else 0.1
                    config[param] = trial.suggest_float(param, p_min, p_max, step=p_step)
                else:
                    p_min = int(val_min) if val_min is not None else 10
                    p_max = int(val_max) if val_max is not None else 50
                    p_step = int(val_step) if val_step is not None else 1
                    config[param] = trial.suggest_int(param, p_min, p_max, step=p_step)

            try:
                strategy = StrategyFactory.get_strategy(strategy_id, config)
                entries, exits = strategy.generate_signals(df)
                
                trade_count = int(entries.sum())
                if trade_count == 0:
                    logger.debug(f"Trial {trial.number}: {config} -> Score: -999 (0 trades)")
                    return float(-999)

                # Pass risk params to portfolio
                # Note: tsl_stop requires sl_trail=True in vectorbt
                pf_kwargs = {"freq": "1D"}
                
                # Extract risk params from config if they were optimized
                sl_stop = config.get("sl_stop")
                tp_stop = config.get("tp_stop")
                tsl_stop = config.get("tsl_stop")

                if sl_stop: pf_kwargs["sl_stop"] = float(sl_stop) / 100.0  # Convert to decimal
                if tp_stop: pf_kwargs["tp_stop"] = float(tp_stop) / 100.0
                if tsl_stop: 
                    pf_kwargs["sl_stop"] = float(tsl_stop) / 100.0
                    pf_kwargs["sl_trail"] = True

                pf = vbt.Portfolio.from_signals(df["Close"], entries, exits, **pf_kwargs)
                
                # Calculate all metrics for reporting
                total_return = float(pf.total_return())
                sharpe = float(pf.sharpe_ratio()) if not np.isnan(pf.sharpe_ratio()) else 0.0
                max_dd = float(pf.max_drawdown())
                calmar = float(pf.calmar_ratio()) if callable(pf.calmar_ratio) else (pf.calmar_ratio if not np.isnan(pf.calmar_ratio) else 0.0)
                
                # Store in trial attributes for retrieval
                trial.set_user_attr("returnPct", total_return * 100)
                trial.set_user_attr("sharpe", sharpe)
                trial.set_user_attr("drawdown", abs(max_dd) * 100)
                trial.set_user_attr("trades", trade_count)

                if scoring_metric == "total_return":
                    score = total_return
                elif scoring_metric == "calmar":
                    score = calmar
                elif scoring_metric == "drawdown":
                    score = -abs(max_dd)
                else: # Default: sharpe
                    score = sharpe
                    
                if np.isnan(score):
                    logger.debug(f"Trial {trial.number}: {config} -> Score: -999 (NaN score)")
                    return float(-999)
                    
                logger.info(f"Trial {trial.number}: {config} | Metric: {scoring_metric} | Score: {score:.4f} | Trades: {trade_count}")
                return float(score)
            except Exception as e:
                logger.debug(f"Trial {trial.number} failed: {e}")
                return float(-999)

        logger.info(f"--- OPTIMIZATION START ---")
        logger.info(f"Metric: {scoring_metric} | Strategy: {strategy_id} | Bars: {len(df)}")
        
        study = optuna.create_study(direction="maximize")
        study.optimize(objective, n_trials=30)
        
        valid_trials = [t for t in study.trials if t.value is not None and t.value != -999]
        if len(valid_trials) == 0:
            logger.warning("Optuna found no valid parameter sets. Returning default or raising.")
            raise ValueError("Optimization failed: No valid parameter sets found in search space.")

        logger.info(f"--- OPTIMIZATION COMPLETE ---")
        logger.info(f"Best Params: {study.best_params} | Best Score: {study.best_value:.4f}")
        
        if return_trials:
            # Format trials for frontend
            grid_results = []
            for trial in study.trials:
                if trial.value is None or trial.value == -999: continue
                
                # Retrieve stored metrics or fallback to defaults
                sharpe = trial.user_attrs.get("sharpe", 0.0)
                return_pct = trial.user_attrs.get("returnPct", 0.0)
                drawdown = trial.user_attrs.get("drawdown", 0.0)
                
                grid_results.append({
                    "paramSet": trial.params,
                    "sharpe": round(sharpe, 2),
                    "returnPct": round(return_pct, 2),
                    "drawdown": round(drawdown, 2),
                    "score": round(float(trial.value), 4)
                })
            return study.best_params, grid_results

        return study.best_params
