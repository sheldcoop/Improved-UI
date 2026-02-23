"""Grid / Optuna optimisation engine.

Extracted from optimizer.py so that OptimizationEngine becomes a thin
orchestration layer.  GridEngine owns:

  * _extract_score  — pull Sharpe/Calmar/return/drawdown/win-rate from a pf
  * _find_best_params — core Optuna TPE loop
  * run_optuna      — Phase-1 + Phase-2 orchestration entry point
"""
from __future__ import annotations

import logging
import numpy as np
import pandas as pd
import vectorbt as vbt
import optuna

from services.data_fetcher import DataFetcher
from strategies import StrategyFactory
from services.portfolio_utils import build_portfolio, detect_freq, to_scalar

optuna.logging.set_verbosity(optuna.logging.WARNING)
logger = logging.getLogger(__name__)


class GridEngine:
    """Optuna-based hyperparameter search for trading strategies.

    All methods are static — no instance state is needed.
    """

    # ------------------------------------------------------------------
    # _extract_score
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_score(
        pf: vbt.Portfolio,
        scoring_metric: str,
    ) -> tuple[float, float, float, float, float]:
        """Extract optimisation scores from a completed VectorBT portfolio.

        Returns:
            Tuple: ``(target_score, sharpe, return_pct, max_drawdown_pct, win_rate)``
            where *target_score* is the value Optuna should maximise.
        """
        # --- trade count (needed early to penalise zero-trade configs) ---
        trade_count = 0
        try:
            trade_count = int(to_scalar(pf.trades.count()))
        except Exception:
            pass

        total_return = to_scalar(pf.total_return())

        # Sharpe: inf/-inf when std of returns == 0 (no trades).
        # Treat those as 0 so zero-trade configs are never selected.
        _raw_sharpe = pf.sharpe_ratio()
        sharpe_val = to_scalar(_raw_sharpe)
        if not np.isfinite(sharpe_val):
            sharpe_val = 0.0
        sharpe = sharpe_val if not np.isnan(sharpe_val) else 0.0

        max_dd = to_scalar(pf.max_drawdown())

        calmar = 0.0
        try:
            stats = pf.stats()
            calmar = to_scalar(stats.get("Calmar Ratio", 0.0))
            if not np.isfinite(calmar):
                calmar = 0.0
        except Exception:
            pass

        win_rate = 0.0
        try:
            winning_trades = int(to_scalar(pf.trades.winning.count()))
            if trade_count > 0:
                win_rate = (winning_trades / trade_count) * 100
        except (AttributeError, ValueError, TypeError):
            pass

        # Hard-penalise configs that generated zero trades
        if trade_count == 0:
            return -999.0, 0.0, 0.0, 0.0, 0.0

        if scoring_metric == "total_return":
            score = total_return
        elif scoring_metric == "calmar":
            score = calmar
        elif scoring_metric == "drawdown":
            # Optuna maximises, so negate the drawdown magnitude
            score = -abs(max_dd) * 100
        else:
            score = sharpe

        return score, sharpe, total_return * 100, abs(max_dd) * 100, win_rate

    # ------------------------------------------------------------------
    # _find_best_params
    # ------------------------------------------------------------------

    @staticmethod
    def _find_best_params(
        df: pd.DataFrame,
        strategy_id: str,
        ranges: dict[str, dict],
        scoring_metric: str = "sharpe",
        return_trials: bool = False,
        n_trials: int = 30,
        config: dict | None = None,
        fixed_params: dict | None = None,
    ) -> dict | tuple[dict, list[dict]]:
        """Find best parameters for a training window using Optuna TPE.

        Args:
            df:              OHLCV DataFrame (Title-Case columns from DataFetcher).
            strategy_id:     Strategy identifier string.
            ranges:          Parameter search space.  Each key maps to a dict
                             with ``min``, ``max``, ``step`` keys.
            scoring_metric:  One of ``"sharpe"``, ``"total_return"``,
                             ``"calmar"``, ``"drawdown"``.
            return_trials:   If True also return a formatted grid list.
            n_trials:        Number of Optuna trials.
            config:          Backtest config (fees, slippage, etc.).
            fixed_params:    Parameters locked from a previous phase (Phase-2).

        Returns:
            ``best_params`` dict, or ``(best_params, grid_list)`` when
            *return_trials* is True.
        """
        if config is None:
            config = {}

        # Non-parameter keys injected by routes — skip them in the search space
        _META_KEYS = frozenset({"startDate", "endDate", "reproducible"})

        vbt_freq = detect_freq(df)

        def objective(trial: optuna.Trial) -> float:
            trial_params: dict = {}

            for param, constraints in ranges.items():
                if param in _META_KEYS:
                    continue
                if not isinstance(constraints, dict):
                    continue
                val_min = constraints.get("min")
                val_max = constraints.get("max")
                val_step = constraints.get("step")

                is_float = isinstance(val_min, float) or isinstance(val_max, float) or isinstance(val_step, float)

                if is_float:
                    p_min = float(val_min) if val_min is not None else 0.0
                    p_max = float(val_max) if val_max is not None else 10.0
                    p_step = float(val_step) if val_step is not None else 0.1
                    trial_params[param] = trial.suggest_float(param, p_min, p_max, step=p_step)
                else:
                    p_min = int(val_min) if val_min is not None else 10
                    p_max = int(val_max) if val_max is not None else 50
                    p_step = int(val_step) if val_step is not None else 1
                    trial_params[param] = trial.suggest_int(param, p_min, p_max, step=p_step)

            # Lock Phase-1 params during Phase-2
            if fixed_params:
                trial_params.update(fixed_params)

            try:
                strategy = StrategyFactory.get_strategy(strategy_id, trial_params)
                entries, exits = strategy.generate_signals(df)

                pf = build_portfolio(
                    df["close"], entries, exits,
                    {**config, **trial_params},
                    vbt_freq,
                    df=df,          # ← pass full df for accurate intra-bar SL/TP fills
                )

                score, sharpe, return_pct, max_dd, win_rate = GridEngine._extract_score(
                    pf, scoring_metric
                )

                try:
                    trade_count = int(to_scalar(pf.trades.count()))
                except Exception:
                    trade_count = 0

            except Exception as e:
                logger.error(f"Trial {trial.number} exception: {e}", exc_info=True)
                return float(-999)

            trial.set_user_attr("returnPct", return_pct)
            trial.set_user_attr("sharpe", sharpe)
            trial.set_user_attr("drawdown", max_dd)
            trial.set_user_attr("trades", trade_count)
            trial.set_user_attr("winRate", win_rate)

            if np.isnan(score):
                return float(-999)

            logger.info(
                f"Trial {trial.number}: {trial_params} | Metric: {scoring_metric} | "
                f"Score: {score:.4f} | Trades: {trade_count}"
            )
            return float(score)

        logger.info(
            f"--- OPTIMIZATION START --- "
            f"Metric: {scoring_metric} | Strategy: {strategy_id} | "
            f"Bars: {len(df)} | Freq: {vbt_freq}"
        )

        # seed=42 → deterministic TPE ordering → reproducible results
        sampler = optuna.samplers.TPESampler(seed=42)
        pruner = optuna.pruners.MedianPruner(n_startup_trials=5)
        study = optuna.create_study(direction="maximize", sampler=sampler, pruner=pruner)
        study.optimize(objective, n_trials=n_trials)

        valid_trials = [
            t for t in study.trials
            if t.value is not None
            and np.isfinite(t.value)
            and t.value != -999
        ]
        if not valid_trials:
            logger.warning("Optuna found no valid parameter sets.")
            raise ValueError(
                "Optimization produced no valid results: every parameter combination "
                "generated 0 trades on this dataset.  Try widening the RSI ranges "
                "(lower threshold higher, upper threshold lower) or use a longer date range."
            )

        logger.info(
            f"--- OPTIMIZATION COMPLETE --- "
            f"Best Params: {study.best_params} | "
            f"Best Score: {study.best_value:.4f}"
        )

        if not return_trials:
            return study.best_params

        # Format grid for the frontend
        grid_results: list[dict] = []
        seen_params: set[str] = set()
        for trial in study.trials:
            if trial.value is None or trial.value == -999:
                continue
            if not np.isfinite(trial.value):
                continue
            param_str = str(trial.params)
            if param_str in seen_params:
                continue
            seen_params.add(param_str)
            grid_results.append({
                "paramSet": trial.params,
                "sharpe": round(trial.user_attrs.get("sharpe", 0.0), 2),
                "returnPct": round(trial.user_attrs.get("returnPct", 0.0), 2),
                "drawdown": round(trial.user_attrs.get("drawdown", 0.0), 2),
                "trades": int(trial.user_attrs.get("trades", 0)),
                "winRate": round(float(trial.user_attrs.get("winRate", 0.0)), 1),
                "score": round(float(trial.value), 4),
            })
        grid_results.sort(key=lambda x: x["score"], reverse=True)
        return study.best_params, grid_results

    # ------------------------------------------------------------------
    # run_optuna  (Phase-1 + Phase-2 orchestration)
    # ------------------------------------------------------------------

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
        timeframe: str = "1d",
        risk_ranges: dict[str, dict] | None = None,
        phase2_split_ratio: float = 0.0,
    ) -> dict:
        """Run Optuna hyperparameter optimisation for a strategy.

        Supports an optional second phase where *risk_ranges* (stop-loss,
        take-profit, etc.) are optimised after the primary parameters have
        been selected.  When *risk_ranges* is provided the response will
        include both primary and risk grids as well as combined parameter sets.
        """
        if config is None:
            config = {}

        fetcher = DataFetcher(headers)
        from_date = ranges.get("startDate")
        to_date = ranges.get("endDate")

        logger.info(
            f"Fetching data for Optimization: symbol={symbol}, "
            f"timeframe={timeframe}, from_date={from_date}, to_date={to_date}"
        )

        df = fetcher.fetch_historical_data(
            symbol, timeframe=timeframe, from_date=from_date, to_date=to_date
        )
        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            logger.error(f"Data fetch failed for {symbol}")
            return {"error": "No data available for symbol"}

        if not df.empty:
            logger.info(
                f"Fetched Data: {len(df)} bars. "
                f"Range: {df.index.min()} to {df.index.max()}"
            )

        # --- Data split (Phase-1 vs Phase-2) ---
        df_phase1 = df
        df_phase2 = df
        phase1_end_date: str | None = None
        phase2_start_date: str | None = None
        if risk_ranges and 0.0 < phase2_split_ratio < 1.0:
            split_idx = int(len(df) * phase2_split_ratio)
            df_phase1 = df.iloc[:split_idx].copy()
            df_phase2 = df.iloc[split_idx:].copy()
            phase1_end_date = df_phase1.index[-1].strftime("%Y-%m-%d")
            phase2_start_date = df_phase2.index[0].strftime("%Y-%m-%d")
            logger.info(
                f"Data split: Phase1={len(df_phase1)} bars "
                f"({phase2_split_ratio * 100:.0f}%) ending {phase1_end_date}, "
                f"Phase2={len(df_phase2)} bars "
                f"({(1 - phase2_split_ratio) * 100:.0f}%) starting {phase2_start_date}"
            )

        # --- Phase 1: primary parameter search (SL/TP disabled) ---
        phase1_config = {
            **(config or {}),
            "stopLossPct": 0,
            "takeProfitPct": 0,
            "useTrailingStop": False,
        }
        ranges["reproducible"] = reproducible
        best_params, grid = GridEngine._find_best_params(
            df_phase1, strategy_id, ranges, scoring_metric,
            return_trials=True, n_trials=n_trials, config=phase1_config,
        )

        response: dict = {
            "grid": grid,
            "wfo": [],
            "bestParams": best_params,
            "totalBars": len(df),
            "dataStartDate": df.index[0].strftime("%Y-%m-%d"),
            "dataEndDate": df.index[-1].strftime("%Y-%m-%d"),
        }

        # --- Phase 2: risk parameter search (if requested) ---
        if risk_ranges:
            logger.info("Starting Phase-2 risk parameter optimisation")
            try:
                risk_best, risk_grid = GridEngine._find_best_params(
                    df_phase2, strategy_id, risk_ranges, scoring_metric,
                    return_trials=True, n_trials=n_trials,
                    config=config, fixed_params=best_params,
                )
                response["riskGrid"] = risk_grid
                response["bestRiskParams"] = risk_best
                response["combinedParams"] = {**best_params, **risk_best}
                if phase2_split_ratio > 0.0:
                    response["splitRatio"] = phase2_split_ratio
                    response["phase1EndDate"] = phase1_end_date
                    response["phase2StartDate"] = phase2_start_date
                    response["phase1Bars"] = len(df_phase1)
                    response["phase2Bars"] = len(df_phase2)
            except Exception as e:
                logger.warning(f"Phase-2 risk optimisation failed: {e}")

        return response
