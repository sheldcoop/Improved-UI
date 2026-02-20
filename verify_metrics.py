import sys
import json
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent / "backend"))

from services.data_fetcher import DataFetcher
from services.optimizer import OptimizationEngine
from services.backtest_engine import BacktestEngine

def verify_all_metrics():
    symbol = "RELIANCE"
    timeframe = "1d"
    from_date = "2025-05-01"
    to_date = "2026-02-20"
    
    strategy_id = "1" # RSI
    ranges = {
        "period": {"min": 10, "max": 15, "step": 5},
        "lower": {"min": 20, "max": 40, "step": 10},
        "upper": {"min": 60, "max": 80, "step": 10},
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
    
    headers = {}
    metrics_to_test = ["sharpe", "calmar", "drawdown", "total_return"]
    
    print(f"--- Firing 4 Optimizations to test EVERY metric ---")
    
    for metric in metrics_to_test:
        print(f"\n======== Testing Metric: {metric.upper()} ========")
        optuna_results = OptimizationEngine.run_optuna(
            symbol=symbol,
            strategy_id=strategy_id,
            ranges=ranges.copy(),
            headers=headers,
            n_trials=10, 
            scoring_metric=metric,
            reproducible=True,
            config=config
        )
        
        best_params = optuna_results["bestParams"]
        best_grid_item = optuna_results["grid"][0] # It's sorted by score descending
        
        print(f"🥇 Optuna Selected Best Params: {best_params}")
        print(f"   Optuna Graded '{metric}' Score: {best_grid_item['score']}")
        
        # Now run a completely pure Backtest Engine run using these exact params to verify manual parity
        fetcher = DataFetcher(headers)
        df = fetcher.fetch_historical_data(symbol, timeframe, from_date, to_date)
        bt_results = BacktestEngine.run(df, strategy_id, {**config, **best_params})
        bt_metrics = bt_results["metrics"]
        
        print(f"   Manual BacktestEngine Re-calculation:")
        
        if metric == "sharpe":
            bt_score = bt_metrics["sharpeRatio"]
        elif metric == "calmar":
            bt_score = bt_metrics["calmarRatio"]
        elif metric == "drawdown":
            bt_score = -bt_metrics["maxDrawdownPct"] # Optuna stores max drawdown as negative to maximize it
        elif metric == "total_return":
            bt_score = bt_metrics["totalReturnPct"] / 100 # Backtest engine uses %, optuna uses raw float internally for score
            
        # Due to some minor rounding discrepancies between UI format and raw float, we check if they are very close
        match = abs(float(best_grid_item["score"]) - float(bt_score)) < 0.1
        
        if match:
             print(f"   ✅ MATCH CONFIRMED (Auto: {float(best_grid_item['score']):.4f} vs Manual: {float(bt_score):.4f})")
        else:
             print(f"   ❌ MISMATCH DETECTED (Auto: {float(best_grid_item['score']):.4f} vs Manual: {float(bt_score):.4f})")
             print(f"      Full Optuna Row: {best_grid_item}")
             print(f"      Full BT Row: {json.dumps(bt_metrics, indent=2)}")

if __name__ == "__main__":
    verify_all_metrics()
