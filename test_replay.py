import json
from services.replay_engine import ReplayEngine
import pandas as pd
from unittest.mock import patch, MagicMock

# Create a mock DataFetcher that returns a full dataset
dates = pd.date_range("2024-01-01", periods=10, freq="1d")
df = pd.DataFrame({
    "open": [100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0, 108.0, 109.0],
    "high": [105.0]*10,
    "low": [95.0]*10,
    "close": [102.0, 103.0, 104.0, 105.0, 106.0, 107.0, 108.0, 109.0, 110.0, 111.0],
    "volume": [1000]*10,
}, index=dates)

entries = pd.Series([False, True, False, False, False, False, False, False, False, False])
exits = pd.Series([False, False, False, False, True, False, False, False, False, False])

with patch("services.data_fetcher.DataFetcher.fetch_historical_data", return_value=df):
    res, summ = ReplayEngine._simulate(
        symbol="MOCK", 
        entries=entries,
        exits=exits,
        sides=pd.Series(["LONG"]*10),
        indicators={},
        df=df,
        capital_pct=10, 
        virtual_capital=100000, 
        sl_pct=2.0, 
        tp_pct=2.0,
        slippage=0.05,
        commission=40.0,
        next_bar_entry=False
    )
    import json
    closed_events = [e for e in res if e["type"] == "TRADE_CLOSED"]
    print(json.dumps(closed_events, indent=2))
