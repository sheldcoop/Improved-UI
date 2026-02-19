"""Strategy persistence service — replaces raw file I/O in route files.

Provides thread-safe read/write operations on data/strategies.json
using a file lock to prevent concurrent write corruption (Issue #11).
Moves get_strategy_by_id() out of blueprints (Issue #12).
"""
from __future__ import annotations


import json
import logging
import os
import uuid
from typing import Any

from filelock import FileLock, Timeout

logger = logging.getLogger(__name__)

DATA_FILE = "data/strategies.json"
LOCK_FILE = DATA_FILE + ".lock"
LOCK_TIMEOUT_SECONDS = 5


class StrategyStore:
    """Thread-safe JSON-backed strategy persistence store.

    All public methods are class-level (no instance state needed).
    Uses filelock to prevent concurrent write corruption.
    """

    @staticmethod
    def load_all() -> list[dict]:
        """Load all saved strategies from disk.

        Returns:
            List of strategy dicts. Returns empty list if file does not
            exist or is corrupt.
        """
        if not os.path.exists(DATA_FILE):
            return []
        try:
            with open(DATA_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.error(f"Failed to load strategies from {DATA_FILE}: {exc}")
            return []

    @staticmethod
    def get_by_id(strategy_id: str) -> dict | None:
        """Look up a single strategy by its ID.

        Args:
            strategy_id: UUID string of the strategy to retrieve.

        Returns:
            Strategy dict if found, None otherwise.
        """
        strategies = StrategyStore.load_all()
        return next((s for s in strategies if s.get("id") == strategy_id), None)

    @staticmethod
    def save(strategy_data: dict) -> dict:
        """Create or update a strategy atomically with file locking.

        If strategy_data contains an 'id' that matches an existing strategy,
        that strategy is updated in place. Otherwise a new strategy is created
        with a generated UUID.

        Args:
            strategy_data: Strategy dict. May include 'id' for updates.

        Returns:
            The saved strategy dict (with 'id' populated).

        Raises:
            Timeout: If the file lock cannot be acquired within
                LOCK_TIMEOUT_SECONDS seconds.
            OSError: If the file cannot be written.
        """
        lock = FileLock(LOCK_FILE, timeout=LOCK_TIMEOUT_SECONDS)
        try:
            with lock:
                strategies = StrategyStore.load_all()
                strategy_id = strategy_data.get("id")

                if strategy_id and strategy_id != "new":
                    idx = next(
                        (i for i, s in enumerate(strategies) if s.get("id") == strategy_id),
                        None,
                    )
                    if idx is not None:
                        strategies[idx] = strategy_data
                        StrategyStore._write(strategies)
                        logger.info(f"Updated strategy: {strategy_data.get('name')}")
                        return strategy_data

                # New strategy
                new_strategy = strategy_data.copy()
                new_strategy["id"] = str(uuid.uuid4())
                strategies.append(new_strategy)
                StrategyStore._write(strategies)
                logger.info(f"Created strategy: {new_strategy.get('name')}")
                return new_strategy

        except Timeout:
            logger.error(f"Could not acquire file lock for {DATA_FILE} within {LOCK_TIMEOUT_SECONDS}s")
            raise

    @staticmethod
    def _write(strategies: list[dict]) -> None:
        """Write strategies list to disk (must be called within lock).

        Args:
            strategies: Full list of strategy dicts to persist.

        Raises:
            OSError: If the file cannot be written.
        """
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, "w") as f:
            json.dump(strategies, f, indent=2)
