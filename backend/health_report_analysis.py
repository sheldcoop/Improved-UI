"""Ad‑hoc health‑report analysis script

This standalone script behaves like a data engineer’s quick notebook: it
loads the cached parquet file for a given symbol/timeframe, restricts the
date range, and computes missing/zero‑volume counts, gaps and an overall
quality score.  It uses only pandas and the existing market calendar helper
for expected trading days, and it can be run from the command line.

Usage example (from project root):

    python3 backend/health_report_analysis.py PNB 1d 2023-01-01 2025-03-28

No other parts of the application are imported; this is completely
detached from the Flask server.
"""

import sys
from pathlib import Path
import pandas as pd

# reuse calendar util for trading days
from utils.market_calendar import get_nse_trading_days

CACHE_DIR = Path(__file__).parent / "cache_dir"
MISSING_PENALTY = 5.0
ZERO_VOL_PENALTY = 0.1


def analyze(symbol: str, timeframe: str, start: str, end: str) -> dict:
    """Load parquet and compute health metrics."""
    safe = symbol.replace(" ", "_").replace("/", "_")
    path = None
    for f in CACHE_DIR.iterdir():
        if f.name.startswith(f"{safe}_{timeframe}") and f.suffix == ".parquet":
            path = f
            break

    if path is None or not path.exists():
        raise FileNotFoundError(f"no cache file for {symbol} {timeframe}")

    df = pd.read_parquet(path)
    df = df[(df.index >= pd.Timestamp(start)) & (df.index <= pd.Timestamp(end))]

    total = len(df)
    if total == 0:
        return {"score": 0.0, "missing": 0, "zero_vol": 0, "total": 0, "gaps": [], "status": "CRITICAL"}

    vol_col = "Volume" if "Volume" in df.columns else "volume"
    zero_vol = int((df[vol_col] == 0).sum()) if vol_col in df.columns else 0

    # gap detection
    start_dt = pd.Timestamp(start)
    end_dt = pd.Timestamp(end)
    if timeframe == "1d":
        ready_days = get_nse_trading_days(start_dt.date(), end_dt.date())
        actual = df.index.normalize().unique()
        missing_days = ready_days.difference(actual)
        missing = len(missing_days)
        gaps = [str(d) for d in missing_days[:10]]
    else:
        try:
            interval_mins = int(timeframe[:-1]) if timeframe[-1] == 'm' else 60
            candles_per_day = 375 // interval_mins
            exp_days = get_nse_trading_days(start_dt.date(), end_dt.date())
            exp_total = len(exp_days) * candles_per_day
            missing = max(0, exp_total - total)
            diffs = df.index.to_series().diff()
            mask = (diffs > pd.Timedelta(minutes=interval_mins))
            gaps = [str(d) for d in df.index[mask][:10]]
        except Exception:
            missing = 0
            gaps = []

    raw_score = 100 - (missing * MISSING_PENALTY) - (zero_vol * ZERO_VOL_PENALTY)
    score = max(0.0, min(100.0, raw_score))
    if score >= 98:
        status = "EXCELLENT"
    elif score >= 85:
        status = "GOOD"
    elif score >= 60:
        status = "POOR"
    else:
        status = "CRITICAL"

    result = {
        "score": round(score, 1),
        "missingCandles": missing,
        "zeroVolumeCandles": zero_vol,
        "totalCandles": total,
        "gaps": gaps,
        "status": status,
    }
    # also attach unique zero-volume times for diagnostics
    if zero_vol > 0:
        times = pd.Series(df[df[vol_col] == 0].index.time).unique()
        result["zeroVolumeTimes"] = sorted(str(t) for t in times)
    return result


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("usage: script.py SYMBOL TIMEFRAME START END")
        sys.exit(1)
    sym, tf, st, ed = sys.argv[1:5]
    result = analyze(sym, tf, st, ed)
    print(result)
