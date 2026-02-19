import pandas as pd
import logging

logger = logging.getLogger(__name__)

class DataCleaner:
    """Institutional-grade market data cleaning service.
    
    Centralizes all transformation and validation logic to ensure
    consistent data quality across all symbols and timeframes.
    """

    @staticmethod
    def fix_timezone(df: pd.DataFrame) -> pd.DataFrame:
        """Adjust UTC timestamps to IST (+5:30)."""
        # Dhan returns Unix timestamps. Pandas assumes UTC.
        # Only apply if not already timezone aware (offset-naive)
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
        return df[df['close'] > 0]

    @staticmethod
    def remove_nulls(df: pd.DataFrame) -> pd.DataFrame:
        """Remove rows with missing values in critical OHLCV columns."""
        return df.dropna(subset=['open', 'high', 'low', 'close', 'volume'])

    @staticmethod
    def sort_chronological(df: pd.DataFrame) -> pd.DataFrame:
        """Ensure the dataset is strictly ordered by time."""
        return df.sort_index()

    @staticmethod
    def remove_weekends(df: pd.DataFrame) -> pd.DataFrame:
        """Remove Saturday and Sunday rows from the dataset."""
        # IST shift can sometimes create "Sunday" candles for Friday market close
        return df[df.index.dayofweek < 5]

    @staticmethod
    def log_cleaning_report(original_len: int, cleaned_df: pd.DataFrame, symbol: str) -> None:
        """Log a summary of data cleaning actions."""
        removed = original_len - len(cleaned_df)
        if removed > 0:
            logger.info(f"✨ DataCleaner [{symbol}]: Removed {removed} rows | Original: {original_len} → Clean: {len(cleaned_df)}")
        else:
            logger.info(f"✨ DataCleaner [{symbol}]: Data clean, no rows removed")

    @staticmethod
    def clean(df: pd.DataFrame, symbol: str = 'unknown') -> pd.DataFrame:
        """Master sanitation pipeline. Runs all cleaning steps in optimal sequence."""
        if df is None or df.empty:
            return df
            
        original_len = len(df)
        
        # 1. Temporal Normalization
        df = DataCleaner.fix_timezone(df)
        df = DataCleaner.remove_weekends(df)
        df = DataCleaner.sort_chronological(df)
        df = DataCleaner.remove_duplicates(df)
        
        # 2. Price/Volume Sanitation
        df = DataCleaner.remove_zero_prices(df)
        df = DataCleaner.remove_nulls(df)
        
        # 3. Final Report
        DataCleaner.log_cleaning_report(original_len, df, symbol)
        
        return df
