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
                # Use the mode (most common) time difference to ignore overnight/weekend gaps
                diffs = df.index.to_series().diff()
                mode_diff = diffs.mode()[0]
                minutes = int(mode_diff.total_seconds() / 60)
                
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
        config: dict | None = None,
        timeframe: str = "1d"
    ) -> dict:
        """Run Optuna hyperparameter optimisation for a strategy."""
        if config is None: config = {}
        fetcher = DataFetcher(headers)
        from_date = ranges.get("startDate")
        to_date = ranges.get("endDate")

        logger.info(f"Fetching data for Optimization: symbol={symbol}, timeframe={timeframe}, from_date={from_date}, to_date={to_date}")

        df = fetcher.fetch_historical_data(
            symbol,
            timeframe=timeframe,
            from_date=from_date,
            to_date=to_date
        )
        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            logger.error(f"Data fetch failed for {symbol}")
            return {"error": "No data available for symbol"}

        # Log first and last index to verify range
        if not df.empty:
            logger.info(f"Fetched Data: {len(df)} bars. Range: {df.index.min()} to {df.index.max()}")

        # Use our consolidated search engine
        ranges["reproducible"] = reproducible
        best_params, grid = OptimizationEngine._find_best_params(
            df, strategy_id, ranges, scoring_metric, return_trials=True, n_trials=n_trials, config=config
        )

        return {"grid": grid, "wfo": [], "bestParams": best_params}

    # WFO methods have been extracted to services.wfo_engine.WFOEngine
    
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
                
                # Diagnostic: Check signal counts
                entry_count = int(entries.sum().sum()) if isinstance(entries, pd.DataFrame) else int(entries.sum())
                
                if entry_count == 0:
                    logger.debug(f"Trial {trial.number}: {trial_params} -> Score: -999 (0 entry signals generated)")
                    return float(-999)

                pf = OptimizationEngine._build_portfolio(
                    df["Close"], entries, exits, config, vbt_freq
                )
                
                trade_count = int(pf.trades.count())
                if trade_count == 0:
                    logger.debug(f"Trial {trial.number}: {trial_params} -> Score: -999 (0 trades executed by VBT)")
                    return float(-999)
                
                score, sharpe, return_pct, max_dd, win_rate = OptimizationEngine._extract_score(
                    pf, scoring_metric
                )
                
                # Store in trial attributes for retrieval
                trial.set_user_attr("returnPct", return_pct)
                trial.set_user_attr("sharpe", sharpe)
                trial.set_user_attr("drawdown", max_dd)
                trial.set_user_attr("trades", trade_count)
                trial.set_user_attr("winRate", win_rate)
                    
                if np.isnan(score):
                    logger.debug(f"Trial {trial.number}: {trial_params} -> Score: -999 (NaN score for metric {scoring_metric})")
                    return float(-999)
                    
                logger.info(f"Trial {trial.number}: {trial_params} | Metric: {scoring_metric} | Score: {score:.4f} | Trades: {trade_count}")
                return float(score)
            except Exception as e:
                logger.error(f"Trial {trial.number} exception: {e}", exc_info=True)
                return float(-999)

        vbt_freq = OptimizationEngine._detect_freq(df)

        logger.info(f"--- OPTIMIZATION START ---")
        logger.info(f"Metric: {scoring_metric} | Strategy: {strategy_id} | Bars: {len(df)} | Freq: {vbt_freq}")
        
        seed = 42 if ranges.get("reproducible", False) else None
        sampler = optuna.samplers.TPESampler(seed=seed)
        pruner = optuna.pruners.MedianPruner(n_startup_trials=5)
        
        study = optuna.create_study(direction="maximize", sampler=sampler, pruner=pruner)
        
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
            seen_params = set()
            for trial in study.trials:
                if trial.value is None or trial.value == -999: continue
                
                # Deduplicate parameters so the UI table is clean
                param_str = str(trial.params)
                if param_str in seen_params: continue
                seen_params.add(param_str)
                
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
            return {"status": "error", "message": f"No cached data for {symbol}. Please click 'Load Data' first."}

        # Normalize columns consistency (Issue #Alignment)
        if isinstance(df, pd.DataFrame):
            df.columns = [c.capitalize() for c in df.columns]

        try:
            mask = (df.index >= pd.Timestamp(is_start)) & (df.index <= pd.Timestamp(is_end))
            is_df = df.loc[mask].dropna(subset=["Close"])
        except Exception as e:
            return {"status": "error", "message": f"Data processing error: {e}"}

        if len(is_df) < 20:
            # Look at the full cached data (no date filter) to give an accurate suggestion
            full_df = fetcher.fetch_historical_data(symbol, timeframe=timeframe)
            if full_df is not None and not full_df.empty:
                cache_start = full_df.index.min().strftime("%Y-%m-%d")
                cache_end = full_df.index.max().strftime("%Y-%m-%d")
                suggested_start = (full_df.index.min() + relativedelta(months=lookback)).strftime("%Y-%m-%d")
                return {
                    "status": "error",
                    "message": (
                        f"No {timeframe} data before {start_date_str} for Auto-Tune. "
                        f"Your loaded cache covers {cache_start} \u2192 {cache_end}. "
                        f"Set your backtest Start Date to '{suggested_start}' or later, then Load Data."
                    ),
                }
            return {
                "status": "error",
                "message": (
                    f"No {timeframe} data before {start_date_str}. "
                    f"Click 'Load Data' to fetch {lookback} months of data before your backtest start date."
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
            
            pf = OptimizationEngine._build_portfolio(
                is_df["Close"], entries, exits, config, vbt_freq
            )

            score, _, _, _, _ = OptimizationEngine._extract_score(pf, metric)

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

    @staticmethod
    def _build_portfolio(
        close_series: pd.Series, 
        entries: pd.Series, 
        exits: pd.Series, 
        config: dict, 
        vbt_freq: str
    ) -> vbt.Portfolio:
        """Helper to build a VectorBT portfolio consistently across engines."""
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

        return vbt.Portfolio.from_signals(close_series, entries, exits, **pf_kwargs)

    @staticmethod
    def _extract_score(pf: vbt.Portfolio, scoring_metric: str) -> tuple[float, float, float, float, float]:
        """Extract optimizer scores from a portfolio.
        
        Returns:
            Tuple: (target_score, sharpe, return_pct, max_drawdown_pct, win_rate)
        """
        total_return = float(pf.total_return())
        sharpe = float(pf.sharpe_ratio()) if not np.isnan(pf.sharpe_ratio()) else 0.0
        max_dd = float(pf.max_drawdown())
        
        calmar = 0.0
        try:
            stats = pf.stats()
            calmar = float(stats.get("Calmar Ratio", 0.0))
        except Exception:
            pass
        
        win_rate = 0.0
        try:
            closed_trades = pf.trades.closed.count()
            winning_trades = pf.trades.winning.count()
            if closed_trades > 0:
                win_rate = (winning_trades / closed_trades) * 100
        except (AttributeError, ValueError):
            pass

        if scoring_metric == "total_return":
            score = total_return
        elif scoring_metric == "calmar":
            score = calmar
        elif scoring_metric == "drawdown":
            # Optuna maximizes, so we pass the negative of the *raw* (positive absolute) percentage. 
            # E.g. a 5% drawdown is -5.0 score. 
            score = -abs(max_dd) * 100
        else:
            score = sharpe
            
        return score, sharpe, total_return * 100, abs(max_dd) * 100, win_rate
