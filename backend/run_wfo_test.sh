#!/bin/bash
BASE_URL="http://localhost:5001/api/v1/optimization/wfo"

echo "=== STARTING WFO VERIFICATION RUN ===" > wfo_verification_results.log

curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "RELIANCE",
    "strategyId": "1",
    "wfoConfig": {
      "trainWindow": 6,
      "testWindow": 3,
      "scoringMetric": "sharpe"
    },
    "ranges": {
      "period": {"min": 5, "max": 30, "step": 1},
      "lower": {"min": 10, "max": 40, "step": 1},
      "upper": {"min": 60, "max": 90, "step": 1}
    }
  }' | jq . >> wfo_verification_results.log

echo -e "\n=== WFO RUN COMPLETE ===" >> wfo_verification_results.log
