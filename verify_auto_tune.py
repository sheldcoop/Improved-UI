import sys
import json
from pathlib import Path
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

sys.path.append(str(Path(__file__).resolve().parent / "backend"))

from services.optimizer import OptimizationEngine

def verify_auto_tune():
    symbol = "RELIANCE"
    timeframe = "1d"
    
    # We will test Auto-Tune for a start date of 2026-02-01 with a 6 month lookback.
    # This means the auto-tune optimization window is mathematically:
    auto_tune_start_date_str = "2026-02-01"
    lookback = 6
    
    start_dt = datetime.strptime(auto_tune_start_date_str, "%Y-%m-%d")
    is_end = start_dt - timedelta(days=1)   # 2026-01-31
    is_start = is_end - relativedelta(months=lookback) # 2025-07-31
    
    opt_start_str = str(is_start.date())
    opt_end_str = str(is_end.date())
    
    strategy_id = "1" # RSI
    ranges = {
        "period": {"min": 5, "max": 20, "step": 5},
        "lower": {"min": 20, "max": 40, "step": 10},
        "upper": {"min": 60, "max": 80, "step": 10}
    }
    
    config = {
        "initial_capital": 100000,
        "commission": 20,
        "slippage": 0.05,
        "positionSizing": "Fixed Capital",
        "positionSizeValue": 100000,
        "pyramiding": 1
    }
    
    headers = {}
    
    print(f"--- 1. Manual Optuna Optimization ({opt_start_str} to {opt_end_str}) ---")
    
    manual_ranges = ranges.copy()
    manual_ranges["startDate"] = opt_start_str
    manual_ranges["endDate"] = opt_end_str
    
    optuna_results = OptimizationEngine.run_optuna(
        symbol=symbol,
        strategy_id=strategy_id,
        ranges=manual_ranges,
        headers=headers,
        scoring_metric="sharpe",
        reproducible=True,
        config=config
    )
    
    print(f"Manual Best Params: {optuna_results.get('bestParams')}")
    
    print(f"\n--- 2. Auto-Tune Optimization (Target: {auto_tune_start_date_str}, Lookback: {lookback}m) ---")
    
    # Notice we use the same ranges natively
    auto_tune_results = OptimizationEngine.run_auto_tune(
        symbol=symbol,
        strategy_id=strategy_id,
        ranges=ranges.copy(),
        timeframe=timeframe,
        start_date_str=auto_tune_start_date_str,
        lookback=lookback,
        metric="sharpe",
        headers=headers,
        config=config
    )
    
    print(f"Auto-Tune Period: {auto_tune_results.get('period')}")
    print(f"Auto-Tune Best Params: {auto_tune_results.get('bestParams')}")
    
    print("\n--- 3. COMPARISON ---")
    print(f"Manual Period: {opt_start_str} to {opt_end_str}")
    print(f"AutoTune Period: {auto_tune_results.get('period')}")
    
    if optuna_results.get("bestParams") == auto_tune_results.get("bestParams"):
        print("✅ SUCCESS: Auto-Tune parameters EXACTLY match manual Optuna parameters!")
    else:
        print("❌ FAILURE: Parameters do not match!")

if __name__ == "__main__":
    verify_auto_tune()
