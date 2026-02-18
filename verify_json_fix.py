import math
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from utils.json_utils import clean_float_values

def test_clean_float_values():
    test_data = {
        "metrics": {
            "sharpeRatio": float('nan'),
            "totalReturnPct": 12.5,
            "maxDrawdownPct": float('inf'),
            "recoveryFactor": float('-inf')
        },
        "trades": [
            {"pnl": 100.0, "pnlPct": 1.0},
            {"pnl": float('nan'), "pnlPct": float('nan')}
        ]
    }
    
    cleaned = clean_float_values(test_data)
    
    print("Cleaned Data:", cleaned)
    
    assert cleaned["metrics"]["sharpeRatio"] == 0.0
    assert cleaned["metrics"]["maxDrawdownPct"] == 0.0
    assert cleaned["metrics"]["recoveryFactor"] == 0.0
    assert cleaned["trades"][1]["pnl"] == 0.0
    assert cleaned["trades"][1]["pnlPct"] == 0.0
    assert cleaned["metrics"]["totalReturnPct"] == 12.5
    
    print("✅ All tests passed!")

if __name__ == "__main__":
    try:
        test_clean_float_values()
    except Exception as e:
        print(f"❌ Test failed: {e}")
        sys.exit(1)
