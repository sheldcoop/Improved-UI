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
    def _detect_freq(df: pd.DataFrame) -> str:
        """Detect VectorBT-compatible frequency string from DataFrame time delta.

        Mirrors the same logic used in BacktestEngine so Sharpe/Calmar
        annualization is correct for intraday data.

        Args:
            df: OHLCV DataFrame with a DatetimeIndex.

        Returns:
            VBT frequency string (e.g. '1m', '5m', '15m', '1h', '1D').
        """
        try:
            if len(df) > 1:
                diff = df.index[1] - df.index[0]
                minutes = int(diff.total_seconds() / 60)
                if minutes == 1:
                    return "1m"
                elif minutes == 5:
                    return "5m"
                elif minutes == 15:
                    return "15m"
                elif minutes == 60:
                    return "1h"
        except Exception:
            pass
        return "1D"

    @staticmethod
    def run_optuna(
        symbol: str,
        strategy_id: str,
        ranges: dict[str, dict],
        headers: dict,
        n_trials: int = 30,
        scoring_metric: str = "sharpe",
        reproducible: bool = False,
        config: dict | None = None
    ) -> dict:
        """Run Optuna hyperparameter optimisation for a strategy."""
        if config is None: config = {}
        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(
            symbol,
            from_date=ranges.get("startDate"),
            to_date=ranges.get("endDate")
        )
        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            return {"error": "No data available for symbol"}

        logger.info(f"Optimization Range: {ranges.get('startDate')} to {ranges.get('endDate')} ({len(df)} bars)")
        
        # Use our consolidated search engine
        ranges["reproducible"] = reproducible
        best_params, grid = OptimizationEngine._find_best_params(
            df, strategy_id, ranges, scoring_metric, return_trials=True, n_trials=n_trials, config=config
        )

        return {"grid": grid, "wfo": [], "bestParams": best_params}

    @staticmethod
    def _fetch_and_prepare_df(
        symbol: str,
        wfo_config: dict,
        headers: dict,
        train_m: int,
        test_m: int,
        label: str = "WFO",
    ) -> tuple[pd.DataFrame | None, object, object]:
        """Fetch and slice data for a WFO run, projecting back to cover the training window.

        Args:
            symbol: Ticker symbol to fetch.
            wfo_config: WFO config with startDate and endDate.
            headers: Flask request headers.
            train_m: Training window in months.
            test_m: Testing window in months.
            label: Log label string for the calling context.

        Returns:
            Tuple of (df, fetch_start_dt, relativedelta) or (None, ...) on failure.
        """
        from datetime import datetime
        from dateutil.relativedelta import relativedelta

        user_start_str = wfo_config.get("startDate")
        user_end_str = wfo_config.get("endDate")
        user_start_dt = datetime.strptime(user_start_str, "%Y-%m-%d")
        # NOTE: fetch_start_dt reaches back before user_start_dt by one full training
        # window plus a 15-day buffer. This is intentional: Window 1 needs train_m months
        # of historical data before the user's requested startDate. Consequently, Window 1's
        # test period will begin roughly 15 days before user_start_dt, not exactly on it.
        fetch_start_dt = user_start_dt - relativedelta(months=train_m) - pd.Timedelta(days=15)

        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(
            symbol,
            from_date=str(fetch_start_dt.date()),
            to_date=user_end_str,
        )

        if df is not None and user_end_str:
            try:
                df = df.loc[:user_end_str]
                logger.info(
                    f"📊 {label} Data: {df.index.min().date()} to {df.index.max().date()} ({len(df)} bars)"
                )
            except Exception as e:
                logger.warning(f"{label} slicing failed: {e}")

        return df, fetch_start_dt, relativedelta

    @staticmethod
    def _wfo_loop(
        df: pd.DataFrame,
        strategy_id: str,
        ranges: dict[str, dict],
        metric: str,
        vbt_freq: str,
        train_m: int,
        test_m: int,
        fetch_start_dt: object,
        collect_signals: bool = False,
    ) -> dict:
        """Core Walk-Forward loop shared by run_wfo() and generate_wfo_portfolio().

        Iterates rolling train/test windows, optimises on training data, and
        scores on out-of-sample test data.

        Args:
            df: Full OHLCV DataFrame (includes training lookback).
            strategy_id: Strategy identifier string.
            ranges: Parameter search space.
            metric: Scoring metric for Optuna ('sharpe', 'total_return', etc.).
            vbt_freq: VBT-compatible frequency string (e.g. '1D', '1h').
            train_m: Training window in months.
            test_m: Testing window in months.
            fetch_start_dt: Start of the fetched data range (a datetime).
            collect_signals: If True, accumulate concatenated entry/exit signals
                and per-window param_history for portfolio construction.

        Returns:
            Dict with keys:
              - 'wfo_results': list of per-window result dicts
              - 'all_entries': pd.Series of concatenated entries (if collect_signals)
              - 'all_exits': pd.Series of concatenated exits (if collect_signals)
              - 'param_history': list of per-window param dicts (if collect_signals)
        """
        from dateutil.relativedelta import relativedelta

        wfo_results: list[dict] = []
        all_entries = pd.Series(False, index=df.index) if collect_signals else None
        all_exits = pd.Series(False, index=df.index) if collect_signals else None
        param_history: list[dict] = [] if collect_signals else []
        all_trials: list[dict] = []  # accumulated Optuna trials across all windows

        current_date = fetch_start_dt + relativedelta(months=train_m)
        if current_date < df.index.min():
            current_date = df.index.min() + relativedelta(months=train_m)

        run_count = 1
        last_best_params = None

        logger.info(f"--- WFO LOOP START | Data: {df.index.min().date()} to {df.index.max().date()} ---")

        while current_date < df.index.max():
            test_start_dt = current_date
            test_end_dt = test_start_dt + relativedelta(months=test_m) - pd.Timedelta(days=1)
            train_end_dt = test_start_dt - pd.Timedelta(days=1)
            train_start_dt = train_end_dt - relativedelta(months=train_m) + pd.Timedelta(days=1)

            if test_end_dt > df.index.max():
                logger.info(f"Stopping WFO: window ends {test_end_dt.date()} (beyond data {df.index.max().date()})")
                break

            train_df = df.loc[train_start_dt : train_end_dt]
            if len(train_df) < 50:
                logger.warning(f"Window {run_count}: Insufficient training data ({len(train_df)} bars). Skipping.")
                current_date += relativedelta(months=test_m)
                continue

            test_df = df.loc[test_start_dt : test_end_dt]
            if test_df.empty:
                logger.warning(f"Window {run_count}: Empty test data. Stopping.")
                break

            logger.info(
                f"Window {run_count}: Train {train_start_dt.date()}->{train_end_dt.date()} "
                f"| Test {test_start_dt.date()}->{test_end_dt.date()}"
            )

            # --- Optimise on training data ---
            best_params = None
            using_fallback = False
            window_trials: list[dict] = []
            try:
                best_params, window_trials = OptimizationEngine._find_best_params(
                    train_df, strategy_id, ranges, metric, return_trials=True
                )
                all_trials.extend(window_trials)
                last_best_params = best_params
            except Exception as e:
                logger.warning(f"Window {run_count} Optimization Failed: {e}")
                if last_best_params:
                    logger.info(f"Using FALLBACK params from previous window: {last_best_params}")
                    best_params = last_best_params
                    using_fallback = True
                else:
                    logger.error(f"No fallback parameters available. Skipping window.")
                    current_date += relativedelta(months=test_m)
                    run_count += 1
                    continue

            # --- Score on test data ---
            try:
                strategy = StrategyFactory.get_strategy(strategy_id, best_params)
                # Generate signals on test_df only (no warmup) so Sharpe reflects
                # a clean out-of-sample period without indicator warm-up bias.
                entries_full, exits_full = strategy.generate_signals(test_df)

                entries = entries_full.reindex(test_df.index).fillna(False)
                exits = exits_full.reindex(test_df.index).fillna(False)

                pf = vbt.Portfolio.from_signals(
                    test_df["Close"], entries, exits, freq=vbt_freq, fees=0.001
                )
                test_signals = int(entries.sum())
                if test_signals < 5:
                    logger.warning(
                        f"Window {run_count}: Insufficient trades ({test_signals} < 5). "
                        f"Skipping window {test_start_dt.date()} to {test_end_dt.date()}"
                    )
                    current_date += relativedelta(months=test_m)
                    run_count += 1
                    continue
                logger.info(f"Window {run_count} Signals: {test_signals} | Params: {best_params}")

                window_result = {
                    "period": f"Window {run_count}: {test_start_dt.date()} to {test_end_dt.date()}",
                    "type": "TEST",
                    "params": str(best_params),
                    "usingFallback": using_fallback,
                    "returnPct": round(float(pf.total_return()) * 100, 2),
                    "sharpe": round(float(pf.sharpe_ratio()), 2),
                    "drawdown": round(float(abs(pf.max_drawdown())) * 100, 2),
                    "trades": test_signals,
                }
                wfo_results.append(window_result)

                if collect_signals:
                    all_entries.loc[test_start_dt : test_end_dt] = entries.values
                    all_exits.loc[test_start_dt : test_end_dt] = exits.values
                    param_history.append({
                        "period": window_result["period"],
                        "start": str(test_start_dt.date()),
                        "end": str(test_end_dt.date()),
                        "params": best_params,  # dict → JSON object so frontend can Object.entries()
                        "usingFallback": using_fallback,
                        "trades": test_signals,
                        "returnPct": window_result["returnPct"],
                        "sharpe": window_result["sharpe"],
                    })

            except Exception as e:
                logger.error(f"Window {run_count} Test Execution Failed: {e}")

            current_date += relativedelta(months=test_m)
            run_count += 1

        logger.info("--- WFO LOOP COMPLETE ---")
        return {
            "wfo_results": wfo_results,
            "all_entries": all_entries,
            "all_exits": all_exits,
            "param_history": param_history,
            "grid": all_trials,
        }

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
                - trainWindow (int): Training window in months. Default 6.
                - testWindow (int): Testing window in months. Default 2.
                - scoringMetric (str): Metric to optimize. Default 'sharpe'.
                - startDate (str): Start date 'YYYY-MM-DD'.
                - endDate (str): End date 'YYYY-MM-DD'.
            headers: Flask request headers for API key resolution.

        Returns:
            Dict with 'wfo' (list of window results) and 'alerts'.
            Returns {'error': str} if data is insufficient.
        """
        train_m = int(wfo_config.get("trainWindow", 6))
        test_m = int(wfo_config.get("testWindow", 2))
        train_window = OptimizationEngine.month_to_bars(train_m)
        test_window = OptimizationEngine.month_to_bars(test_m)
        metric = wfo_config.get("scoringMetric", "sharpe")

        df, fetch_start_dt, _ = OptimizationEngine._fetch_and_prepare_df(
            symbol, wfo_config, headers, train_m, test_m, label="WFO"
        )

        if df is None or (isinstance(df, pd.DataFrame) and len(df) < train_window + test_window):
            needed = train_window + test_window
            found = len(df) if df is not None else 0
            return {"error": f"Not enough data for WFO. Need {needed} bars (~{needed//21}m), found {found} bars."}

        vbt_freq = OptimizationEngine._detect_freq(df)
        loop = OptimizationEngine._wfo_loop(
            df, strategy_id, ranges, metric, vbt_freq,
            train_m, test_m, fetch_start_dt, collect_signals=False,
        )
        wfo_results = loop["wfo_results"]
        alerts = AlertManager.analyze_wfo(wfo_results, df)
        return {"wfo": wfo_results, "alerts": alerts, "grid": loop["grid"]}

    @staticmethod
    def generate_wfo_portfolio(
        symbol: str,
        strategy_id: str,
        ranges: dict[str, dict],
        wfo_config: dict,
        headers: dict,
    ) -> dict:
        """Run WFO and return a single continuous out-of-sample portfolio result.

        Concatenates all OOS test-window signals into a single portfolio and
        returns a result structure compatible with the Analytics page.

        Args:
            symbol: Ticker symbol to fetch data for.
            strategy_id: Strategy identifier string.
            ranges: Parameter search space.
            wfo_config: WFO config (same keys as run_wfo).
            headers: Flask request headers for API key resolution.

        Returns:
            Consolidated backtest result dict with paramHistory and wfo fields,
            or {'error': str} if data is insufficient.
        """
        train_m = int(wfo_config.get("trainWindow", 6))
        test_m = int(wfo_config.get("testWindow", 2))
        train_window = OptimizationEngine.month_to_bars(train_m)
        test_window = OptimizationEngine.month_to_bars(test_m)
        metric = wfo_config.get("scoringMetric", "sharpe")

        df, fetch_start_dt, relativedelta = OptimizationEngine._fetch_and_prepare_df(
            symbol, wfo_config, headers, train_m, test_m, label="WFO Portfolio"
        )

        if df is None or len(df) < train_window + test_window:
            needed = train_window + test_window
            found = len(df) if df is not None else 0
            return {"error": f"Not enough data for concatenated WFO. Need {needed} bars (~{needed//21}m), found {found} bars."}

        vbt_freq = OptimizationEngine._detect_freq(df)
        loop = OptimizationEngine._wfo_loop(
            df, strategy_id, ranges, metric, vbt_freq,
            train_m, test_m, fetch_start_dt, collect_signals=True,
        )
        param_history = loop["param_history"]
        all_entries = loop["all_entries"]
        all_exits = loop["all_exits"]

        # Slice to the OOS range (after the first training block)
        from dateutil.relativedelta import relativedelta as _relativedelta
        oos_start_date = fetch_start_dt + _relativedelta(months=train_m)
        oos_df = df.loc[oos_start_date:]
        oos_entries = all_entries.loc[oos_start_date:]
        oos_exits = all_exits.loc[oos_start_date:]

        if oos_df.empty:
            return {"error": "Calibration failed - no OOS data generated."}

        pf = vbt.Portfolio.from_signals(
            oos_df["Close"], oos_entries, oos_exits,
            init_cash=wfo_config.get("initial_capital", 100000),
            fees=float(wfo_config.get("commission", 20.0)) / float(wfo_config.get("positionSizeValue", 100000)) if float(wfo_config.get("positionSizeValue", 100000)) > 0 else 0.001,
            slippage=float(wfo_config.get("slippage", 0.05)) / 100.0,
            freq=vbt_freq,
        )

        results = BacktestEngine._extract_results(pf, oos_df)
        results["paramHistory"] = param_history
        results["wfo"] = param_history
        results["isDynamic"] = True
        results["grid"] = loop["grid"]
        results["metrics"]["alerts"] = AlertManager.analyze_wfo(param_history, df)

        from utils.json_utils import clean_float_values
        return clean_float_values(results)

    @staticmethod
    def _find_best_params(
        df: pd.DataFrame,
        strategy_id: str,
        ranges: dict[str, dict],
        scoring_metric: str = "sharpe",
        return_trials: bool = False,
        n_trials: int = 30,
        config: dict | None = None
    ) -> dict | tuple[dict, list[dict]]:
        """Find best parameters for a training window using Optuna."""
        if config is None: config = {}
        trial_logs = []

        # Normalize columns consistency (Issue #Alignment)
        if isinstance(df, pd.DataFrame):
            df.columns = [c.capitalize() for c in df.columns]

        # Non-parameter keys injected by routes (startDate, endDate, reproducible) — skip them
        _META_KEYS = frozenset({"startDate", "endDate", "reproducible"})

        def objective(trial: optuna.Trial) -> float:
            trial_params: dict = {}
            for param, constraints in ranges.items():
                if param in _META_KEYS:
                    continue
                if not isinstance(constraints, dict):
                    continue  # skip non-dict values (e.g. injected strings)
                val_min = constraints.get("min")
                val_max = constraints.get("max")
                val_step = constraints.get("step")

                # Determine if float or int based on types
                msg_is_float = isinstance(val_min, float) or isinstance(val_max, float) or isinstance(val_step, float)
                
                if msg_is_float:
                    p_min = float(val_min) if val_min is not None else 0.0
                    p_max = float(val_max) if val_max is not None else 10.0
                    p_step = float(val_step) if val_step is not None else 0.1
                    trial_params[param] = trial.suggest_float(param, p_min, p_max, step=p_step)
                else:
                    p_min = int(val_min) if val_min is not None else 10
                    p_max = int(val_max) if val_max is not None else 50
                    p_step = int(val_step) if val_step is not None else 1
                    trial_params[param] = trial.suggest_int(param, p_min, p_max, step=p_step)

            try:
                strategy = StrategyFactory.get_strategy(strategy_id, trial_params)
                entries, exits = strategy.generate_signals(df)
                
                # Apply Backtest Settings (Issue #ResultAlignment)
                bt_slippage = float(config.get("slippage", 0.05)) / 100.0
                bt_initial_capital = float(config.get("initial_capital", 100000.0))
                bt_commission_fixed = float(config.get("commission", 20.0))
                
                # Sizing logic (Keep internal to avoid circular imports with BacktestEngine)
                sizing_mode = config.get("positionSizing", "Fixed Capital")
                bt_size_val = float(config.get("positionSizeValue", bt_initial_capital))
                if sizing_mode == "Fixed Capital":
                    bt_size, bt_size_type = bt_size_val, "value"
                elif sizing_mode == "% of Equity":
                    bt_size, bt_size_type = bt_size_val / 100.0, "percent"
                else:
                    bt_size, bt_size_type = np.inf, "amount"

                bt_fees = bt_commission_fixed / bt_size_val if bt_size_val > 0 else 0.001
                
                # Stop Loss / Take Profit
                sl_pct = float(config.get("stopLossPct", 0)) / 100.0
                tp_pct = float(config.get("takeProfitPct", 0)) / 100.0

                pf_kwargs = {
                    "freq": vbt_freq, 
                    "fees": bt_fees, 
                    "slippage": bt_slippage, 
                    "init_cash": bt_initial_capital,
                    "size": bt_size,
                    "size_type": bt_size_type,
                    "accumulate": int(config.get("pyramiding", 1)) > 1
                }
                if sl_pct > 0:
                    pf_kwargs["sl_stop"] = sl_pct
                    if bool(config.get("useTrailingStop", False)):
                        pf_kwargs["sl_trail"] = True
                if tp_pct > 0:
                    pf_kwargs["tp_stop"] = tp_pct

                pf = vbt.Portfolio.from_signals(df["Close"], entries, exits, **pf_kwargs)
                
                trade_count = int(pf.trades.count())
                if trade_count == 0:
                    logger.debug(f"Trial {trial.number}: {trial_params} -> Score: -999 (0 trades)")
                    return float(-999)
                
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
                
                # FIX: pf.win_rate -> pf.trades.win_rate
                win_rate = 0.0
                try:
                    win_rate = float(pf.trades.win_rate()) * 100
                except (AttributeError, ValueError):
                    pass
                trial.set_user_attr("winRate", win_rate)

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

        vbt_freq = OptimizationEngine._detect_freq(df)

        logger.info(f"--- OPTIMIZATION START ---")
        logger.info(f"Metric: {scoring_metric} | Strategy: {strategy_id} | Bars: {len(df)} | Freq: {vbt_freq}")
        
        seed = 42 if ranges.get("reproducible", False) else None
        sampler = optuna.samplers.TPESampler(seed=seed)
        pruner = optuna.pruners.MedianPruner(n_startup_trials=5)
        
        study = optuna.create_study(direction="maximize", sampler=sampler, pruner=pruner)
        
        if n_trials == 30 and len(df) > 500:
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
                    "trades": int(trial.user_attrs.get("trades", 0)),
                    "winRate": round(float(trial.user_attrs.get("winRate", 0.0)), 1),
                    "score": round(float(trial.value), 4)
                })
            
            # Sort by score descending so the frontend displays the actual best trials
            grid_results.sort(key=lambda x: x["score"], reverse=True)
            return study.best_params, grid_results

        return study.best_params

    @staticmethod
    def run_auto_tune(
        symbol: str,
        strategy_id: str,
        ranges: dict,
        timeframe: str,
        start_date_str: str,
        lookback: int,
        metric: str,
        headers: dict,
        config: dict | None = None
    ) -> dict:
        """Run a quick Optuna search on the lookback period before a given date.

        Args:
            symbol: Ticker symbol to optimise on.
            strategy_id: Strategy identifier string.
            ranges: Parameter search space.
            timeframe: Data interval (e.g., '1d', '15m').
            start_date_str: Backtest start date 'YYYY-MM-DD'. Optimisation
                runs on the period immediately before this date.
            lookback: Lookback window in months before start_date_str.
            metric: Scoring metric ('sharpe', 'total_return', 'calmar', 'drawdown').
            headers: Flask request headers for API key resolution.

        Returns:
            Dict with keys: bestParams, score, period, grid.
            Returns {'status': 'error', 'message': str} on failure.
        """
        if config is None: config = {}
        from datetime import datetime, timedelta
        from dateutil.relativedelta import relativedelta

        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            is_end = start_date - timedelta(days=1)
            is_start = is_end - relativedelta(months=lookback)
        except Exception as e:
            return {"status": "error", "message": f"Invalid date parameters: {e}"}

        logger.info(
            f"--- AUTO-TUNE START ---"
        )
        logger.info(
            f"Symbol: {symbol} ({timeframe}) | Strategy: {strategy_id} | Metric: {metric}"
        )
        logger.info(
            f"Optimization Window: {is_start.date()} to {is_end.date()} ({lookback} months)"
        )

        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(symbol, timeframe=timeframe, from_date=str(is_start.date()), to_date=str(is_end.date()))

        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            return {"status": "error", "message": f"No data found for {symbol} ({is_start.date()} to {is_end.date()})"}

        # Normalize columns consistency (Issue #Alignment)
        if isinstance(df, pd.DataFrame):
            df.columns = [c.capitalize() for c in df.columns]

        try:
            mask = (df.index >= pd.Timestamp(is_start)) & (df.index <= pd.Timestamp(is_end))
            is_df = df.loc[mask].dropna(subset=["Close"])
        except Exception as e:
            return {"status": "error", "message": f"Data processing error: {e}"}

        if len(is_df) < 20:
            return {
                "status": "error",
                "message": (
                    f"Insufficient data points ({len(is_df)}) for {lookback}m lookback before {start_date_str}."
                ),
            }

        try:
            best_params, grid = OptimizationEngine._find_best_params(
                is_df, strategy_id, ranges, metric, return_trials=True, config=config
            )
        except Exception as e:
            return {"status": "error", "message": f"Optimization engine error: {e}"}

        try:
            vbt_freq = OptimizationEngine._detect_freq(is_df)
            strategy = StrategyFactory.get_strategy(strategy_id, best_params)
            entries, exits = strategy.generate_signals(is_df)
            
            # Use same settings for final scoring (matching BacktestEngine.run)
            bt_slippage = float(config.get("slippage", 0.05)) / 100.0
            bt_initial_capital = float(config.get("initial_capital", 100000.0))
            bt_commission_fixed = float(config.get("commission", 20.0))
            
            sizing_mode = config.get("positionSizing", "Fixed Capital")
            bt_size_val = float(config.get("positionSizeValue", bt_initial_capital))
            if sizing_mode == "Fixed Capital":
                bt_size, bt_size_type = bt_size_val, "value"
            elif sizing_mode == "% of Equity":
                bt_size, bt_size_type = bt_size_val / 100.0, "percent"
            else:
                bt_size, bt_size_type = np.inf, "amount"

            bt_fees = bt_commission_fixed / bt_size_val if bt_size_val > 0 else 0.001
            
            # Stop Loss / Take Profit
            sl_pct = float(config.get("stopLossPct", 0)) / 100.0
            tp_pct = float(config.get("takeProfitPct", 0)) / 100.0

            pf_kwargs = {
                "freq": vbt_freq,
                "fees": bt_fees,
                "slippage": bt_slippage,
                "init_cash": bt_initial_capital,
                "size": bt_size,
                "size_type": bt_size_type,
                "accumulate": int(config.get("pyramiding", 1)) > 1
            }
            if sl_pct > 0:
                pf_kwargs["sl_stop"] = sl_pct
                if bool(config.get("useTrailingStop", False)):
                    pf_kwargs["sl_trail"] = True
            if tp_pct > 0:
                pf_kwargs["tp_stop"] = tp_pct

            pf = vbt.Portfolio.from_signals(
                is_df["Close"], entries, exits, 
                **pf_kwargs
            )

            if metric == "total_return":
                score = float(pf.total_return())
            elif metric == "calmar":
                score = float(pf.calmar_ratio()) if callable(pf.calmar_ratio) else float(pf.calmar_ratio)
            elif metric == "drawdown":
                score = float(-abs(pf.max_drawdown()))
            else:
                score = float(pf.sharpe_ratio()) if callable(pf.sharpe_ratio) else float(pf.sharpe_ratio)

            if np.isnan(score):
                score = 0.0
        except Exception as e:
            return {"status": "error", "message": f"Scoring calculation failed: {e}"}

        return {
            "bestParams": best_params,
            "score": round(score, 3),
            "period": f"{is_start.date()} to {is_end.date()}",
            "grid": grid,
        }

    @staticmethod
    def run_oos_validation(
        symbol: str,
        strategy_id: str,
        param_sets: list[dict],
        start_date_str: str,
        end_date_str: str,
        timeframe: str,
        headers: dict,
        config: dict | None = None
    ) -> list[dict]:
        """Run standard backtests on a set of parameters over an Out-Of-Sample window.
        
        Args:
            symbol: Ticker symbol.
            strategy_id: Strategy identifier.
            param_sets: List of parameter dictionaries (e.g., top 5 from Optuna).
            start_date_str: OOS Start Date.
            end_date_str: OOS End Date.
            timeframe: Data interval (e.g., '1d', '15m').
            headers: Request headers.
            config: Backtest settings (fees, slippage, etc).
            
        Returns:
            List of dictionaries containing the parameter set and performance metrics.
        """
        if config is None: config = {}
        from services.backtest_engine import BacktestEngine
        
        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(symbol, timeframe=timeframe, from_date=start_date_str, to_date=end_date_str)
        
        if df is None or df.empty:
            raise ValueError(f"No data available for Out-Of-Sample test ({start_date_str} to {end_date_str})")
            
        results = []
        for i, params in enumerate(param_sets):
            # Run simulation with standard config (Issue #ResultAlignment)
            bt_res = BacktestEngine.run(df, strategy_id, {**config, **params})
            
            if not bt_res or bt_res.get("status") == "failed":
                logger.warning(f"OOS Validation failed for param set {i+1}: {params}")
                continue
                
            # Embed rank and parameters directly into the full BacktestResult
            bt_res["rank"] = i + 1
            bt_res["paramSet"] = params
            bt_res["isOOS"] = True 
            # Force the dates to match the OOS request for clarity
            bt_res["startDate"] = start_date_str
            bt_res["endDate"] = end_date_str
            
            results.append(bt_res)
            
        return results
