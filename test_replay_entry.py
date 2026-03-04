import json
from datetime import datetime
from services.replay_engine import ReplayEngine
import pandas as pd

# Mock data
dates = pd.date_range("2024-01-01", periods=10, freq="1d")
df = pd.DataFrame({
    "open": [100]*10,
    "high": [105]*10,
    "low": [95]*10,
    "close": [102]*10,
    "volume": [1000]*10,
}, index=dates)

# Mock fetcher
import sys
from unittest.mock import patch
with patch("services.data_fetcher.DataFetcher.fetch_historical_data", return_value=df):
    result = ReplayEngine.run("MOCK", "1", "1d", "2024-01-01", "2024-01-10", slippage=0, commission=0)
    
closed_events = [e for e in result["events"] if e["type"] == "TRADE_CLOSED"]
if closed_events:
    print(json.dumps(closed_events[0], indent=2))
else:
    print("No trades closed")
