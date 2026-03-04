"""Preset 1: RSI Mean Reversion — Visual Builder preset."""
from __future__ import annotations

import pandas as pd
from strategies.dynamic import DynamicStrategy
from strategies.presets._registry import register_preset

_ENTRY = {
    "id": "preset1_entry", "type": "GROUP", "logic": "AND",
    "conditions": [{
        "id": "p1e1", "indicator": "RSI", "period": 14,
        "operator": "Crosses Below", "compareType": "STATIC", "value": 30
    }],
}
_EXIT = {
    "id": "preset1_exit", "type": "GROUP", "logic": "AND",
    "conditions": [{
        "id": "p1x1", "indicator": "RSI", "period": 14,
        "operator": "Crosses Above", "compareType": "STATIC", "value": 70
    }],
}


@register_preset(
    preset_id="1",
    name="RSI Mean Reversion",
    description="Buy when RSI crosses below oversold level; sell when it crosses above overbought.",
    params=[
        {"name": "period", "label": "RSI Period", "min": 5, "max": 30, "default": 14},
        {"name": "lower",  "label": "Oversold Level", "min": 10, "max": 40, "default": 30},
        {"name": "upper",  "label": "Overbought Level", "min": 60, "max": 90, "default": 70},
    ],
    mode="VISUAL",
    entry_logic=_ENTRY,
    exit_logic=_EXIT,
)
class RSIMeanReversionStrategy(DynamicStrategy):
    """RSI Mean Reversion — Visual Builder mode preset.

    Builds the entryLogic / exitLogic rule trees from config params at
    initialisation, then delegates signal evaluation to the parent's
    Visual Builder path (_evaluate_node).
    """

    def __init__(self, config: dict) -> None:
        period = int(config.get("period", 14))
        lower  = float(config.get("lower", 30))
        upper  = float(config.get("upper", 70))

        super().__init__({
            **config,
            "nextBarEntry": True,
            "entryLogic": {
                "type": "GROUP", "logic": "AND",
                "conditions": [{
                    "indicator": "RSI", "period": period,
                    "operator": "Crosses Below",
                    "compareType": "STATIC", "value": lower,
                }],
            },
            "exitLogic": {
                "type": "GROUP", "logic": "AND",
                "conditions": [{
                    "indicator": "RSI", "period": period,
                    "operator": "Crosses Above",
                    "compareType": "STATIC", "value": upper,
                }],
            },
        })
