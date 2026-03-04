"""strategies package — public API.

All external callers should import from here, not from submodules.
This ensures backward compatibility: ``from strategies import StrategyFactory``
continues to work as before.
"""
from __future__ import annotations

from strategies.base import BaseStrategy
from strategies.dynamic import DynamicStrategy
from strategies.presets import StrategyFactory, PRESET_REGISTRY, register_preset

__all__ = [
    "BaseStrategy",
    "DynamicStrategy",
    "StrategyFactory",
    "PRESET_REGISTRY",
    "register_preset",
]
