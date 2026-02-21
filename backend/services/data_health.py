import pandas as pd
import logging
import os
from services.cache_service import CACHE_DIR
from utils.market_calendar import get_nse_trading_days

logger = logging.getLogger(__name__)

class DataHealthService:
    """Service to evaluate and report on market data quality.
    
    Inspects the Parquet cache for missing candles, zero-volume candles,
    and calculates an institutional-grade health score.
    """

    MISSING_PENALTY = 5.0
    ZERO_VOL_PENALTY = 0.1

    @staticmethod
    def compute(symbol: str, timeframe: str, from_date: str, to_date: str) -> dict:
        """Compute a DataHealthReport by inspecting the Parquet cache."""
        if not os.path.exists(CACHE_DIR):
            os.makedirs(CACHE_DIR, exist_ok=True)
            
        safe_symbol = symbol.replace(" ", "_").replace("/", "_")
        parquet_path = None
        
        # Provider-agnostic check: find any parquet file for this symbol/timeframe
        if os.path.exists(CACHE_DIR):
            for f in os.listdir(CACHE_DIR):
                if f.startswith(f"{safe_symbol}_{timeframe}") and f.endswith(".parquet"):
                    parquet_path = os.path.join(CACHE_DIR, f)
                    break

        start_dt = pd.Timestamp(from_date)
        end_dt = pd.Timestamp(to_date)

        if parquet_path is None or not os.path.exists(parquet_path):
            return DataHealthService._build_empty_report("No cached data found. Run a backtest first to populate the cache.")

        try:
            df = pd.read_parquet(parquet_path)
            # Standardize columns to lowercase and deduplicate
            df.columns = [c.lower() for c in df.columns]
            df = df.loc[:, ~df.columns.duplicated()]
            df = df[(df.index >= start_dt) & (df.index <= end_dt)]
        except Exception as e:
            logger.warning(f"Failed to read cache for health check: {e}")
            return DataHealthService._build_empty_report("Failed to read cache file.")

        total = len(df)
        if total == 0:
            return DataHealthService._build_empty_report("No data in the requested date range.")

        # Zero-volume candles
        vol_col = "volume"
        if vol_col in df.columns:
            # sum() on a boolean mask returns a scalar if column is unique
            zero_vol = int((df[vol_col] == 0).sum())
        else:
            zero_vol = 0
        # Detect gaps
        missing, gaps = DataHealthService._detect_gaps(df, timeframe, start_dt, end_dt)
        
        # Scoring
        raw_score = 100 - (missing * DataHealthService.MISSING_PENALTY) - (zero_vol * DataHealthService.ZERO_VOL_PENALTY)
        score = round(max(0.0, min(100.0, raw_score)), 1)

        if score >= 98:
            status = "EXCELLENT"
        elif score >= 85:
            status = "GOOD"
        elif score >= 60:
            status = "POOR"
        else:
            status = "CRITICAL"

        return {
            "score": score,
            "missingCandles": missing,
            "zeroVolumeCandles": zero_vol,
            "totalCandles": total,
            "gaps": gaps,
            "status": status,
        }

    @staticmethod
    def _detect_gaps(df: pd.DataFrame, timeframe: str, start_dt: pd.Timestamp, end_dt: pd.Timestamp) -> tuple[int, list]:
        """Detect missing candles and gaps based on trading calendar."""
        if timeframe == "1d":
            expected_days = get_nse_trading_days(start_dt.date(), end_dt.date())
            actual_days = df.index.normalize().unique()
            missing_days = expected_days.difference(actual_days)
            return len(missing_days), [str(d.date()) for d in missing_days[:10]]
            
        try:
            if timeframe == "15m":
                candles_per_day = 25
            elif timeframe == "1h":
                # 9:15 -> 10:15, 11:15, 12:15, 13:15, 14:15, 15:15, 15:30 (total 7)
                candles_per_day = 7
            else:
                interval_mins = int(timeframe[:-1]) if timeframe[-1] == 'm' else 60
                candles_per_day = 375 // interval_mins
            
            expected_trading_days = get_nse_trading_days(start_dt.date(), end_dt.date())
            expected_total = len(expected_trading_days) * candles_per_day
            
            total = len(df)
            missing = max(0, expected_total - total)
            
            diffs = df.index.to_series().diff()
            mask = (diffs > pd.Timedelta(minutes=interval_mins))
            gaps = [str(d) for d in df.index[mask][:10]]
            return missing, gaps
        except Exception:
            return 0, []

    @staticmethod
    def _build_empty_report(note: str) -> dict:
        """Helper to build a zeroed-out critical report."""
        return {
            "score": 0.0,
            "missingCandles": 0,
            "zeroVolumeCandles": 0,
            "totalCandles": 0,
            "gaps": [],
            "status": "CRITICAL",
            "note": note,
        }
