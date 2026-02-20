import os
import sys
import pandas as pd
from dotenv import load_dotenv

sys.path.append(os.path.join(os.getcwd(), 'DhanHQ-py-main', 'src'))

from dhanhq import dhanhq
from dhanhq import DhanContext

load_dotenv('backend/.env')
client_id = os.getenv("DHAN_CLIENT_ID")
access_token = os.getenv("DHAN_ACCESS_TOKEN")

ctx = DhanContext(client_id, access_token)
dhan = dhanhq(ctx)

print("Fetching Intraday 15m Data for PNB (10666) via Official Library...")
try:
    resp = dhan.intraday_daily_minute_charts(
        security_id="10666",
        exchange_segment="NSE_EQ",
        instrument_type="EQUITY"
    )
    
    # Check if successful response format
    if "data" in resp and isinstance(resp["data"], dict) and "start_Time" in resp["data"]:
        print("✅ Data fetched successfully via intraday_daily_minute_charts!")
        
        timestamps = resp["data"]["start_Time"]
        
        print(f"Number of candles: {len(timestamps)}")
        print(f"Raw Epochs (first 10): {timestamps[:10]}")
        
    else:
        print(f"❌ Unrecognized response or failure: {resp}")

except Exception as e:
    print(f"❌ Error during fetch: {e}")

