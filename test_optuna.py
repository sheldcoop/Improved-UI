import sys
import os
import pandas as pd
import warnings

warnings.filterwarnings("ignore")

# Add backend to path
sys.path.append(os.path.abspath('backend'))
from services.optimizer import OptimizationEngine

cache_dir = "backend/cache_dir"
parquet_files = [f for f in os.listdir(cache_dir) if f.endswith('.parquet')]
if not parquet_files:
    print("No cached data found")
    sys.exit(1)

test_file = parquet_files[0]
df = pd.read_parquet(os.path.join(cache_dir, test_file)).tail(200)

strategy_id = "1"
ranges = {
    "period": {"min": 5, "max": 20, "step": 1},
    "lower": {"min": 20, "max": 40, "step": 1},
    "upper": {"min": 60, "max": 80, "step": 1},
    "reproducible": False
}

print("--- RUN 1: Random Search ---")
best1, _ = OptimizationEngine._find_best_params(df, strategy_id, ranges, "sharpe", return_trials=True)
print(f"Run 1: {best1}")

print("\n--- RUN 2: Random Search ---")
best2, _ = OptimizationEngine._find_best_params(df, strategy_id, ranges, "sharpe", return_trials=True)
print(f"Run 2: {best2}")

ranges["reproducible"] = True
print("\n--- RUN 3: Fixed Seed ---")
best3, _ = OptimizationEngine._find_best_params(df, strategy_id, ranges, "sharpe", return_trials=True)
print(f"Run 3: {best3}")

print("\n--- RUN 4: Fixed Seed ---")
best4, _ = OptimizationEngine._find_best_params(df, strategy_id, ranges, "sharpe", return_trials=True)
print(f"Run 4: {best4}")

