import sys
import os
# ensure backend package is importable
sys.path.insert(0, os.path.abspath('backend'))
from app import app
import pandas as pd

with app.test_client() as client:
    df = pd.DataFrame({"Open":[100,101],"High":[101,102],"Low":[99,100],"Close":[100,101],"Volume":[1000,1000]}, index=pd.bdate_range("2023-01-01", periods=2, freq="B"))
    from services.data_fetcher import DataFetcher
    orig = DataFetcher.fetch_historical_data
    DataFetcher.fetch_historical_data = lambda self, *args, **kwargs: df
    payload = {
        "instrument_details": {"security_id":"1","symbol":"TEST","exchange_segment":"NSE_EQ","instrument_type":"EQ"},
        "parameters": {"timeframe":"1d","start_date":"2023-01-01","end_date":"2023-01-02","initial_capital":50000,
                       "strategy_logic":{"id":"1"},"statsFreq":"D","statsWindow":1}
    }
    resp = client.post("/api/v1/market/backtest/run", json=payload)
    print('status', resp.status_code)
    body = resp.get_json()
    print('json', body)
    assert resp.status_code == 200, 'expected 200'
    assert 'returnsStats' in body, 'expected returnsStats key'
    DataFetcher.fetch_historical_data = orig
