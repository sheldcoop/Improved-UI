import pandas as pd
import logging
import os
from services.cache_service import CACHE_DIR
class DataHealthService:
    """Service to evaluate and report on market data anomalies.
    
    Inspects the Parquet cache for missing candles (via timeline gaps), 
    null values, and session boundary violations.
    """

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

            # Date Range Filtering (Localized logic matching DataFetcher)
            if df.index.tz:
                if not start_dt.tz:
                    start_dt = start_dt.tz_localize(df.index.tz)
                if not end_dt.tz:
                    end_dt = end_dt.tz_localize(df.index.tz)
            
            # Use inclusive end for daily data consistency
            inclusive_end = end_dt + pd.Timedelta(days=1, microseconds=-1)
            
            df = df[(df.index >= start_dt) & (df.index <= inclusive_end)]
        except Exception as e:
            logger.warning(f"Failed to read cache for health check: {e}")
            return DataHealthService._build_empty_report("Failed to read cache file.")

        total = len(df)
        if total == 0:
            return DataHealthService._build_empty_report("No data in the requested date range.")

        # 1. Zero-volume candles
        vol_col = "volume"
        zero_vol = 0
        if vol_col in df.columns:
            zero_vol = int((df[vol_col] == 0).sum())

        # 2. Null/NaN Values
        null_count, null_details = DataHealthService._check_nulls(df)

        # 3. Detect timeline gaps
        gap_count, gaps = DataHealthService._detect_gaps(df, timeframe)
        
        # 4. Geometric Integrity (Low <= Open/Close <= High)
        geo_failures, geo_details = DataHealthService._check_geometry(df)
        
        # 5. Flash Spikes / Bad Prints
        spike_failures, spike_details = DataHealthService._check_spikes(df)
        
        # 6. Session Boundaries (9:15 - 15:30)
        session_failures, session_details = DataHealthService._check_session(df, timeframe)
        
        # 7. Stale Prices (Flatlines)
        stale_failures, stale_details = DataHealthService._check_stale(df)
        
        # Combined issue details
        all_details = []
        if null_details: all_details.extend([f"Null: {d}" for d in null_details])
        if geo_details: all_details.extend([f"Geometry: {d}" for d in geo_details])
        if spike_details: all_details.extend([f"Spike: {d}" for d in spike_details])
        if session_details: all_details.extend([f"Session: {d}" for d in session_details])
        if stale_details: all_details.extend([f"Stale: {d}" for d in stale_details])

        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "totalCandles": total,
            "nullCandles": null_count,
            "gapCount": gap_count,
            "zeroVolumeCandles": zero_vol,
            "geometricFailures": geo_failures,
            "spikeFailures": spike_failures,
            "sessionFailures": session_failures,
            "staleFailures": stale_failures,
            "gaps": gaps,
            "details": all_details[:20],
            "status": "AUDITED" if not all_details else "ANOMALIES_DETECTED",
        }

    @staticmethod
    def _check_nulls(df: pd.DataFrame) -> tuple[int, list]:
        """Detect candles containing NaN or Null values."""
        mask = df.isnull().any(axis=1)
        count = int(mask.sum())
        details = [str(d) for d in df.index[mask][:5]]
        return count, details

    @staticmethod
    def _check_geometry(df: pd.DataFrame) -> tuple[int, list]:
        """Verify High is max and Low is min for every candle."""
        cols = ["open", "high", "low", "close"]
        if not all(c in df.columns for c in cols):
            return 0, []
        
        # High must be >= all others
        bad_high = (df["high"] < df["open"]) | (df["high"] < df["close"]) | (df["high"] < df["low"])
        # Low must be <= all others
        bad_low = (df["low"] > df["open"]) | (df["low"] > df["close"]) | (df["low"] > df["high"])
        
        mask = bad_high | bad_low
        count = int(mask.sum())
        details = [str(d) for d in df.index[mask][:5]]
        return count, details

    @staticmethod
    def _check_spikes(df: pd.DataFrame, threshold: float = 0.03) -> tuple[int, list]:
        """Detect flash spikes where price jumps and reverts quickly."""
        if "close" not in df.columns or len(df) < 3:
            return 0, []
        
        shifted_prev = df["close"].shift(1)
        shifted_next = df["close"].shift(-1)
        
        up_spike = (df["close"] / shifted_prev > 1 + threshold) & (df["close"] / shifted_next > 1 + threshold)
        down_spike = (df["close"] / shifted_prev < 1 - threshold) & (df["close"] / shifted_next < 1 - threshold)
        
        mask = up_spike | down_spike
        count = int(mask.sum())
        details = [str(d) for d in df.index[mask][:5]]
        return count, details

    @staticmethod
    def _check_session(df: pd.DataFrame, timeframe: str) -> tuple[int, list]:
        """Flag data points outside official NSE hours (9:15 - 15:30)."""
        if timeframe == "1d":
            return 0, []
            
        times = df.index.time
        from datetime import time
        start_time = time(9, 15)
        end_time = time(15, 30)
        
        mask = (times < start_time) | (times > end_time)
        count = int(mask.sum())
        details = [str(d) for d in df.index[mask][:5]]
        return count, details

    @staticmethod
    def _check_stale(df: pd.DataFrame, min_bars: int = 15) -> tuple[int, list]:
        """Detect flatlines where price is identical for many bars."""
        if "close" not in df.columns or len(df) < min_bars:
            return 0, []
            
        stale_mask = (df["close"].rolling(window=min_bars).std() == 0)
        count = int(stale_mask.sum())
        details = [str(d) for d in df.index[stale_mask][:5]]
        return count, details

    @staticmethod
    def _detect_gaps(df: pd.DataFrame, timeframe: str) -> tuple[int, list]:
        """Detect timeline gaps based strictly on sequence continuity."""
        if len(df) < 2:
            return 0, []
            
        try:
            from datetime import time
            if timeframe == "1d":
                timeout = pd.Timedelta(days=1)
            else:
                mins = int(timeframe[:-1]) if timeframe[-1] == 'm' else 60
                timeout = pd.Timedelta(minutes=mins)
            
            diffs = df.index.to_series().diff()
            
            # A gap is when the difference is greater than the expected timeframe
            # and it's not a standard overnight transition (e.g. 15:30 -> 09:15 next day)
            mask = (diffs > timeout)
            
            # Simple heuristic: ignore gaps occurring exactly at market open
            mask &= (df.index.time != time(9, 15))
            
            count = int(mask.sum())
            gaps = [str(d) for d in df.index[mask][:10]]
            return count, gaps
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
