import requests
import json

url = "http://127.0.0.1:5001/api/v1/optimization/auto-tune"
payload = {
    "symbol": "NIFTY 50",
    "strategyId": "1",
    "ranges": {
        "period": {"min": 5, "max": 20, "step": 1},
        "lower": {"min": 20, "max": 40, "step": 1},
        "upper": {"min": 60, "max": 80, "step": 1},
        "reproducible": True
    },
    "startDate": "2023-01-01",
    "lookbackMonths": 12,
    "scoringMetric": "sharpe"
}

headers = {"Content-Type": "application/json"}
res1 = requests.post(url, json=payload, headers=headers)
print(json.dumps(res1.json(), indent=2))
