"""Optimisation orchestration layer.

The heavy lifting has been moved to dedicated modules:

  * services.grid_engine.GridEngine   — Optuna TPE search (Phase 1 + 2)
  * services.portfolio_utils          — shared portfolio building utilities

This file keeps OptimizationEngine as a thin façade so that existing route
imports (``from services.optimizer import OptimizationEngine``) continue to
work without change.
"""
from __future__ import annotations

import logging
import pandas as pd

from services.data_fetcher import DataFetcher
from services.grid_engine import GridEngine
from services.portfolio_utils import detect_freq, build_portfolio

logger = logging.getLogger(__name__)


class OptimizationEngine:
    """Thin orchestration façade — delegates to GridEngine and portfolio_utils.

    All methods are static — no instance state is needed.
    """

    # ------------------------------------------------------------------
    # Helpers (kept here for backward-compat; delegate to portfolio_utils)
    # ------------------------------------------------------------------

    @staticmethod
    def month_to_bars(months: int) -> int:
        """Convert months to approximate trading days (≈21 days/month)."""
        return max(20, int(months * 21))

    # Delegate freq detection to the shared utility
    _detect_freq = staticmethod(detect_freq)

    # Delegate score extraction and Optuna search to GridEngine
    _extract_score = staticmethod(GridEngine._extract_score)
    _find_best_params = staticmethod(GridEngine._find_best_params)
    run_optuna = staticmethod(GridEngine.run_optuna)

    # ------------------------------------------------------------------
    # _to_scalar  (kept for any legacy callers outside this file)
    # ------------------------------------------------------------------

    @staticmethod
    def _to_scalar(val) -> float:
        """Safely convert a VectorBT metric to a Python float."""
        from services.portfolio_utils import to_scalar
        return to_scalar(val)

    # ------------------------------------------------------------------
    # _build_portfolio  (kept for any legacy callers outside this file)
    # ------------------------------------------------------------------

    @staticmethod
    def _build_portfolio(
        close_series: pd.Series,
        entries: pd.Series,
        exits: pd.Series,
        config: dict,
        vbt_freq: str,
        df: pd.DataFrame | None = None,
    ):
        """Thin wrapper — delegates to portfolio_utils.build_portfolio."""
        return build_portfolio(close_series, entries, exits, config, vbt_freq, df=df)

    # ------------------------------------------------------------------
    # run_oos_validation
    # ------------------------------------------------------------------

    @staticmethod
    def run_oos_validation(
        symbol: str,
        strategy_id: str,
        param_sets: list[dict],
        start_date_str: str,
        end_date_str: str,
        timeframe: str,
        headers: dict,
        config: dict | None = None,
    ) -> list[dict]:
        """Run standard backtests on a set of parameters over an OOS window.

        Args:
            symbol:         Ticker symbol.
            strategy_id:    Strategy identifier.
            param_sets:     List of parameter dicts (e.g. top-5 from Optuna).
            start_date_str: OOS start date (YYYY-MM-DD).
            end_date_str:   OOS end date (YYYY-MM-DD).
            timeframe:      Data interval (e.g. ``'1d'``, ``'15m'``).
            headers:        Request headers (forwarded to DataFetcher).
            config:         Backtest settings (fees, slippage, etc.).

        Returns:
            List of dicts, each containing the parameter set and full
            BacktestEngine result.
        """
        if config is None:
            config = {}
        from services.backtest_engine import BacktestEngine

        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(
            symbol, timeframe=timeframe,
            from_date=start_date_str, to_date=end_date_str,
        )

        if df is None or df.empty:
            raise ValueError(
                f"No data available for Out-Of-Sample test "
                f"({start_date_str} to {end_date_str})"
            )

        results: list[dict] = []
        for i, params in enumerate(param_sets):
            bt_res = BacktestEngine.run(df, strategy_id, {**config, **params})

            if not bt_res or bt_res.get("status") == "failed":
                logger.warning(f"OOS Validation failed for param set {i + 1}: {params}")
                continue

            bt_res["rank"] = i + 1
            bt_res["paramSet"] = params
            bt_res["isOOS"] = True
            bt_res["startDate"] = start_date_str
            bt_res["endDate"] = end_date_str
            results.append(bt_res)

        return results
