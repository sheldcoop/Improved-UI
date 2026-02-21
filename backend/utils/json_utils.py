import math
from typing import Any

# pandas is a soft dependency; most callers already import it earlier so
# the module will typically be available.  We import lazily to avoid a hard
# dependency in environments where pandas may not be installed (e.g. some
# lightweight tests).

def clean_float_values(data: Any) -> Any:
    """Recursively sanitise data for JSON encoding.

    This helper performs several jobs:

    * Replace ``float('nan')`` or infinite values with ``0.0``
    * Convert ``pandas.NaT`` and other NA-types to ``None``
    * Stringify ``pandas.Timestamp`` / ``Timedelta`` objects
    * Recurse into dicts and lists

    Args:
        data: Any Python object (dict, list, float, etc.)

    Returns:
        The same object with problematic values normalised.
    """
    # dict/list recursion first so we handle nested structures
    if isinstance(data, dict):
        return {k: clean_float_values(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [clean_float_values(v) for v in data]

    # pandas NA handling
    try:
        import pandas as pd
        if pd.isna(data):
            # covers NaN, NaT, None
            return None
        if isinstance(data, (pd.Timestamp, pd.Timedelta)):
            return str(data)
    except ImportError:
        pass

    # floats with inf/nan
    if isinstance(data, float):
        if math.isinf(data) or math.isnan(data):
            return 0.0

    return data
