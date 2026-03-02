"""Monte Carlo simulation service.

Supports two simulation modes:
  1. GBM price-path (run): forward-projects price using historical mu/sigma
  2. Trade-sequence bootstrap (run_from_trades): resamples actual backtest
     trade returns to stress-test strategy robustness

All path values are normalised to start at 100 so the chart Y-axis is
always in % terms regardless of the underlying price scale.
"""
from __future__ import annotations

import logging
import numpy as np
import pandas as pd

from services.data_fetcher import DataFetcher

logger = logging.getLogger(__name__)

_INITIAL = 100.0  # All paths are index-normalised to start at 100


class MonteCarloEngine:
    """Runs Monte Carlo simulations.  All methods are static."""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @staticmethod
    def run(
        simulations: int,
        vol_mult: float,
        headers: dict,
        symbol: str = "NIFTY 50",
    ) -> dict:
        """GBM price-path simulation from historical return statistics.

        Paths are normalised to start at 100 so the chart can display
        all symbols on the same scale.

        Args:
            simulations: Number of paths to generate.
            vol_mult: Volatility multiplier (>1 = stress, <1 = optimistic).
            headers: Flask request headers for Dhan API key.
            symbol: Ticker symbol to derive mu/sigma from.

        Returns:
            Dict with 'paths' (list of {id, values}) and 'stats' dict.
        """
        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(symbol)

        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            logger.warning(f"No data for {symbol} — using default mu/sigma")
            mu: float = 0.0005
            sigma: float = 0.015
        else:
            # Use lowercase 'close' — DataFetcher normalises column names
            log_returns = np.log(df["close"] / df["close"].shift(1)).dropna()
            mu = float(log_returns.mean())
            sigma = float(log_returns.std())

        sigma = sigma * vol_mult
        days = 252
        paths: list[dict] = []

        for i in range(simulations):
            shocks = np.random.normal(mu, sigma, days)
            raw = np.zeros(days)
            raw[0] = _INITIAL
            for t in range(1, days):
                raw[t] = raw[t - 1] * np.exp(shocks[t])
            paths.append({"id": i, "values": raw.tolist()})

        stats = MonteCarloEngine.compute_stats(paths)
        logger.info(f"MC GBM: {simulations} paths for {symbol} (vol_mult={vol_mult})")
        return {"paths": paths, "stats": stats}

    @staticmethod
    def run_from_trades(
        trade_returns: list[float],
        simulations: int,
    ) -> dict:
        """Bootstrap trade-sequence simulation from actual backtest results.

        Randomly resamples the trade return list N times to build equity
        curves.  This answers: 'What if my trades happened in a different
        order?' — revealing sequence-of-returns risk.

        Args:
            trade_returns: Per-trade P&L percentages from a backtest.
            simulations: Number of equity curve paths to generate.

        Returns:
            Dict with 'paths' (list of {id, values}) and 'stats' dict.
        """
        if not trade_returns:
            return {"paths": [], "stats": MonteCarloEngine.compute_stats([])}

        returns_arr = np.array(trade_returns) / 100.0
        n_trades = len(returns_arr)
        paths: list[dict] = []

        for i in range(simulations):
            sampled = np.random.choice(returns_arr, size=n_trades, replace=True)
            equity = np.zeros(n_trades + 1)
            equity[0] = _INITIAL
            for t in range(n_trades):
                equity[t + 1] = equity[t] * (1.0 + sampled[t])
            paths.append({"id": i, "values": equity.tolist()})

        stats = MonteCarloEngine.compute_stats(paths)
        logger.info(f"MC Trade-Seq: {simulations} paths from {n_trades} trades")
        return {"paths": paths, "stats": stats}

    @staticmethod
    def compute_stats(paths: list[dict]) -> dict:
        """Compute risk statistics from normalised simulation paths.

        All paths must start at _INITIAL (100).  Final values > 100 are
        profitable; < 100 are a loss.

        Args:
            paths: List of path dicts with 'values' key.

        Returns:
            Dict with var95, cvar95, ruin_prob, median_return (all %).
        """
        if not paths:
            return {"var95": 0.0, "cvar95": 0.0, "ruin_prob": 0.0, "median_return": 0.0}

        # Final return % relative to starting value of 100
        final_returns = np.array(
            [(p["values"][-1] - _INITIAL) / _INITIAL * 100.0 for p in paths]
        )

        var95 = float(np.percentile(final_returns, 5))
        below = final_returns[final_returns <= var95]
        cvar95 = float(np.mean(below)) if len(below) > 0 else var95
        # Ruin = losing more than 50 % of capital
        ruin_prob = float(np.mean(final_returns < -50.0) * 100.0)
        median_return = float(np.median(final_returns))

        return {
            "var95": round(var95, 2),
            "cvar95": round(cvar95, 2),
            "ruin_prob": round(ruin_prob, 2),
            "median_return": round(median_return, 2),
        }
