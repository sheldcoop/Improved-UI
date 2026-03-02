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
        seed: int | None = None,
        use_fat_tails: bool = False,
    ) -> dict:
        """GBM price-path simulation from historical return statistics.

        Paths are normalised to start at 100 so the chart can display
        all symbols on the same scale.

        Args:
            simulations: Number of paths to generate.
            vol_mult: Volatility multiplier (>1 = stress, <1 = optimistic).
            headers: Flask request headers for Dhan API key.
            symbol: Ticker symbol to derive mu/sigma from.
            seed: Optional RNG seed for reproducible results.

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

        rng = np.random.default_rng(seed)
        # Vectorised GBM: generate normal shocks
        shocks = rng.normal(mu, sigma, (simulations, days))

        if use_fat_tails:
            # --- JUMP DIFFUSION (FAT-TAILS) ---
            # Add catastrophic jump risks to simulate real market fat tails
            # We assume 2 major crashes per year (lambda = 2 / 252)
            # with a mean drop of -5% and a volatility of 2%
            jump_events = rng.poisson(2 / 252, (simulations, days))
            jump_sizes = rng.normal(-0.05, 0.02, (simulations, days))
            
            # Total Shock = Normal Shocks + (Crash Occurrences * Crash Sizes)
            shocks = shocks + (jump_events * jump_sizes)

        # First column is always 0 so exp(0)=1, preserving the initial value
        shocks[:, 0] = 0.0
        raw = _INITIAL * np.cumprod(np.exp(shocks), axis=1)

        paths: list[dict] = [
            {"id": i, "values": raw[i].tolist()}
            for i in range(simulations)
        ]

        stats = MonteCarloEngine.compute_stats(paths)
        logger.info(f"MC GBM (Fat Tails): {simulations} paths for {symbol} (vol_mult={vol_mult})")
        return {"paths": paths, "stats": stats}

    @staticmethod
    def run_from_trades(
        trade_returns: list[float],
        simulations: int,
        seed: int | None = None,
    ) -> dict:
        """Bootstrap trade-sequence simulation from actual backtest results.

        Randomly resamples the trade return list N times to build equity
        curves.  This answers: 'What if my trades happened in a different
        order?' — revealing sequence-of-returns risk.

        Args:
            trade_returns: Per-trade P&L percentages from a backtest.
            simulations: Number of equity curve paths to generate.
            seed: Optional RNG seed for reproducible results.

        Returns:
            Dict with 'paths' (list of {id, values}) and 'stats' dict.
        """
        if not trade_returns:
            return {"paths": [], "stats": MonteCarloEngine.compute_stats([])}

        returns_arr = np.array(trade_returns) / 100.0
        n_trades = len(returns_arr)

        rng = np.random.default_rng(seed)
        # Vectorised: sample all paths at once
        sampled = rng.choice(returns_arr, size=(simulations, n_trades), replace=True)
        # Build equity curves: start at _INITIAL, then cumprod
        growth = 1.0 + sampled
        equity = np.zeros((simulations, n_trades + 1))
        equity[:, 0] = _INITIAL
        equity[:, 1:] = _INITIAL * np.cumprod(growth, axis=1)

        paths: list[dict] = [
            {"id": i, "values": equity[i].tolist()}
            for i in range(simulations)
        ]

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
