"""Walk-Forward Optimization Engine.

Isolates rolling window backtesting from standard Optuna hyperparameter tuning.
"""
from __future__ import annotations

import logging
import numpy as np
import pandas as pd
import vectorbt as vbt
from dateutil.relativedelta import relativedelta
from datetime import datetime

from services.data_fetcher import DataFetcher
from services.optimizer import OptimizationEngine
from strategies import StrategyFactory
from utils.alert_manager import AlertManager
from services.backtest_engine import BacktestEngine
from utils.json_utils import clean_float_values

logger = logging.getLogger(__name__)


class WFOEngine:
    """Handles Walk-Forward Optimization for strategy parameter tuning."""

    @staticmethod
    def _fetch_and_prepare_df(
        symbol: str,
        wfo_config: dict,
        headers: dict,
        train_m: int,
        test_m: int,
        label: str = "WFO",
    ) -> tuple[pd.DataFrame | None, datetime, type(relativedelta)]:
        """Fetch and slice data for a WFO run, projecting back to cover the training window."""
        user_start_str = wfo_config.get("startDate")
        user_end_str = wfo_config.get("endDate")
        user_start_dt = datetime.strptime(user_start_str, "%Y-%m-%d")
        
        # Reach back in time to get training data before the requested start date
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
        fetch_start_dt: datetime,
        collect_signals: bool = False,
    ) -> dict:
        """Core Walk-Forward loop shared by run_wfo() and generate_wfo_portfolio()."""
        wfo_results: list[dict] = []
        all_entries = pd.Series(False, index=df.index) if collect_signals else None
        all_exits = pd.Series(False, index=df.index) if collect_signals else None
        param_history: list[dict] = [] if collect_signals else []
        all_trials: list[dict] = []

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
                    logger.error("No fallback parameters available. Skipping window.")
                    current_date += relativedelta(months=test_m)
                    run_count += 1
                    continue

            # --- Score on test data ---
            try:
                strategy = StrategyFactory.get_strategy(strategy_id, best_params)
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
                        "params": best_params,
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
        """Run Walk-Forward Optimisation across rolling train/test windows."""
        train_m = int(wfo_config.get("trainWindow", 6))
        test_m = int(wfo_config.get("testWindow", 2))
        train_window = OptimizationEngine.month_to_bars(train_m)
        test_window = OptimizationEngine.month_to_bars(test_m)
        metric = wfo_config.get("scoringMetric", "sharpe")

        df, fetch_start_dt, _ = WFOEngine._fetch_and_prepare_df(
            symbol, wfo_config, headers, train_m, test_m, label="WFO"
        )

        if df is None or (isinstance(df, pd.DataFrame) and len(df) < train_window + test_window):
            needed = train_window + test_window
            found = len(df) if df is not None else 0
            return {"error": f"Not enough data for WFO. Need {needed} bars (~{needed//21}m), found {found} bars."}

        vbt_freq = OptimizationEngine._detect_freq(df)
        loop = WFOEngine._wfo_loop(
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
        """Run WFO and return a single continuous out-of-sample portfolio result."""
        train_m = int(wfo_config.get("trainWindow", 6))
        test_m = int(wfo_config.get("testWindow", 2))
        train_window = OptimizationEngine.month_to_bars(train_m)
        test_window = OptimizationEngine.month_to_bars(test_m)
        metric = wfo_config.get("scoringMetric", "sharpe")

        df, fetch_start_dt, _ = WFOEngine._fetch_and_prepare_df(
            symbol, wfo_config, headers, train_m, test_m, label="WFO Portfolio"
        )

        if df is None or len(df) < train_window + test_window:
            needed = train_window + test_window
            found = len(df) if df is not None else 0
            return {"error": f"Not enough data for concatenated WFO. Need {needed} bars (~{needed//21}m), found {found} bars."}

        vbt_freq = OptimizationEngine._detect_freq(df)
        loop = WFOEngine._wfo_loop(
            df, strategy_id, ranges, metric, vbt_freq,
            train_m, test_m, fetch_start_dt, collect_signals=True,
        )
        param_history = loop["param_history"]
        all_entries = loop["all_entries"]
        all_exits = loop["all_exits"]

        # Slice to the OOS range (after the first training block)
        oos_start_date = fetch_start_dt + relativedelta(months=train_m)
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

        return clean_float_values(results)
