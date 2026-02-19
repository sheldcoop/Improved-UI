"""engine.py — backward-compatibility shim.

The 4 engine classes have been moved to the services/ layer.
This file re-exports them so any code that still imports from 'engine'
continues to work without modification.

DO NOT add new business logic here.
"""

from services.data_fetcher import DataFetcher as DataEngine
from services.backtest_engine import BacktestEngine
from services.optimizer import OptimizationEngine
from services.monte_carlo import MonteCarloEngine

__all__ = ["DataEngine", "BacktestEngine", "OptimizationEngine", "MonteCarloEngine"]
