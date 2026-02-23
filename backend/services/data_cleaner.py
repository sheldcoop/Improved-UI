import pandas as pd
import logging

logger = logging.getLogger(__name__)

class DataCleaner:
    """Institutional-grade market data cleaning service.
    
    Centralizes essential transformation and validation logic.
    - Converts UTC to IST
    - Removes zero/null prices
    - Ensures chronological order uniquely
    """

    @staticmethod
    def fix_timezone(df: pd.DataFrame) -> pd.DataFrame:
        """Adjust UTC timestamps to IST (+5:30)."""
        # Dhan returns Unix timestamps. Pandas assumes UTC.
        if df.index.tzinfo is None:
            df.index = df.index + pd.Timedelta(hours=5, minutes=30)
        return df

    @staticmethod
    def remove_duplicates(df: pd.DataFrame) -> pd.DataFrame:
        """Remove duplicate timestamps, keeping the first occurrence."""
        return df[~df.index.duplicated(keep='first')]

    @staticmethod
    def remove_zero_prices(df: pd.DataFrame) -> pd.DataFrame:
        """Remove rows where the close price is zero or negative."""
        zero_count = len(df[df['close'] <= 0])
        if zero_count > 0:
            logger.warning(f"Found {zero_count} rows with close price ≤ 0 (will be removed)")
        return df[df['close'] > 0]

    @staticmethod
    def remove_nulls(df: pd.DataFrame) -> pd.DataFrame:
        """Remove rows with missing values in critical OHLCV columns."""
        null_count = len(df[df[['open', 'high', 'low', 'close', 'volume']].isna().any(axis=1)])
        if null_count > 0:
            logger.warning(f"Found {null_count} rows with null OHLCV values (will be removed)")
        return df.dropna(subset=['open', 'high', 'low', 'close', 'volume'])

    @staticmethod
    def sort_chronological(df: pd.DataFrame) -> pd.DataFrame:
        """Ensure the dataset is strictly ordered by time."""
        return df.sort_index()

    @staticmethod
    def log_cleaning_report(original_len: int, cleaned_df: pd.DataFrame, symbol: str) -> None:
        """Log a summary of data cleaning actions."""
        removed = original_len - len(cleaned_df)
        pct_loss = (removed / original_len * 100) if original_len > 0 else 0
        if removed > 0:
            logger.info(
                f"✨ DataCleaner [{symbol}]: "
                f"Removed {removed} rows ({pct_loss:.1f}%) | "
                f"Original: {original_len} → Clean: {len(cleaned_df)} | "
                f"Date range: {cleaned_df.index.min()} to {cleaned_df.index.max()}"
            )
        else:
            logger.info(
                f"✨ DataCleaner [{symbol}]: Data clean, no rows removed | "
                f"Clean: {len(cleaned_df)} rows | "
                f"Date range: {cleaned_df.index.min()} to {cleaned_df.index.max()}"
            )

    @staticmethod
    def clean(df: pd.DataFrame, symbol: str = 'unknown', is_intraday: bool = False) -> pd.DataFrame:
        """Master sanitation pipeline. Runs essential cleaning steps in optimal sequence."""
        if df is None or df.empty:
            return df
            
        original_len = len(df)
        
        # 0. Normalize Column Names (Case-Insensitive) and deduplicate
        df.columns = [c.lower() for c in df.columns]
        df = df.loc[:, ~df.columns.duplicated()]
       
        # 1. Temporal Normalization
        df = DataCleaner.fix_timezone(df)
        df = DataCleaner.sort_chronological(df)
        df = DataCleaner.remove_duplicates(df)
        
        # 2. Price/Volume Sanitation
        df = DataCleaner.remove_zero_prices(df)
        df = DataCleaner.remove_nulls(df)
        
        # 3. Final Report
        DataCleaner.log_cleaning_report(original_len, df, symbol)
        
        return df
