"""DhanHQ Scrip Master service for instrument search.

Downloads and caches the official Dhan Scrip Master CSV for symbol→security_id mapping.
Supports NSE_EQ (Mainboard) and NSE_SME segmentation.
"""

import json
import logging
import time
from io import StringIO
from pathlib import Path
from typing import Optional

import pandas as pd
import requests

logger = logging.getLogger(__name__)

CSV_URL = "https://images.dhan.co/api-data/api-scrip-master-detailed.csv"
CACHE_FILE = Path("./cache_dir/scrip_master.csv")
CACHE_TTL_HOURS = 24

# Column mapping (CSV has both short and long names, we normalize)
COLUMN_MAP = {
    # Short names
    "EXCH_ID": "exch_id",
    "SEGMENT": "segment",
    "SERIES": "series",
    "SYMBOL_NAME": "symbol",
    "DISPLAY_NAME": "display_name",
    "SECURITY_ID": "security_id",
    "INSTRUMENT": "instrument",
    # Long names (SEM_* prefix)
    "SEM_EXM_EXCH_ID": "exch_id",
    "SEM_SEGMENT": "segment",
    "SEM_SERIES": "series",
    "SEM_SYMBOL_NAME": "symbol",
    "SEM_CUSTOM_SYMBOL": "display_name",
    "SEM_SMST_SECURITY_ID": "security_id",
    "SEM_INSTRUMENT_NAME": "instrument",
}


def _load_scrip_master() -> pd.DataFrame:
    """Load CSV from cache or download fresh."""
    # Check if cache exists and is fresh
    if CACHE_FILE.exists():
        age_hours = (time.time() - CACHE_FILE.stat().st_mtime) / 3600
        if age_hours < CACHE_TTL_HOURS:
            logger.info("Loading Scrip Master from cache")
            df = pd.read_csv(CACHE_FILE)
            # Rename columns to normalized names
            df = df.rename(columns={k: v for k, v in COLUMN_MAP.items() if k in df.columns})
            return df
    
    # Download fresh
    logger.info("Downloading fresh Scrip Master from Dhan")
    try:
        resp = requests.get(CSV_URL, timeout=60)
        resp.raise_for_status()
        
        # Save to cache
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(resp.text)
        
        df = pd.read_csv(StringIO(resp.text))
        # Rename columns to normalized names
        df = df.rename(columns={k: v for k, v in COLUMN_MAP.items() if k in df.columns})
        
        logger.info(f"Loaded {len(df)} instruments from Scrip Master")
        return df
    except Exception as e:
        logger.error(f"Failed to download Scrip Master: {e}")
        # Try to use stale cache if available
        if CACHE_FILE.exists():
            logger.warning("Using stale cache")
            df = pd.read_csv(CACHE_FILE)
            df = df.rename(columns={k: v for k, v in COLUMN_MAP.items() if k in df.columns})
            return df
        raise


def search_instruments(segment: str, query: str, limit: int = 20) -> list[dict]:
    """Search instruments by segment and query string.
    
    Args:
        segment: "NSE_EQ" or "NSE_SME"
        query: Search string (matched against symbol and display_name)
        limit: Maximum results to return
    
    Returns:
        List of instrument dicts with symbol, display_name, security_id, instrument_type
    """
    df = _load_scrip_master()
    
    # Filter by segment
    if segment == "NSE_EQ":
        # NSE Mainboard: exch_id='NSE', segment='E', series='EQ'
        mask = (
            (df["exch_id"] == "NSE") & 
            (df["segment"] == "E") & 
            (df["series"] == "EQ")
        )
    elif segment == "NSE_SME":
        # NSE SME: exch_id='NSE', segment='E', series in ['SM', 'ST']
        mask = (
            (df["exch_id"] == "NSE") & 
            (df["segment"] == "E") & 
            (df["series"].isin(["SM", "ST"]))
        )
    else:
        return []
    
    df_filtered = df[mask].copy()
    
    # Search on symbol and display_name (case-insensitive)
    query_upper = query.upper().strip()
    if query_upper:
        search_mask = (
            df_filtered["symbol"].str.upper().str.contains(query_upper, na=False) |
            df_filtered["display_name"].str.upper().str.contains(query_upper, na=False)
        )
        df_results = df_filtered[search_mask]
    else:
        df_results = df_filtered
    
    # Limit results
    df_results = df_results.head(limit)
    
    # Format response
    results = []
    for _, row in df_results.iterrows():
        results.append({
            "symbol": str(row["symbol"]),
            "display_name": str(row["display_name"]) if pd.notna(row["display_name"]) else str(row["symbol"]),
            "security_id": str(int(row["security_id"])) if pd.notna(row["security_id"]) else "",
            "instrument_type": str(row["instrument"]) if pd.notna(row["instrument"]) else "EQUITY"
        })
    
    return results


def get_instrument_by_symbol(symbol: str, segment: str = "NSE_EQ") -> Optional[dict]:
    """Get instrument details by exact symbol match.
    
    Args:
        symbol: Exact symbol name (e.g., "RELIANCE")
        segment: "NSE_EQ" or "NSE_SME"
    
    Returns:
        Instrument dict or None if not found
    """
    df = _load_scrip_master()
    symbol_upper = symbol.upper().strip()
    
    # Filter by segment first
    if segment == "NSE_EQ":
        mask = (
            (df["exch_id"] == "NSE") & 
            (df["segment"] == "E") & 
            (df["series"] == "EQ")
        )
    elif segment == "NSE_SME":
        mask = (
            (df["exch_id"] == "NSE") & 
            (df["segment"] == "E") & 
            (df["series"].isin(["SM", "ST"]))
        )
    else:
        return None
    
    df_filtered = df[mask]
    
    # Find exact match
    match = df_filtered[df_filtered["symbol"].str.upper() == symbol_upper]
    
    if len(match) == 0:
        return None
    
    row = match.iloc[0]
    return {
        "symbol": str(row["symbol"]),
        "display_name": str(row["display_name"]) if pd.notna(row["display_name"]) else str(row["symbol"]),
        "security_id": str(int(row["security_id"])) if pd.notna(row["security_id"]) else "",
        "instrument_type": str(row["instrument"]) if pd.notna(row["instrument"]) else "EQUITY",
        "exchange_segment": "NSE_EQ",  # Always NSE_EQ for Dhan API
        "series": str(row["series"]) if pd.notna(row["series"]) else "EQ"
    }
