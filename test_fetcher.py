from datetime import datetime
import pandas as pd
import json

from services.data_fetcher import DataFetcher
from services.dhan_fetcher import DhanDataFetcher
from services.broker_service import get_broker_client

try:
    fetcher = DataFetcher({})
    df = fetcher.fetch_historical_data("PNB", "15m", "2024-01-01", "2024-01-10")
    if not df.empty:
        print("Columns: ", df.columns)
        print("First row open: ", df.iloc[0]["open"] if "open" in df.columns else "MISSING")
        print("First row Open: ", df.iloc[0]["Open"] if "Open" in df.columns else "MISSING")
        print("Head: ")
        print(df.head(2))
    else:
        print("Empty DataFrame returned.")
except Exception as e:
    print("Error fetching: ", str(e))
