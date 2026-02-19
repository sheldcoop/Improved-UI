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
        reproducible: bool = False
    ) -> dict:
        """Run Optuna hyperparameter optimisation for a strategy.

        Args:
            symbol: Ticker symbol to fetch data for.
            strategy_id: Strategy identifier string.
            ranges: Parameter search space. Format:
                { 'paramName': { 'min': int, 'max': int, 'step': int } }
            headers: Flask request headers for API key resolution.
            n_trials: Number of Optuna trials to run. Default 30.
            scoring_metric: Metric to optimize. Default 'sharpe'.
            reproducible: Whether to use a fixed seed for Optuna. Default False.

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
        # Fix 3: Fetch ONLY the optimization window, not all history
        df = fetcher.fetch_historical_data(
            symbol,
            from_date=ranges.get("startDate"),
            to_date=ranges.get("endDate")
        )
        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            return {"error": "No data available for symbol"}

        logger.info(f"Auto-Tune Date Range: {ranges.get('startDate')} to {ranges.get('endDate')}")
        logger.info(f"Data fetched: {len(df)} bars")
        logger.info(f"First bar date: {df.index[0].date()}")
        logger.info(f"Last bar date: {df.index[-1].date()}")

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

        if len(df) > 500:
            n_trials = max(n_trials, 50)
            
        seed = 42 if reproducible else None
        sampler = optuna.samplers.TPESampler(seed=seed)
        pruner = optuna.pruners.MedianPruner(n_startup_trials=5)

        study = optuna.create_study(direction="maximize", sampler=sampler, pruner=pruner)
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
        
        # Robust Date-Based Initialization
        # current_date is the start of the first TEST window
        current_date = fetch_start_dt + relativedelta(months=train_m)
        if current_date < df.index.min():
             # Should not happen given fetch logic, but safety first
             current_date = df.index.min() + relativedelta(months=train_m)

        run_count = 1
        last_best_params = None # Fallback mechanism

        logger.info(f"--- WFO EXECUTION START (Robust) ---")
        logger.info(f"Data Range: {df.index.min().date()} to {df.index.max().date()}")

        while current_date < df.index.max():
            # Define Test Window Dates
            test_start_dt = current_date
            # Test window ends X months later
            test_end_dt = test_start_dt + relativedelta(months=test_m) - pd.Timedelta(days=1)
            
            # Define Train Window Dates (Rolling Lookback)
            # Train ends exactly yesterday relative to Test start
            train_end_dt = test_start_dt - pd.Timedelta(days=1)
            # Train starts X months before Train end
            train_start_dt = train_end_dt - relativedelta(months=train_m) + pd.Timedelta(days=1)
            
            # Stop if test window goes beyond available data
            if test_end_dt > df.index.max():
                logger.info(f"Stopping WFO: Next window ends {test_end_dt.date()} (beyond data {df.index.max().date()})")
                break

            # 1. Slice Training Data (Date-Based)
            train_df = df.loc[train_start_dt : train_end_dt]
            
            if len(train_df) < 50: 
                logger.warning(f"Window {run_count}: Insufficient training data ({len(train_df)} bars). Skipping.")
                current_date += relativedelta(months=test_m)
                continue
            
            # 2. Slice Testing Data with Warmup (Date-Based)
            test_df = df.loc[test_start_dt : test_end_dt]
            if test_df.empty:
                logger.warning(f"Window {run_count}: Empty test data. Stopping.")
                break
                
            # Warmup Slice: Extended history for indicators
            warmup_start_dt = test_start_dt - relativedelta(months=train_m)
            test_df_with_warmup = df.loc[warmup_start_dt : test_end_dt]

            logger.info(f"Window {run_count}: Train {train_start_dt.date()}->{train_end_dt.date()} | Test {test_start_dt.date()}->{test_end_dt.date()}")

            # 3. Optimize on Train Data with Fallback
            best_params = None
            try:
                best_params = OptimizationEngine._find_best_params(train_df, strategy_id, ranges, metric)
                last_best_params = best_params # Update fallback
            except Exception as e:
                logger.warning(f"Window {run_count} Optimization Failed: {e}")
                if last_best_params:
                    logger.info(f"⚠️ Using FALLBACK params from previous window: {last_best_params}")
                    best_params = last_best_params
                else:
                    logger.error(f"❌ No fallback parameters available. Skipping window.")
                    current_date += relativedelta(months=test_m)
                    run_count += 1
                    continue

            # 4. Score on Test Data
            try:
                strategy = StrategyFactory.get_strategy(strategy_id, best_params)
                
                # Generate signals on EXTENDED data
                entries_full, exits_full = strategy.generate_signals(test_df_with_warmup)
                
                # Slice signals to keep only the strict TEST period
                # Use strict date slicing on the Series for robustness
                entries = entries_full.loc[test_start_dt : test_end_dt]
                exits = exits_full.loc[test_start_dt : test_end_dt]
                
                # Robust Index Alignment
                # Reindex to match test_df to ensure 1:1 shape even if signals are sparse
                entries = entries.reindex(test_df.index).fillna(False)
                exits = exits.reindex(test_df.index).fillna(False)

                pf = vbt.Portfolio.from_signals(
                    test_df["Close"], entries, exits, freq="1D", fees=0.001
                )
                
                test_signals = int(entries.sum())
                logger.info(f"Window {run_count} Signals: {test_signals} | Params: {best_params}")

                wfo_results.append({
                    "period": f"Window {run_count}: {test_start_dt.date()} to {test_end_dt.date()}",
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

        wfo_results: list[dict] = []
        
        # Robust Date-Based Initialization
        current_date = fetch_start_dt + relativedelta(months=train_m)
        if current_date < df.index.min():
             current_date = df.index.min() + relativedelta(months=train_m)

        run_count = 1
        last_best_params = None

        logger.info(f"--- WFO PORTFOLIO EXECUTION START (Robust) ---")

        while current_date < df.index.max():
            # Define Test Window Dates
            test_start_dt = current_date
            test_end_dt = test_start_dt + relativedelta(months=test_m) - pd.Timedelta(days=1)
            
            # Define Train Window Dates
            train_end_dt = test_start_dt - pd.Timedelta(days=1)
            train_start_dt = train_end_dt - relativedelta(months=train_m) + pd.Timedelta(days=1)
            
            if test_end_dt > df.index.max():
                 break

            # 1. Slice Training Data
            train_df = df.loc[train_start_dt : train_end_dt]
            
            if len(train_df) < 50: 
                logger.warning(f"Window {run_count}: Insufficient training data. Skipping.")
                current_date += relativedelta(months=test_m)
                continue

            # 2. Slice Testing Data
            test_df = df.loc[test_start_dt : test_end_dt]
            if test_df.empty: 
                break
            
            # Warmup Slice
            warmup_start_dt = test_start_dt - relativedelta(months=train_m)
            test_df_with_warmup = df.loc[warmup_start_dt : test_end_dt]

            # 3. Optimize with Fallback
            best_params = None
            try:
                best_params = OptimizationEngine._find_best_params(train_df, strategy_id, ranges, metric)
                last_best_params = best_params
            except Exception as e:
                logger.warning(f"Window {run_count} Optimization Failed: {e}")
                if last_best_params:
                    logger.info(f"⚠️ Using FALLBACK params: {last_best_params}")
                    best_params = last_best_params
                else:
                    logger.error(f"❌ No fallback parameters. Skipping window.")
                    current_date += relativedelta(months=test_m)
                    run_count += 1
                    continue
            
            # 4. Generate Signals & Concatenate
            try:
                strategy = StrategyFactory.get_strategy(strategy_id, best_params)
                entries_full, exits_full = strategy.generate_signals(test_df_with_warmup)
                
                # Strict Slicing
                entries = entries_full.loc[test_start_dt : test_end_dt]
                exits = exits_full.loc[test_start_dt : test_end_dt]
                
                # Align with Master Index (df)
                # We need to fill ONLY the specific window in the global arrays
                # Using update() is safer than simple assignment for sparse series
                # But simple assignment with loc is fine if indices match
                entries = entries.reindex(test_df.index).fillna(False)
                exits = exits.reindex(test_df.index).fillna(False)
                
                all_entries.loc[test_start_dt : test_end_dt] = entries.values
                all_exits.loc[test_start_dt : test_end_dt] = exits.values
                
                test_signals = int(entries.sum())
                logger.info(f"WFO Window {test_start_dt.date()}->{test_end_dt.date()} | Params: {best_params} | Signals: {test_signals}")
                
                period_str = f"Window {len(param_history)+1}: {test_start_dt.date()} to {test_end_dt.date()}"
                param_history.append({
                    "period": period_str,
                    "start": str(test_start_dt.date()),
                    "end": str(test_end_dt.date()),
                    "params": str(best_params),
                    "trades": test_signals,
                    "returnPct": round(float(vbt.Portfolio.from_signals(test_df["Close"], entries, exits, freq="1D", fees=0.001).total_return()) * 100, 2),
                    "sharpe": round(float(vbt.Portfolio.from_signals(test_df["Close"], entries, exits, freq="1D", fees=0.001).sharpe_ratio()), 2)
                })
            except Exception as e:
                logger.error(f"Window {run_count} Generation Failed: {e}", exc_info=True)
            
            current_date += relativedelta(months=test_m)
            run_count += 1

        # 4. Filter data to only includes OOS range for the final portfolio
        # We start OOS exactly after the first training block
        oos_start_date = fetch_start_dt + relativedelta(months=train_m)
        oos_df = df.loc[oos_start_date:]
        
        # Align entries/exits to this OOS dataframe
        # They are already globally aligned to 'df', so just slice
        oos_entries = all_entries.loc[oos_start_date:]
        oos_exits = all_exits.loc[oos_start_date:]

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
                
                # Risk params logic removed for now
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
        
        seed = 42 if ranges.get("reproducible", False) else None
        sampler = optuna.samplers.TPESampler(seed=seed)
        pruner = optuna.pruners.MedianPruner(n_startup_trials=5)
        
        study = optuna.create_study(direction="maximize", sampler=sampler, pruner=pruner)
        
        n_trials = 30
        if len(df) > 500:
            n_trials = 50
            
        study.optimize(objective, n_trials=n_trials)
        
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
