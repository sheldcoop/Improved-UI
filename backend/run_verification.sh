#!/bin/bash
METRICS=("sharpe" "calmar" "total_return" "drawdown")
BASE_URL="http://localhost:5001/api/v1/optimization/auto-tune"

echo "=== STARTING VERIFICATION SERIES ===" > verification_results.log

for METRIC in "${METRICS[@]}"; do
  echo ">>> Testing Metric: $METRIC <<<" >> verification_results.log
  curl -s -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -d '{
      "symbol": "RELIANCE",
      "strategyId": "1",
      "startDate": "2023-01-01",
      "lookback": 12,
      "scoringMetric": "'$METRIC'",
      "trials": 20,
      "ranges": {
        "period": {"min": 5, "max": 30, "step": 1},
        "lower": {"min": 10, "max": 40, "step": 1},
        "upper": {"min": 60, "max": 90, "step": 1}
      }
    }' | jq . >> verification_results.log
  echo -e "\n\n" >> verification_results.log
  sleep 2
done

echo "=== VERIFICATION SERIES COMPLETE ===" >> verification_results.log
