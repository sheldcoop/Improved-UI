import requests
import json
import time

url = "http://127.0.0.1:5001/api/optimization/auto-tune"
payload = {
    "symbol": "NIFTY 50",
    "strategyId": "1",
    "ranges": {
        "period": {"min": 5, "max": 20, "step": 1},
        "lower": {"min": 20, "max": 40, "step": 1},
        "upper": {"min": 60, "max": 80, "step": 1}
    },
    "startDate": "2023-01-01",
    "lookbackMonths": 12,
    "scoringMetric": "sharpe",
    "reproducible": True
}

headers = {"Content-Type": "application/json"}

print("Running Auto-Tune with reproducible=True (Run 1)...")
res1 = requests.post(url, json=payload, headers=headers)
print("Run 1 complete.")

print("Running Auto-Tune with reproducible=True (Run 2)...")
res2 = requests.post(url, json=payload, headers=headers)
print("Run 2 complete.")

if res1.status_code == 200 and res2.status_code == 200:
    data1 = res1.json()
    data2 = res2.json()
    best1 = data1.get('bestParams')
    best2 = data2.get('bestParams')
    
    match = best1 == best2
    print(f"Results Match? {match}")
    if not match:
        print("Run 1 Best Params:", best1)
        print("Run 2 Best Params:", best2)
else:
    print("API Error:", res1.text, res2.text)

