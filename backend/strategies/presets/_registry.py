"""strategies/presets/_registry.py — Preset registration infrastructure.

This module is intentionally kept dependency-free (no imports from other
preset modules) to prevent circular imports when preset files import
register_preset from here.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from strategies.base import BaseStrategy

# Ordered dict of preset_id → preset class
PRESET_REGISTRY: dict[str, type] = {}


def register_preset(
    preset_id: str,
    name: str,
    description: str,
    params: list[dict],
    mode: str = "CODE",
    entry_logic: dict | None = None,
    exit_logic: dict | None = None,
    python_code: str | None = None,
):
    """Class decorator that registers a preset strategy.

    Args:
        preset_id: Unique string identifier (e.g. '1', '5').
        name: Human-readable preset name shown in the UI.
        description: Short description of the strategy's logic.
        params: List of param dicts with keys: name, label, min, max, default.
        mode: 'CODE' or 'VISUAL'. Determines which tab loads in the UI.
        entry_logic: Visual builder entryLogic tree (VISUAL presets only).
        exit_logic: Visual builder exitLogic tree (VISUAL presets only).
        python_code: Python code shown in the Code editor (CODE presets only).

    Returns:
        Class decorator that stores metadata and registers the class.

    Example:
        >>> @register_preset(preset_id="8", name="My Strategy", ...)
        ... class MyStrategy(DynamicStrategy): ...
    """
    def decorator(cls: type) -> type:
        cls.preset_id = preset_id
        cls.preset_name = name
        cls.preset_description = description
        cls.preset_params = params
        cls.preset_mode = mode
        cls.preset_entry_logic = entry_logic
        cls.preset_exit_logic = exit_logic
        cls.preset_python_code = python_code
        PRESET_REGISTRY[preset_id] = cls
        return cls
    return decorator
