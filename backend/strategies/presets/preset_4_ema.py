"""Preset 4: EMA Crossover — Visual Builder preset."""
from __future__ import annotations

import pandas as pd
from strategies.dynamic import DynamicStrategy
from strategies.presets._registry import register_preset

_ENTRY = {
    "id": "preset4_entry", "type": "GROUP", "logic": "AND",
    "conditions": [{
        "id": "p4e1", "indicator": "EMA", "period": 20,
        "operator": "Crosses Above",
        "compareType": "INDICATOR", "rightIndicator": "EMA", "rightPeriod": 50, "value": 0
    }],
}
_EXIT = {
    "id": "preset4_exit", "type": "GROUP", "logic": "AND",
    "conditions": [{
        "id": "p4x1", "indicator": "EMA", "period": 20,
        "operator": "Crosses Below",
        "compareType": "INDICATOR", "rightIndicator": "EMA", "rightPeriod": 50, "value": 0
    }],
}


@register_preset(
    preset_id="4",
    name="EMA Crossover",
    description="Trend following: Buy when Fast EMA crosses above Slow EMA.",
    params=[
        {"name": "fast", "label": "Fast EMA", "min": 5,  "max": 50,  "default": 20},
        {"name": "slow", "label": "Slow EMA", "min": 51, "max": 200, "default": 50},
    ],
    mode="VISUAL",
    entry_logic=_ENTRY,
    exit_logic=_EXIT,
)
class EMACrossoverStrategy(DynamicStrategy):
    """EMA Crossover — Visual Builder mode preset.

    Entry: Fast EMA crosses above Slow EMA.
    Exit:  Fast EMA crosses below Slow EMA.
    """

    def __init__(self, config: dict) -> None:
        fast = int(config.get("fast", 20))
        slow = int(config.get("slow", 50))

        super().__init__({
            **config,
            "nextBarEntry": True,
            "entryLogic": {
                "type": "GROUP", "logic": "AND",
                "conditions": [{
                    "indicator": "EMA", "period": fast,
                    "operator": "Crosses Above",
                    "compareType": "INDICATOR",
                    "rightIndicator": "EMA", "rightPeriod": slow, "value": 0,
                }],
            },
            "exitLogic": {
                "type": "GROUP", "logic": "AND",
                "conditions": [{
                    "indicator": "EMA", "period": fast,
                    "operator": "Crosses Below",
                    "compareType": "INDICATOR",
                    "rightIndicator": "EMA", "rightPeriod": slow, "value": 0,
                }],
            },
        })
