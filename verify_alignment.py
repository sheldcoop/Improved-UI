import sys
import json
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent / "backend"))

from services.data_fetcher import DataFetcher
from services.optimizer import OptimizationEngine
from services.backtest_engine import BacktestEngine

def verify_optuna_vs_backtest():
    symbol = "RELIANCE"
    # Using 1D to easily fetch 9 months of data without hitting Dhan intraday limits
    timeframe = "1d"
    from_date = "2025-05-01"
    to_date = "2026-02-20"
    
    # We will use Strategy '1' (SMA Crossover) usually
    strategy_id = "1"
    ranges = {
        "fast_sma": {"min": 5, "max": 15, "step": 5},
        "slow_sma": {"min": 20, "max": 40, "step": 10},
        "startDate": from_date,
        "endDate": to_date
    }
    config = {
        "initial_capital": 100000,
        "commission": 20,
        "slippage": 0.05,
        "positionSizing": "Fixed Capital",
        "positionSizeValue": 100000,
        "pyramiding": 1
    }
    
    print(f"--- 1. Fetching {timeframe} data for {symbol} ({from_date} to {to_date}) ---")
    headers = {} # Simulate empty headers for local run
    
    print("\n--- 2. Running Optuna Optimization (Finding Best Params) ---")
    optuna_results = OptimizationEngine.run_optuna(
        symbol=symbol,
        strategy_id=strategy_id,
        ranges=ranges.copy(),
        headers=headers,
        n_trials=10, # keep it fast for verification
        scoring_metric="sharpe",
        reproducible=True, # Fixed seed for stable results
        config=config
    )
    
    if "error" in optuna_results:
        print(f"Optimization failed: {optuna_results['error']}")
        return
        
    best_params = optuna_results["bestParams"]
    
    # Find the matching grid result to get Optuna's calculated metrics
    best_grid_item = next((item for item in optuna_results["grid"] if item["paramSet"] == best_params), None)
    
    print("\n--- OPTUNA RESULTS ---")
    print(f"Best Params: {json.dumps(best_params)}")
    if best_grid_item:
        print(json.dumps(best_grid_item, indent=4))
    else:
        print("Could not find matching grid item.")
        
    print("\n--- 3. Running BacktestEngine with Best Params ---")
    fetcher = DataFetcher(headers)
    df = fetcher.fetch_historical_data(symbol, timeframe, from_date, to_date)
    
    combined_config = {**config, **best_params}
    bt_results = BacktestEngine.run(df, strategy_id, combined_config)
    
    if not bt_results or bt_results.get("status") == "failed":
         print("Backtest failed.")
         return
         
    metrics = bt_results["metrics"]
    
    print("\n--- BACKTEST ENGINE RESULTS ---")
    print(json.dumps({
        "sharpe": metrics.get("sharpeRatio"),
        "returnPct": metrics.get("totalReturnPct"),
        "drawdown": metrics.get("maxDrawdownPct"),
        "trades": metrics.get("totalTrades"),
        "winRate": metrics.get("winRate")
    }, indent=4))
    
    print("\n--- 4. COMPARISON ---")
    if best_grid_item:
        match = True
        
        # Helper to check approx equality due to minor float rounding differences
        def is_close(a, b, name):
            if abs(float(a) - float(b)) > 0.05:
                print(f"❌ {name} Mismatch: Optuna={a}, Backtest={b}")
                return False
            else:
                print(f"✅ {name} Matches: {a} ~= {b}")
                return True
                
        match &= is_close(best_grid_item["sharpe"], metrics["sharpeRatio"], "Sharpe Ratio")
        match &= is_close(best_grid_item["returnPct"], metrics["totalReturnPct"], "Total Return %")
        match &= is_close(best_grid_item["drawdown"], metrics["maxDrawdownPct"], "Max Drawdown %")
        match &= is_close(best_grid_item["trades"], metrics["totalTrades"], "Total Trades")
        match &= is_close(best_grid_item["winRate"], metrics["winRate"], "Win Rate %")
        
        if match:
             print("\n🎉 SUCCESS: Optimizer and BacktestEngine metrics are in perfect alignment!")
        else:
             print("\n⚠️ WARNING: Identified metrics mismatch between engines.")

if __name__ == "__main__":
    verify_optuna_vs_backtest()
