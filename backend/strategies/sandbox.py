"""strategies/sandbox.py — Sandboxed Python code execution."""
from __future__ import annotations

import ast
import warnings as _warnings
from logging import getLogger

import numpy as np
import pandas as pd
import vectorbt as vbt
import ta

logger = getLogger(__name__)

# Blocked attribute / name access — prevents object introspection escape vectors.
# e.g. ().__class__.__bases__[0].__subclasses__() attack vector.
_BLOCKED_ATTRS: frozenset[str] = frozenset([
    "__class__", "__bases__", "__subclasses__", "__mro__", "__globals__",
    "__builtins__", "__import__", "__loader__", "__spec__", "__code__",
    "eval", "exec", "compile", "open", "breakpoint", "__reduce__",
    "__reduce_ex__", "system", "popen",
])

_SAFE_BUILTINS: dict = {
    "abs": abs, "max": max, "min": min, "len": len,
    "range": range, "round": round, "int": int,
    "float": float, "bool": bool, "str": str,
    "list": list, "dict": dict, "set": set,
}


class PythonSandbox:
    """Executes user-defined ``signal_logic(df)`` in a restricted Python sandbox.

    Security model:
        - AST-scans source for blocked attribute / name access before exec().
        - Uses a restricted ``__builtins__`` (no I/O, no eval/exec/open).
        - Provides vbt, pd, np, ta and config as the only globals.
    """

    def execute(
        self,
        code: str,
        df: pd.DataFrame | dict,
        config: dict,
    ) -> tuple[pd.Series | None, pd.Series | None, list[str]]:
        """Execute user code and return (entries, exits, warnings).

        Args:
            code: Python source defining ``signal_logic(df)``.
            df: OHLCV DataFrame passed as ``df`` into function scope.
            config: Strategy config exposed as ``config`` inside the function.

        Returns:
            Tuple of (entries, exits, warnings). Returns (None, None, []) on
            any error — errors are logged but never re-raised.
        """
        if not code:
            return None, None, []

        # AST scan
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            logger.error(f"Code Syntax Error: {exc}")
            return None, None, []

        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr in _BLOCKED_ATTRS:
                logger.error(f"Sandbox violation: blocked attribute '{node.attr}'")
                return None, None, []
            if isinstance(node, ast.Name) and node.id in _BLOCKED_ATTRS:
                logger.error(f"Sandbox violation: blocked name '{node.id}'")
                return None, None, []

        safe_globals: dict = {
            "__builtins__": _SAFE_BUILTINS,
            "df": df, "vbt": vbt, "pd": pd, "np": np, "ta": ta,
            "config": config,
        }

        try:
            with _warnings.catch_warnings(record=True) as w:
                _warnings.simplefilter("always")
                exec(code, safe_globals)  # noqa: S102

                if "signal_logic" not in safe_globals:
                    logger.error("Code must define a 'signal_logic(df)' function.")
                    return None, None, []

                entries, exits = safe_globals["signal_logic"](df)
                captured = [str(x.message) for x in w]

            return entries, exits, captured

        except Exception as exc:
            logger.error(f"Code Execution Error: {exc}", exc_info=True)
            return None, None, []
