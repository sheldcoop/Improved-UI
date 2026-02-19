import math
from typing import Any

def clean_float_values(data: Any) -> Any:
    """Recursively replace NaN/Inf float values with 0.0 for JSON compliance.
    
    Args:
        data: Any Python object (dict, list, float, etc.)
        
    Returns:
        The same object with NaN/Inf values replaced by 0.0.
    """
    if isinstance(data, dict):
        return {k: clean_float_values(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [clean_float_values(v) for v in data]
    elif isinstance(data, float):
        if math.isinf(data) or math.isnan(data):
            return 0.0
    return data
