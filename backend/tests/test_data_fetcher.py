"""Tests for DataFetcher service.

Covers:
  - Parquet cache write/read round-trip (Issue #9)
  - Cache TTL expiry (24h)
  - Synthetic data fallback when API key is absent
  - fetch_historical_data returns a valid OHLCV DataFrame
  - Cache key sanitisation (spaces → underscores)
"""
from __future__ import annotations

import os
import time
import pandas as pd
import numpy as np
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ohlcv(n: int = 50) -> pd.DataFrame:
    idx = pd.bdate_range("2023-01-02", periods=n, freq="B")
    rng = np.random.default_rng(0)
    close = 100 + np.cumsum(rng.normal(0, 1, n))
    return pd.DataFrame(
        {
            "Open": close * 0.99,
            "High": close * 1.01,
            "Low": close * 0.98,
            "Close": close,
            "Volume": rng.integers(100_000, 1_000_000, n).astype(float),
        },
        index=idx,
    )


# ---------------------------------------------------------------------------
# Parquet cache round-trip (Issue #9)
# ---------------------------------------------------------------------------

class TestParquetCache:
    def test_save_and_load_parquet(self, tmp_path: Path):
        """DataFetcher must save and reload a DataFrame via Parquet correctly."""
        from services.data_fetcher import DataFetcher

        fetcher = DataFetcher({})
        fetcher.cache_dir = str(tmp_path)

        df_original = _make_ohlcv(30)
        cache_key = "NIFTY_50_1d"
        fetcher._save_parquet(cache_key, df_original)

        parquet_file = tmp_path / f"{cache_key}.parquet"
        assert parquet_file.exists(), "Parquet file should be created"

        df_loaded = fetcher._load_parquet(cache_key)
        assert df_loaded is not None, "Loaded DataFrame should not be None"
        assert len(df_loaded) == len(df_original), "Row count must match"
        pd.testing.assert_index_equal(df_loaded.index, df_original.index)

    def test_cache_key_sanitises_spaces(self, tmp_path: Path):
        """Symbols with spaces (e.g. 'NIFTY 50') must produce valid filenames."""
        from services.data_fetcher import DataFetcher

        fetcher = DataFetcher({})
        fetcher.cache_dir = str(tmp_path)

        df = _make_ohlcv(10)
        # Simulate what fetch_historical_data does internally
        safe_symbol = "NIFTY 50".replace(" ", "_")
        cache_key = f"{safe_symbol}_1d"
        fetcher._save_parquet(cache_key, df)

        # Filename must not contain spaces
        files = list(tmp_path.iterdir())
        assert len(files) == 1
        assert " " not in files[0].name

    def test_load_returns_none_for_missing_file(self, tmp_path: Path):
        """_load_parquet must return None when the file does not exist."""
        from services.data_fetcher import DataFetcher

        fetcher = DataFetcher({})
        fetcher.cache_dir = str(tmp_path)
        result = fetcher._load_parquet("nonexistent_key")
        assert result is None

    def test_cache_ttl_expired_returns_none(self, tmp_path: Path):
        """_load_parquet must return None when the file is older than TTL."""
        from services.data_fetcher import DataFetcher

        fetcher = DataFetcher({})
        fetcher.cache_dir = str(tmp_path)
        fetcher.cache_ttl_hours = 0  # Expire immediately

        df = _make_ohlcv(10)
        cache_key = "RELIANCE_1d"
        fetcher._save_parquet(cache_key, df)

        # TTL = 0 hours means any existing file is expired
        result = fetcher._load_parquet(cache_key)
        assert result is None, "Expired cache should return None"


# ---------------------------------------------------------------------------
# Synthetic fallback
# ---------------------------------------------------------------------------

class TestNoFallback:
    def test_no_synthetic_fallback(self):
        """DataFetcher must NOT return synthetic data when API fails (Rule: Financial Integrity)."""
        from services.data_fetcher import DataFetcher

        fetcher = DataFetcher({})
        # Mocking Dhan API to fail — only source is Dhan
        with patch.object(fetcher, "_fetch_from_api", return_value=None):
            df = fetcher.fetch_historical_data("FAKE_SYMBOL", "1d")

        assert df is None, "Should return None instead of synthetic data for financial integrity"

# ---------------------------------------------------------------------------
# fetch_historical_data — cache hit path
# ---------------------------------------------------------------------------

class TestCacheHitPath:
    def test_returns_cached_data_without_api_call(self, tmp_path: Path):
        """fetch_historical_data must return cached data without calling the API."""
        from services.data_fetcher import DataFetcher

        fetcher = DataFetcher({})
        fetcher.cache_dir = str(tmp_path)
        fetcher.cache_ttl_hours = 24

        df_cached = _make_ohlcv(20)
        cache_key = "NIFTY_50_1d"
        fetcher._save_parquet(cache_key, df_cached)

        with patch.object(fetcher, "_fetch_from_api") as mock_api:
            result = fetcher.fetch_historical_data("NIFTY 50", "1d")
            mock_api.assert_not_called()  # cache hit — Dhan API should not be called

        assert result is not None
        assert len(result) == len(df_cached)
