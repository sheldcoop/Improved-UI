"""Cache service — handles Parquet-based storage for market data.

Implements Rule 9 (Parquet format) and provides high-level methods for
storing, retrieving, and merging OHLCV DataFrames.
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Union

import pandas as pd

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = BASE_DIR / "cache_dir"
CACHE_TTL_HOURS = 24


class CacheService:
    """Manages Parquet file caching for market data."""

    def __init__(self) -> None:
        """Initialize CacheService and ensure cache directory exists."""
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def get(self, key: str) -> Optional[pd.DataFrame]:
        """Retrieve cached DataFrame if it exists and is within TTL.

        Args:
            key: Cache key (e.g., 'RELIANCE_1d').

        Returns:
            Cached DataFrame or None if miss, stale, or corrupt.
        """
        path = self._cache_path(key)
        if not path.exists():
            return None

        # Rule 9: TTL Check
        age_hours = (datetime.now().timestamp() - path.stat().st_mtime) / 3600
        if age_hours > CACHE_TTL_HOURS:
            logger.debug(f"Cache expired for {key} ({age_hours:.1f}h old)")
            return None

        try:
            return pd.read_parquet(path)
        except Exception as e:
            logger.warning(f"Corrupt cache file {path.name}: {e}")
            return None

    def save(self, key: str, df: pd.DataFrame) -> bool:
        """Persist a DataFrame to Parquet with Snappy compression.

        Args:
            key: Cache key.
            df: DataFrame to save.

        Returns:
            True if successful, False otherwise.
        """
        if df is None or df.empty:
            return False
            
        path = self._cache_path(key)
        try:
            df.to_parquet(path, compression="snappy")
            logger.debug(f"💾 Cached {key} -> {path.name}")
            return True
        except Exception as e:
            logger.error(f"Failed to write cache for {key}: {e}")
            return False

    def merge_and_save(self, key: str, old_df: Optional[pd.DataFrame], new_df: pd.DataFrame) -> pd.DataFrame:
        """Combine old and new data, deduplicate, and persist.

        Args:
            key: Cache key.
            old_df: Existing data from cache.
            new_df: Freshly fetched data.

        Returns:
            The combined and deduplicated DataFrame.
        """
        if old_df is None or old_df.empty:
            combined = new_df
        else:
            combined = pd.concat([old_df, new_df])
            # Keep last to prioritize fresh data on overlaps
            combined = combined[~combined.index.duplicated(keep='last')]
            combined = combined.sort_index()

        self.save(key, combined)
        return combined

    def get_status(self) -> list[dict[str, Union[str, bool]]]:
        """Scan cache directory and return metadata for all cached datasets."""
        results = []
        if not CACHE_DIR.exists():
            return results

        for p in CACHE_DIR.glob("*.parquet"):
            try:
                stem = p.stem
                parts = stem.split("_")
                symbol = parts[0]
                timeframe = parts[1] if len(parts) > 1 else "unknown"

                df_meta = pd.read_parquet(p, columns=[])
                start_date = str(df_meta.index.min().date()) if not df_meta.empty else "-"
                end_date = str(df_meta.index.max().date()) if not df_meta.empty else "-"
                size_mb = p.stat().st_size / (1024 * 1024)
                
                results.append({
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "startDate": start_date,
                    "lastUpdated": end_date,
                    "size": f"{size_mb:.1f} MB",
                    "health": "GOOD",
                    "dataAvailable": True
                })
            except Exception as e:
                logger.error(f"Failed to read metadata for {p.name}: {e}")
                continue
        return results

    def _cache_path(self, key: str) -> Path:
        """Return file path for a given cache key."""
        safe_key = key.replace(" ", "_").replace("/", "_")
        return CACHE_DIR / f"{safe_key}.parquet"
