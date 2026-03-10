"""strategies/sandbox.py — Sandboxed Python code execution."""
from __future__ import annotations

import ast
import signal
import warnings as _warnings
from contextlib import contextmanager
from logging import getLogger

import numpy as np
import pandas as pd
import vectorbt as vbt
import ta

_EXECUTION_TIMEOUT_SECS = 30  # Max seconds allowed for user code to run


@contextmanager
def _timeout(seconds: int):
    """Context manager that raises TimeoutError after ``seconds`` seconds.

    Uses SIGALRM (Unix only). On non-Unix platforms, falls back to no-op
    so code still runs but without the timeout guard.
    """
    def _handler(signum, frame):
        raise TimeoutError(f"Code execution exceeded {seconds}s time limit")

    if hasattr(signal, "SIGALRM"):
        old = signal.signal(signal.SIGALRM, _handler)
        signal.alarm(seconds)
        try:
            yield
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old)
    else:
        yield  # Windows — no timeout, best effort

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
    ) -> tuple[pd.Series | None, pd.Series | None, list[str], dict[str, pd.Series]]:
        """Execute user code and return (entries, exits, warnings, indicators).

        Args:
            code: Python source defining ``signal_logic(df)``.
            df: OHLCV DataFrame passed as ``df`` into function scope.
            config: Strategy config exposed as ``config`` inside the function.

        Returns:
            Tuple of (entries, exits, warnings, indicators). Returns (None, None, [], {}) on
            any error — errors are logged but never re-raised.
        """
        if not code:
            return None, None, [], {}

        # AST scan
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            logger.error(f"Code Syntax Error: {exc}")
            return None, None, [], {}

        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr in _BLOCKED_ATTRS:
                logger.error(f"Sandbox violation: blocked attribute '{node.attr}'")
                return None, None, [], {}
            if isinstance(node, ast.Name) and node.id in _BLOCKED_ATTRS:
                logger.error(f"Sandbox violation: blocked name '{node.id}'")
                return None, None, [], {}

        safe_globals: dict = {
            "__builtins__": _SAFE_BUILTINS,
            "df": df, "vbt": vbt, "pd": pd, "np": np, "ta": ta,
            "config": config,
        }

        try:
            with _timeout(_EXECUTION_TIMEOUT_SECS):
                with _warnings.catch_warnings(record=True) as w:
                    _warnings.simplefilter("always")
                    exec(code, safe_globals)  # noqa: S102

                    if "signal_logic" not in safe_globals:
                        logger.error("Code must define a 'signal_logic(df)' function.")
                        return None, None, [], {}

                    result = safe_globals["signal_logic"](df)
                    captured = [str(x.message) for x in w]

                    indicators = {}
                    if isinstance(result, tuple):
                        if len(result) >= 4:
                            entries, exits, _, indicators = result[:4]
                        elif len(result) == 3:
                            entries, exits, _ = result
                        elif len(result) == 2:
                            entries, exits = result
                        else:
                            entries, exits = None, None
                    else:
                        return None, None, captured, {}

                return entries, exits, captured, indicators

        except TimeoutError as exc:
            logger.error(f"Code Execution Timeout: {exc}")
            return None, None, [str(exc)], {}
        except Exception as exc:
            logger.error(f"Code Execution Error: {exc}", exc_info=True)
            return None, None, [], {}
