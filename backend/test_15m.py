import sys
import os
import pandas as pd
from datetime import datetime
sys.path.append(os.path.dirname(os.path.abspath(__name__)))

from services.data_fetcher import DataFetcher

def run_test():
    symbol = "PNB"
    timeframe = "15m"
    start_date = "2023-01-01"
    end_date = "2023-12-31"
    
    fetcher = DataFetcher({})
    
    # Check what cache has
    try:
        cache_key = f"{symbol}_{timeframe}"
        cached_df = fetcher._load_parquet(cache_key)
        if cached_df is not None:
            print(f"Cache has {len(cached_df)} bars. {cached_df.index[0]} to {cached_df.index[-1]}")
    except Exception as e:
        print(f"Cache error: {e}")
    
    print(f"Fetching data for {symbol} ({timeframe}) from {start_date} to {end_date}...")
    df = fetcher.fetch_historical_data(symbol, timeframe=timeframe, from_date=start_date, to_date=end_date)
    
    if df is None or df.empty:
        print("Failed to fetch data.")
        return
        
    print(f"Returned Data: {len(df)} bars. {df.index[0]} to {df.index[-1]}")

if __name__ == "__main__":
    run_test()
