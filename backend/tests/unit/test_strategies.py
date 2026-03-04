"""tests/unit/test_strategies.py — Strategy builder logic unit tests.

Absorbed from: test_strategy_sanity.py (sections 1-5: operator logic,
group logic, VISUAL signals, nextBarEntry, StrategyStore CRUD).

The preview-endpoint section (section 6) lives in integration/test_strategy_api.py
because it requires a Flask test client and HTTP calls.

Design:
  - No Flask, no DB, no I/O — pure logic tests.
  - Runs in <2 seconds total.
"""
from __future__ import annotations

import os
import sys
import uuid
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

_TESTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _TESTS not in sys.path:
    sys.path.insert(0, _TESTS)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from strategies import DynamicStrategy
import services.strategy_store as _ss_mod


# ---------------------------------------------------------------------------
# Helpers — minimal OHLCV factories
# ---------------------------------------------------------------------------

def _ohlcv(close_array, freq: str = "D") -> pd.DataFrame:
    close = np.asarray(close_array, dtype=float)
    dates = pd.date_range("2023-01-01", periods=len(close), freq=freq)
    return pd.DataFrame(
        {"open": close*0.999, "high": close*1.005,
         "low": close*0.995, "close": close,
         "volume": np.full(len(close), 1_000_000.0)},
        index=dates,
    )


def _make_rsi_crossover_up() -> pd.DataFrame:
    p, prices = 100.0, []
    for _ in range(50): prices.append(p)
    for _ in range(30): p *= 0.98; prices.append(p)
    for _ in range(30): p *= 1.03; prices.append(p)
    return _ohlcv(prices)


def _make_rsi_crossover_down() -> pd.DataFrame:
    p, prices = 100.0, []
    for _ in range(50): prices.append(p)
    for _ in range(30): p *= 1.03; prices.append(p)
    for _ in range(30): p *= 0.98; prices.append(p)
    return _ohlcv(prices)


def _make_oscillating(cycles: int = 4, down: int = 30, up: int = 30) -> pd.DataFrame:
    p, prices = 100.0, []
    for _ in range(cycles):
        for _ in range(down): p *= 0.97; prices.append(p)
        for _ in range(up):   p *= 1.04; prices.append(p)
    return _ohlcv(prices)


