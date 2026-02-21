import os
import sys
import logging
import argparse
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

# Add backend to path to import services
sys.path.append(os.path.join(os.path.dirname(__file__)))

from services.dhan_historical import DhanHistoricalService
from services.scrip_master import get_instrument_by_symbol
from services.data_cleaner import DataCleaner
from utils.market_calendar import get_nse_trading_days

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("DataAnalyst")

class DataQualityAnalyst:
    """Institutional-grade Market Data Quality Analyst.
    
    Performs statistical profiling, continuity checks, and cross-timeframe 
    validation to ensure data integrity for systematic trading.
    """

    def __init__(self, symbol: str, days: int = 5):
        self.symbol = symbol
        self.days = days
        self.service = DhanHistoricalService()
        self.instrument = get_instrument_by_symbol(symbol)
        
        if not self.instrument:
            raise ValueError(f"Symbol {symbol} not found in Scrip Master.")
            
        self.to_date = datetime.now().strftime("%Y-%m-%d")
        self.from_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        self.data_frames: Dict[str, pd.DataFrame] = {}

    def fetch_all_timeframes(self):
        """Fetch data for 1m, 5m, 15m, and 1d."""
        timeframes = ["1m", "5m", "15m", "1d"]
        logger.info(f"--- Fetching Data for {self.symbol} ({self.from_date} to {self.to_date}) ---")
        
        for tf in timeframes:
            try:
                df = self.service.fetch_ohlcv(
                    security_id=self.instrument["security_id"],
                    exchange_segment=self.instrument["exchange_segment"],
                    instrument_type=self.instrument["instrument_type"],
                    timeframe=tf,
                    from_date=self.from_date,
                    to_date=self.to_date
                )
                if df.empty:
                    logger.warning(f"No data returned for timeframe: {tf}")
                else:
                    self.data_frames[tf] = df
                    logger.info(f"Loaded {len(df)} candles for {tf}")
            except Exception as e:
                logger.error(f"Failed to fetch {tf} data: {e}")

    def run_analysis(self):
        """Execute comprehensive data quality analysis."""
        if not self.data_frames:
            logger.error("No data available for analysis.")
            return

        report = []
        report.append(f"\n{'='*60}")
        report.append(f" MARKET DATA QUALITY REPORT: {self.symbol}")
        report.append(f" Range: {self.from_date} to {self.to_date}")
        report.append(f"{'='*60}\n")

        # 1. Statistical Profiling (using 1m data)
        if "1m" in self.data_frames:
            report.append(self._analyze_statistical_profile(self.data_frames["1m"], "1m"))
        
        # 2. Continuity & Gap Analysis
        for tf, df in self.data_frames.items():
            report.append(self._analyze_continuity(df, tf))

        # 3. Expected Candle Count Validation (Market Hours)
        report.append(self._validate_candle_counts())

        # 4. Cross-timeframe Alignment
        if "1m" in self.data_frames and "5m" in self.data_frames:
            report.append(self._validate_alignment("1m", "5m"))
        
        if "5m" in self.data_frames and "15m" in self.data_frames:
            report.append(self._validate_alignment("5m", "15m"))

        print("\n".join(report))

    def _analyze_statistical_profile(self, df: pd.DataFrame, tf: str) -> str:
        """Analyze price distributions and returns."""
        returns = df['close'].pct_change().dropna()
        mean_ret = returns.mean()
        std_ret = returns.std()
        
        # Outliers (3 standard deviations)
        z_scores = (returns - mean_ret) / std_ret
        outliers = returns[np.abs(z_scores) > 3]
        
        lines = [f"[STATISTICAL PROFILE - {tf}]"]
        lines.append(f"  - Mean Return: {mean_ret:.6%}")
        lines.append(f"  - Volatility (Std Dev): {std_ret:.6%}")
        lines.append(f"  - Outliers Detected (Z > 3): {len(outliers)}")
        if not outliers.empty:
            extreme = outliers.abs().idxmax()
            lines.append(f"  - Max Move: {outliers[extreme]:.2%} at {extreme}")
        
        # Volume profile
        avg_vol = df['volume'].mean()
        zero_vol = (df['volume'] == 0).sum()
        lines.append(f"  - Avg Volume: {avg_vol:.2f}")
        lines.append(f"  - Zero Volume Candles: {zero_vol} ({zero_vol/len(df):.1%})")

        # Missing Data / NaN Checks
        nan_counts = df.isna().sum()
        total_nans = nan_counts.sum()
        lines.append(f"  - Missing Values (NaN): {total_nans}")
        if total_nans > 0:
            for col, count in nan_counts[nan_counts > 0].items():
                lines.append(f"    * {col}: {count}")

        # Zero Price Check
        zero_prices = (df[['open', 'high', 'low', 'close']] <= 0).sum().sum()
        lines.append(f"  - Zero/Negative Price Instances: {zero_prices}")
        
        return "\n".join(lines) + "\n"

    def _analyze_continuity(self, df: pd.DataFrame, tf: str) -> str:
        """Check for time gaps and duplicates."""
        lines = [f"[CONTINUITY CHECK - {tf}]"]
        
        # Duplicates
        dupes = df.index.duplicated().sum()
        lines.append(f"  - Duplicate Timestamps: {dupes}")
        
        # Frequency detection
        if tf.endswith('m'):
            freq_mins = int(tf[:-1])
            expected_delta = pd.Timedelta(minutes=freq_mins)
            
            # Check for gaps (excluding non-market hours is tricky, so we just look for large gaps)
            diffs = df.index.to_series().diff()
            # A gap > timeframe usually means missing data OR end of day
            gaps = diffs[diffs > expected_delta]
            
            # Filter gaps that are likely mid-market (e.g., < 15 hours)
            market_gaps = gaps[gaps < pd.Timedelta(hours=15)]
            lines.append(f"  - Potential Mid-Market Gaps: {len(market_gaps)}")
            for ts, gap in market_gaps.head(3).items():
                lines.append(f"    * Gap of {gap} at {ts}")
        
        return "\n".join(lines) + "\n"

    def _validate_alignment(self, low_tf: str, high_tf: str) -> str:
        """Verify that high TF OHLC matches constituent low TF candles."""
        df_low = self.data_frames[low_tf]
        df_high = self.data_frames[high_tf]
        
        lines = [f"[ALIGNMENT VALIDATION: {low_tf} vs {high_tf}]"]
        
        errors = 0
        samples = 0
        
        for ts, row in df_high.head(100).iterrows(): # Sample first 100 for speed
            # Get constituent data
            interval = int(high_tf[:-1]) if high_tf[-1] == 'm' else 1440
            low_interval = int(low_tf[:-1]) if low_tf[-1] == 'm' else 1
            
            end_ts = ts + pd.Timedelta(minutes=interval - 1)
            constituent = df_low[(df_low.index >= ts) & (df_low.index <= end_ts)]
            
            if constituent.empty:
                continue
                
            samples += 1
            c_high = constituent['high'].max()
            c_low = constituent['low'].min()
            
            # Allow for tiny float precision differences
            if abs(row['high'] - c_high) > 0.01 or abs(row['low'] - c_low) > 0.01:
                errors += 1
                if errors <= 1:
                    lines.append(f"  - DISCREPANCY at {ts}:")
                    lines.append(f"    {high_tf} High: {row['high']}, {low_tf} Aggregated High: {c_high}")
        
        if samples > 0:
            lines.append(f"  - Match Rate: {(samples-errors)/samples:.1%} ({samples} candles checked)")
        else:
            lines.append("  - No overlapping data for alignment check.")
            
        return "\n".join(lines) + "\n"

    def _validate_candle_counts(self) -> str:
        """Validate candle counts against NSE market hours (9:15 - 15:30)."""
        lines = ["[CANDLE COUNT VALIDATION (Market Hours)]"]
        
        trading_days = get_nse_trading_days(
            pd.to_datetime(self.from_date).date(), 
            pd.to_datetime(self.to_date).date()
        )
        num_days = len(trading_days)
        lines.append(f"  - Trading Days in Range: {num_days}")
        
        if num_days == 0:
            return "\n".join(lines) + "  - No trading days detected in range.\n"

        for tf, df in self.data_frames.items():
            if tf == "1d":
                expected = num_days
            else:
                try:
                    interval = int(tf[:-1])
                    expected = num_days * (375 // interval)
                except ValueError:
                    continue
            
            actual = len(df)
            diff = expected - actual
            status = "PASS" if diff == 0 else "FAIL" if diff > 0 else "EXTRA"
            
            lines.append(f"  - {tf:3}: Expected: {expected:4}, Actual: {actual:4} | Status: {status} ({diff} diff)")

        return "\n".join(lines) + "\n"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Dhan Market Data Quality Analyst")
    parser.add_argument("--symbol", type=str, required=True, help="Stock symbol (e.g. RELIANCE)")
    parser.add_argument("--days", type=int, default=5, help="Number of days to analyze")
    
    args = parser.parse_args()
    
    try:
        analyst = DataQualityAnalyst(args.symbol, args.days)
        analyst.fetch_all_timeframes()
        analyst.run_analysis()
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        sys.exit(1)
