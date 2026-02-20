import os
import sys
from pathlib import Path
from datetime import datetime, timedelta
import pandas as pd
from dotenv import load_dotenv

# Add backend to path
sys.path.append(str(Path(__file__).resolve().parent / "backend"))

load_dotenv("backend/.env")

from services.dhan_historical import fetch_historical_data
from services.scrip_master import get_instrument_by_symbol

def inspect_data():
    symbol = "RELIANCE"
    timeframe = "1d"
    inst = get_instrument_by_symbol(symbol)
    
    if not inst:
        print(f"Error: Symbol {symbol} not found")
        return

    to_date = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")

    print(f"--- Fetching Case 1: Daily {symbol} ---")
    df_daily = fetch_historical_data(
        security_id=inst["security_id"],
        exchange_segment=inst["exchange_segment"],
        instrument_type=inst["instrument_type"],
        timeframe=timeframe,
        from_date=from_date,
        to_date=to_date
    )

    if df_daily is not None and not df_daily.empty:
        print("\nDaily Index (First 3):")
        print(df_daily.index[:3])
        print("Daily Index TzInfo:", df_daily.index.tzinfo)
        print("Daily Duplicate count:", df_daily.index.duplicated().sum())
        print("Daily Min Close:", df_daily['close'].min())
    else:
        print("Daily fetch failed or empty")

    print(f"\n--- Fetching Case 2: Intraday (5m) {symbol} ---")
    df_intra = fetch_historical_data(
        security_id=inst["security_id"],
        exchange_segment=inst["exchange_segment"],
        instrument_type=inst["instrument_type"],
        timeframe="5m",
        from_date=from_date,
        to_date=to_date
    )

    if df_intra is not None and not df_intra.empty:
        print("\nIntraday Index (First 3):")
        print(df_intra.index[:3])
        print("Intraday Index TzInfo:", df_intra.index.tzinfo)
        print("Intraday Dayofweek (Sunday=6):", df_intra.index.dayofweek.unique().tolist())
        print("Intraday Time Range:", df_intra.index.time.min(), "to", df_intra.index.time.max())
    else:
        print("Intraday fetch failed or empty")

if __name__ == "__main__":
    inspect_data()
