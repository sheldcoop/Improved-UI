"""Monte Carlo simulation service — replaces MonteCarloEngine from engine.py.

Fixes:
  - Hardcoded 'NIFTY 50' symbol (Issue #14) — symbol is now a parameter
  - Missing type hints (Issue #4)
  - Missing docstrings (Issue #5)
"""
from __future__ import annotations


import logging
import numpy as np
import pandas as pd

from services.data_fetcher import DataFetcher

logger = logging.getLogger(__name__)


class MonteCarloEngine:
    """Runs Monte Carlo price path simulations using historical return statistics.

    All methods are static — no instance state is needed.
    """

    @staticmethod
    def run(
        simulations: int,
        vol_mult: float,
        headers: dict,
        symbol: str = "NIFTY 50",
    ) -> list[dict]:
        """Run Monte Carlo price path simulations for a given symbol.

        Derives mean return (mu) and volatility (sigma) from historical
        daily returns, then generates GBM-style price paths.

        Args:
            simulations: Number of simulation paths to generate.
            vol_mult: Volatility multiplier applied to historical sigma.
                Use > 1 for stress testing, < 1 for optimistic scenarios.
            headers: Flask request headers for API key resolution.
            symbol: Ticker symbol to base simulations on.
                Defaults to 'NIFTY 50'. Previously hardcoded (Issue #14 fix).

        Returns:
            List of simulation path dicts, each with:
            - id (int): Simulation index.
            - values (list[float]): 252 daily price values.

        Example:
            >>> paths = MonteCarloEngine.run(100, 1.0, headers, 'RELIANCE')
            >>> print(len(paths))
            100
            >>> print(len(paths[0]['values']))
            252
        """
        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(symbol)

        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            logger.warning(f"No data for {symbol} — using default mu/sigma for Monte Carlo")
            mu: float = 0.0005
            sigma: float = 0.015
            last_price: float = 100.0
        else:
            # Use log returns for proper GBM — avoids upward drift bias from arithmetic compounding
            log_returns = np.log(df["Close"] / df["Close"].shift(1)).dropna()
            mu = float(log_returns.mean())
            sigma = float(log_returns.std())
            last_price = float(df["Close"].iloc[-1])

        sigma = sigma * vol_mult
        days = 252
        paths: list[dict] = []

        for i in range(simulations):
            # GBM: S(t) = S(t-1) * exp(shock), shock ~ N(mu, sigma)
            shocks = np.random.normal(mu, sigma, days)
            price_path = np.zeros(days)
            price_path[0] = last_price
            for t in range(1, days):
                price_path[t] = price_path[t - 1] * np.exp(shocks[t])
            paths.append({"id": i, "values": price_path.tolist()})

        logger.info(f"Monte Carlo: {simulations} paths for {symbol} (vol_mult={vol_mult})")
        return paths
