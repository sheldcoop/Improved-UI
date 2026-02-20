import requests
import json
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')
access_token = os.getenv("DHAN_ACCESS_TOKEN")

headers = {
    "access-token": access_token,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

payload = {
    "securityId": "10666",  # PNB
    "exchangeSegment": "NSE_EQ",
    "instrument": "EQUITY",
    "interval": "15",
    "oi": False,
    "fromDate": "2024-02-12 09:15:00",
    "toDate": "2024-02-13 15:30:00"
}

url = "https://api.dhan.co/v2/charts/intraday"
resp = requests.post(url, headers=headers, json=payload)
print(f"Status: {resp.status_code}")
data = resp.json()
if "timestamp" in data:
    ts = data["timestamp"]
    import datetime
    print(f"First 5 epochs: {ts[:5]}")
    for t in ts[:5]:
        print(f"Epoch: {t} -> UTC: {datetime.datetime.utcfromtimestamp(t)} -> Local: {datetime.datetime.fromtimestamp(t)}")
else:
    print(data)
