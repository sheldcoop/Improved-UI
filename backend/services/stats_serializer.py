"""stats_serializer.py — Convert VectorBT stats dicts into JSON-safe values.

Extracted from backtest_engine.py where the same 15-line conversion block
was copy-pasted twice (once for pf.stats(), once for returns.stats()).

Usage:
    from services.stats_serializer import serialize_vbt_stats

    raw = pf.stats().to_dict()
    safe = serialize_vbt_stats(raw)  # ready for jsonify()
"""
from __future__ import annotations

import math
import logging

logger = logging.getLogger(__name__)


def serialize_vbt_stats(raw: dict) -> dict:
    """Convert a VectorBT stats dict to JSON-serialisable values.

    Handles the three exotic types VBT commonly produces:
    - float NaN  → None
    - Timestamp  → ISO-8601 string (via .isoformat())
    - Timedelta  → human-readable string (via str())
    All other values are passed through unchanged.
    Any value that raises during conversion falls back to str().

    Args:
        raw: Dict returned by pf.stats().to_dict() or
             pf.returns().vbt.returns.stats().to_dict().

    Returns:
        Dict with all values safe for json.dumps() / Flask jsonify().

    Example:
        >>> raw = pf.stats().to_dict()
        >>> safe = serialize_vbt_stats(raw)
        >>> return jsonify(safe)
    """
    result: dict = {}
    for k, v in raw.items():
        key = str(k)
        try:
            if isinstance(v, float) and math.isnan(v):
                result[key] = None
            elif hasattr(v, "isoformat"):        # datetime / pd.Timestamp
                result[key] = v.isoformat()
            elif hasattr(v, "total_seconds"):    # pd.Timedelta / datetime.timedelta
                result[key] = str(v)
            else:
                result[key] = v
        except Exception:
            try:
                result[key] = str(v)
            except Exception:
                result[key] = None
    return result
