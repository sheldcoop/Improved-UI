import json
import uuid
import sys

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

# Mock Strategy
mock_strategy = MagicMock()
mock_strategy.generate_signals.return_value = (
    pd.Series([False, True, False, False, False, False, False, False, False, False]), # Entry at idx=1
    pd.Series([False, False, False, False, True, False, False, False, False, False]),  # Exit at idx=4
    [],
    {}
)

# Run
with patch("services.data_fetcher.DataFetcher.fetch_historical_data", return_value=df), \
     patch("strategies.presets.StrategyFactory.get_strategy", return_value=mock_strategy):
    res, summ = ReplayEngine._simulate(
        symbol="MOCK", 
        strategy_id="1", 
        timeframe="1d", 
        config={"nextBarEntry": False}, 
        capital_pct=10, 
        virtual_capital=100000, 
        sl_pct=2.0, 
        tp_pct=2.0,
        slippage=0.05,
        commission=40.0,
        df=df
    )
    import json
    closed_events = [e for e in res if e["type"] == "TRADE_CLOSED"]
    print(json.dumps(closed_events, indent=2))
