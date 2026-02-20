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

print("Running Auto-Tune with reproducible=True...")
res1 = requests.post(url, json=payload, headers=headers)
print("Response JSON:")
print(json.dumps(res1.json(), indent=2))
