
import unittest
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

def calculate_windows(start_date_str, lookback_months):
    """Mirror of the logic in optimization_routes.py"""
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    
    # Auto-Tune Lookback Window
    is_end = start_date - timedelta(days=1)
    is_start = is_end - relativedelta(months=lookback_months)
    
    # Backtest Window
    bt_start = start_date
    
    return {
        "optuna": (is_start, is_end),
        "backtest": bt_start
    }

class TestTemporalSeparation(unittest.TestCase):
    def test_zero_overlap(self):
        cases = [
            ("2023-01-01", 12),
            ("2024-02-29", 3),   # Leap year
            ("2020-01-01", 24),
            ("2023-12-31", 1)
        ]
        
        for date_str, months in cases:
            windows = calculate_windows(date_str, months)
            optuna_start, optuna_end = windows["optuna"]
            bt_start = windows["backtest"]
            
            # Assertions
            self.assertLess(optuna_end, bt_start, f"Overlap detected for {date_str}, {months}m")
            self.assertEqual((bt_start - optuna_end).days, 1, f"Gap is not exactly 1 day for {date_str}")
            print(f"✅ Verified: Lookback [{optuna_start.date()} to {optuna_end.date()}] is disjoint from Backtest start [{bt_start.date()}]")

if __name__ == "__main__":
    unittest.main()
