import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent / "backend"))

from services.data_fetcher import DataFetcher
from services.optimizer import OptimizationEngine
from strategies import StrategyFactory
import vectorbt as vbt

def debug_win_rate():
    symbol = "RELIANCE"
    timeframe = "1d"
    from_date = "2025-05-01"
    to_date = "2026-02-20"
    strategy_id = "1"
    best_params = {"fast_sma": 10, "slow_sma": 40}
    config = {
        "initial_capital": 100000,
        "commission": 20,
        "slippage": 0.05,
        "positionSizing": "Fixed Capital",
        "positionSizeValue": 100000,
        "pyramiding": 1
    }
    
    fetcher = DataFetcher({})
    df = fetcher.fetch_historical_data(symbol, timeframe, from_date, to_date)
    vbt_freq = "1D"
    strategy = StrategyFactory.get_strategy(strategy_id, best_params)
    entries, exits = strategy.generate_signals(df)
    pf = OptimizationEngine._build_portfolio(df["Close"], entries, exits, config, vbt_freq)
    
    print(f"pf.trades.win_rate(): {pf.trades.win_rate()}")
    print(f"pf.stats().get('Win Rate [%]'): {pf.stats().get('Win Rate [%]')}")
    
    # Let's try to calculate it identically to stats
    closed_trades = pf.trades.closed.count()
    winning_trades = pf.trades.winning.count()
    calculated_wr = (winning_trades / closed_trades * 100) if closed_trades > 0 else 0.0
    print(f"Calculated manually: {calculated_wr}")

if __name__ == "__main__":
    debug_win_rate()
