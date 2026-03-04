"""
strategies.py — SUPERSEDED BY strategies/ PACKAGE
====================================================

This file is kept as a tombstone. Python's import system prefers the
``strategies/`` package directory over this module file when both exist
in the same directory, so this file is effectively dead code.

All public symbols remain importable via:
    from strategies import StrategyFactory, DynamicStrategy, BaseStrategy

To add a new preset strategy, create:
    backend/strategies/presets/preset_N_myname.py

and apply the @register_preset decorator. No other files need to change.
"""