def _make_step(n: int = 100, lo: float = 80.0, hi: float = 120.0) -> pd.DataFrame:
    close = np.where(np.arange(n) < n // 2, lo, hi).astype(float)
    return _ohlcv(close)


def _make_four_block(n_block: int = 25) -> pd.DataFrame:
    close = np.array([70]*n_block + [90]*n_block + [110]*n_block + [90]*n_block, dtype=float)
    return _ohlcv(close)


# Rule/group dict builders
def _rule(indicator, period, operator, value, compare_type="STATIC",
          right_indicator=None, right_period=None) -> dict:
    r: dict = {"type": "RULE", "indicator": indicator, "period": period,
               "operator": operator, "compareType": compare_type, "value": value}
    if right_indicator:
        r["rightIndicator"] = right_indicator
        r["rightPeriod"]    = right_period
    return r


def _group(logic: str, *conditions) -> dict:
    return {"type": "GROUP", "logic": logic, "conditions": list(conditions)}


def _visual_config(entry_group, exit_group, **extra) -> dict:
    return {"mode": "VISUAL", "entryLogic": entry_group, "exitLogic": exit_group, **extra}


# ===========================================================================
# 1. Operator correctness
# ===========================================================================

class TestOperatorLogic:

    def test_crosses_above_fires_exactly_once(self):
        df   = _make_rsi_crossover_up()
        rule = _rule("RSI", 14, "Crosses Above", 30.0)
        result = DynamicStrategy({})._evaluate_condition(df, rule).astype(bool)
        n_true = result.sum()
        assert 1 <= n_true <= 2, f"Expected 1 crossover above 30, got {n_true}"

    def test_crosses_below_fires_exactly_once(self):
        df   = _make_rsi_crossover_down()
        rule = _rule("RSI", 14, "Crosses Below", 70.0)
        result = DynamicStrategy({})._evaluate_condition(df, rule).astype(bool)
        n_true = result.sum()
        assert 1 <= n_true <= 2, f"Expected 1 crossover below 70, got {n_true}"

    def test_greater_than_is_persistent(self):
        df   = _make_step(n=100, lo=80.0, hi=120.0)
        rule = _rule("Close Price", 1, ">", 100.0)
        result = DynamicStrategy({})._evaluate_condition(df, rule).astype(bool)
        assert not result.iloc[:50].any()
        assert result.iloc[50:].all()
        assert result.sum() == 50

    def test_less_than_is_persistent(self):
        df   = _make_step(n=100, lo=80.0, hi=120.0)
        rule = _rule("Close Price", 1, "<", 100.0)
        result = DynamicStrategy({})._evaluate_condition(df, rule).astype(bool)
        assert result.iloc[0]
        assert not result.iloc[-1]
        assert result.sum() == 50

    def test_indicator_vs_indicator(self):
        df   = _make_oscillating(cycles=3)
        rule = _rule("EMA", 10, ">", None, compare_type="INDICATOR",
                     right_indicator="SMA", right_period=20)
        result = DynamicStrategy({})._evaluate_condition(df, rule).astype(bool)
        assert result.sum() > 0
        assert (~result).sum() > 0

    def test_flat_data_no_crossover(self):
        df   = _ohlcv(np.full(100, 100.0))
        rule = _rule("RSI", 14, "Crosses Above", 70.0)
        result = DynamicStrategy({})._evaluate_condition(df, rule).astype(bool)
        assert result.sum() == 0

    def test_invalid_operator_returns_false_not_crash(self):
        df   = _make_step()
        rule = _rule("Close Price", 1, "INVALID_OP", 100.0)
        result = DynamicStrategy({})._evaluate_condition(df, rule)
        if isinstance(result, pd.Series):
            assert result.astype(bool).sum() == 0
        else:
            assert not result


# ===========================================================================
# 2. Group logic (AND / OR / nested)
# ===========================================================================

class TestGroupLogic:

    @pytest.fixture
    def four_df(self) -> pd.DataFrame:
        return _make_four_block(n_block=25)

    def test_and_requires_all_true(self, four_df):
        group  = _group("AND", _rule("Close Price", 1, ">", 80.0),
                                _rule("Close Price", 1, ">", 100.0))
        result = DynamicStrategy({})._evaluate_node(four_df, group).astype(bool)
        assert not result.iloc[0]    # close=70 → F
        assert not result.iloc[25]   # close=90 → only >80
        assert result.iloc[50]       # close=110 → both
        assert not result.iloc[75]   # close=90 → only >80

    def test_or_requires_any_true(self, four_df):
        group  = _group("OR", _rule("Close Price", 1, ">", 100.0),
                               _rule("Close Price", 1, ">", 80.0))
        result = DynamicStrategy({})._evaluate_node(four_df, group).astype(bool)
        assert not result.iloc[0]
        assert result.iloc[25]
        assert result.iloc[50]
        assert result.iloc[75]

    def test_nested_and_or(self, four_df):
        and_inner = _group("AND", _rule("Close Price", 1, ">", 80.0),
                                   _rule("Close Price", 1, ">", 100.0))
        outer_or  = _group("OR", and_inner, _rule("Close Price", 1, ">", 85.0))
        result    = DynamicStrategy({})._evaluate_node(four_df, outer_or).astype(bool)
        assert not result.iloc[0]
        assert result.iloc[25]
        assert result.iloc[50]
        assert result.iloc[75]

    def test_empty_group_returns_no_signals(self):
        result = DynamicStrategy({})._evaluate_node(_make_step(), _group("AND"))
        if isinstance(result, pd.Series):
            assert result.astype(bool).sum() == 0
        else:
            assert not result

    def test_single_condition_group_equals_condition_alone(self):
        df   = _make_step(n=100, lo=80.0, hi=120.0)
        rule = _rule("Close Price", 1, ">", 100.0)
        s    = DynamicStrategy({})
        direct  = s._evaluate_condition(df, rule).astype(bool)
        via_grp = s._evaluate_node(df, _group("AND", rule)).astype(bool)
        pd.testing.assert_series_equal(direct, via_grp, check_names=False)


# ===========================================================================
# 3. VISUAL generate_signals end-to-end
# ===========================================================================

class TestVisualSignals:

    _ENTRY = _group("AND", _rule("RSI", 14, "Crosses Above", 30.0))
    _EXIT  = _group("AND", _rule("RSI", 14, "Crosses Above", 70.0))

    def _strategy(self, **extra):
        return DynamicStrategy(_visual_config(self._ENTRY, self._EXIT, **extra))

    def test_generates_nonzero_signals(self):
        df = _make_oscillating(cycles=4)
        entries, exits, _ = self._strategy().generate_signals(df)
        assert entries.astype(bool).sum() > 0
        assert exits.astype(bool).sum()   > 0

    def test_entry_exit_counts_close(self):
        df = _make_oscillating(cycles=4)
        entries, exits, _ = self._strategy().generate_signals(df)
        diff = abs(entries.astype(bool).sum() - exits.astype(bool).sum())
        assert diff <= 2

    def test_entries_exits_never_same_bar(self):
        df = _make_oscillating(cycles=4)
        entries, exits, _ = self._strategy().generate_signals(df)
        overlap = (entries.astype(bool) & exits.astype(bool)).sum()
        assert overlap == 0

    def test_returns_three_tuple(self):
        result = self._strategy().generate_signals(_make_step())
        assert len(result) == 3
        assert isinstance(result[2], list)

    def test_empty_entry_logic_returns_all_false(self):
        entries, _, _ = DynamicStrategy(
            _visual_config(None, self._EXIT)
        ).generate_signals(_make_step())
        if isinstance(entries, pd.Series):
            assert entries.astype(bool).sum() == 0

    def test_empty_exit_logic_returns_all_false(self):
        _, exits, _ = DynamicStrategy(
            _visual_config(self._ENTRY, None)
        ).generate_signals(_make_step())
        if isinstance(exits, pd.Series):
            assert exits.astype(bool).sum() == 0


# ===========================================================================
# 4. nextBarEntry shift
# ===========================================================================

class TestNextBarEntry:

    _CROSS_UP = _group("AND", _rule("Close Price", 1, "Crosses Above", 100.0))
    _CROSS_DN = _group("AND", _rule("Close Price", 1, "Crosses Below", 100.0))

    def _run(self, next_bar: bool):
        df     = _make_step(n=100, lo=80.0, hi=120.0)
        config = _visual_config(self._CROSS_UP, self._CROSS_DN, nextBarEntry=next_bar)
        entries, _, _ = DynamicStrategy(config).generate_signals(df)
        return entries.astype(bool), df

    def test_no_shift_signal_at_crossing_bar(self):
        entries, _ = self._run(False)
        bars = entries.values.nonzero()[0]
        assert len(bars) >= 1
        assert 50 in bars

    def test_shift_moves_signal_one_bar_later(self):
        entries_no,  _ = self._run(False)
        entries_yes, _ = self._run(True)
        b_no  = entries_no.values.nonzero()[0]
        b_yes = entries_yes.values.nonzero()[0]
        assert b_yes[0] == b_no[0] + 1

    def test_shift_first_bar_always_false(self):
        entries, _ = self._run(True)
        assert not entries.iloc[0]


# ===========================================================================
# 5. StrategyStore CRUD
# ===========================================================================

@pytest.fixture
def store(monkeypatch, tmp_path):
    data_file = str(tmp_path / "strategies.json")
    monkeypatch.setattr(_ss_mod, "DATA_FILE",  data_file)
    monkeypatch.setattr(_ss_mod, "LOCK_FILE",  data_file + ".lock")
    yield _ss_mod.StrategyStore


class TestStrategyStore:

    def test_save_new_strategy_gets_uuid(self, store):
        result = store.save({"name": "RSI Test"})
        uuid.UUID(result["id"])  # raises ValueError if not a valid UUID

    def test_save_and_load_returns_strategy(self, store):
        store.save({"name": "My Strategy"})
        all_s = store.load_all()
        assert len(all_s) == 1 and all_s[0]["name"] == "My Strategy"

    def test_update_existing_no_duplicate(self, store):
        first = store.save({"name": "Original"})
        store.save({"id": first["id"], "name": "Updated"})
        all_s = store.load_all()
        assert len(all_s) == 1 and all_s[0]["name"] == "Updated"

    def test_delete_existing(self, store):
        saved = store.save({"name": "To Delete"})
        assert store.delete_by_id(saved["id"]) is True
        assert store.load_all() == []

    def test_delete_nonexistent_returns_false(self, store):
        assert store.delete_by_id("00000000-0000-0000-0000-000000000000") is False

    def test_get_by_id_correct(self, store):
        s1 = store.save({"name": "Alpha"})
        s2 = store.save({"name": "Beta"})
        found = store.get_by_id(s2["id"])
        assert found["name"] == "Beta"

    def test_missing_file_returns_empty(self, monkeypatch, tmp_path):
        monkeypatch.setattr(_ss_mod, "DATA_FILE",  str(tmp_path / "missing.json"))
        monkeypatch.setattr(_ss_mod, "LOCK_FILE",  str(tmp_path / "missing.json.lock"))
        assert _ss_mod.StrategyStore.load_all() == []

    def test_multiple_saves_accumulate(self, store):
        store.save({"name": "S1"})
        store.save({"name": "S2"})
        store.save({"name": "S3"})
        assert len(store.load_all()) == 3
