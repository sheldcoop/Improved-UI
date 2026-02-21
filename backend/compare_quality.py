import os
import sys
import json
import pandas as pd
from datetime import datetime, timedelta

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__)))

from services.data_fetcher import DataFetcher
from services.data_health import DataHealthService
from analyze_data_quality import DataQualityAnalyst

def run_comparison(symbol: str, timeframe: str, days: int):
    print(f"--- Comparing Quality Reports for {symbol} ({timeframe}) ---")
    
    to_date = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    # 1. Ensure data is cached (using DataFetcher)
    fetcher = DataFetcher()
    print(f"Fetching data via DataFetcher to populate cache...")
    fetcher.fetch_historical_data(symbol, timeframe, from_date, to_date)
    
    # 2. Get report from existing DataHealthService
    print(f"Running DataHealthService.compute...")
    health_report = DataHealthService.compute(symbol, timeframe, from_date, to_date)
    
    # 3. Get report from my new DataQualityAnalyst
    print(f"Running DataQualityAnalyst analysis...")
    analyst = DataQualityAnalyst(symbol, days)
    analyst.fetch_all_timeframes()
    
    # We need to extract the metrics from DataQualityAnalyst programmatically or just look at the printed output
    # For a fair comparison, let's just print both and explain.
    
    print("\n" + "="*60)
    print(" EXISTING DataHealthService REPORT")
    print("="*60)
    print(json.dumps(health_report, indent=2))
    
    print("\n" + "="*60)
    print(" NEW DataQualityAnalyst REPORT")
    print("="*60)
    analyst.run_analysis()

if __name__ == "__main__":
    symbol = "RELIANCE"
    timeframe = "1m"
    days = 2
    
    run_comparison(symbol, timeframe, days)
