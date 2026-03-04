"""strategies/presets/__init__.py — Registry boot + StrategyFactory.

Auto-imports all preset modules so their @register_preset decorators run,
then exposes StrategyFactory for resolution by strategy_id.
"""
from __future__ import annotations

import importlib
from logging import getLogger

from strategies.presets._registry import PRESET_REGISTRY, register_preset
from strategies.base import BaseStrategy

logger = getLogger(__name__)

# Import each preset module in ID order — the decorator registers them.
_PRESET_MODULES = [
    "strategies.presets.preset_1_rsi",
    "strategies.presets.preset_2_bbands",
    "strategies.presets.preset_3_macd",
    "strategies.presets.preset_4_ema",
    "strategies.presets.preset_5_supertrend",
    "strategies.presets.preset_6_stochrsi",
    "strategies.presets.preset_7_atr_breakout",
]

for _mod in _PRESET_MODULES:
    importlib.import_module(_mod)


class StrategyFactory:
    """Resolves strategy IDs to configured strategy instances.

    Resolution priority:
        1. If config contains entryLogic or pythonCode → DynamicStrategy
           (user-created Visual Builder / Code editor strategy)
        2. If strategy_id is in PRESET_REGISTRY → registered preset class
        3. Fallback → DynamicStrategy with the provided config

    Adding a new preset requires only a new file in strategies/presets/
    with the @register_preset decorator — no changes here.
    """

    @staticmethod
    def get_strategy(strategy_id: str, config: dict) -> BaseStrategy:
        """Return a configured strategy instance for the given ID.

        Args:
            strategy_id: Preset ID string ('1'–'7') or user strategy UUID.
            config: Strategy config dict (params, logic, risk settings, etc.).

        Returns:
            A BaseStrategy subclass instance ready to call generate_signals().
        """
        from strategies.dynamic import DynamicStrategy

        # User-defined logic always takes precedence over preset dispatch
        if config.get("entryLogic") or config.get("pythonCode"):
            return DynamicStrategy(config)

        preset_cls = PRESET_REGISTRY.get(str(strategy_id))
        if preset_cls:
            return preset_cls(config)

        return DynamicStrategy(config)

    @staticmethod
    def get_preset_metadata() -> list[dict]:
        """Return UI metadata for all registered presets (ordered by ID).

        Returns:
            List of dicts with keys: id, name, description, params, mode,
            and optionally entryLogic, exitLogic, pythonCode.
        """
        result = []
        for cls in PRESET_REGISTRY.values():
            meta: dict = {
                "id": cls.preset_id,
                "name": cls.preset_name,
                "description": cls.preset_description,
                "params": cls.preset_params,
                "mode": cls.preset_mode,
            }
            if cls.preset_entry_logic:
                meta["entryLogic"] = cls.preset_entry_logic
            if cls.preset_exit_logic:
                meta["exitLogic"] = cls.preset_exit_logic
            if cls.preset_python_code:
                meta["pythonCode"] = cls.preset_python_code
            result.append(meta)
        return result
