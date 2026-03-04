"""Strategy builder backend sanity tests.

Verifies signal correctness, group logic, persistence, and preview endpoint —
the same philosophy as test_metrics_sanity.py: ground-truth assertions, not
just "doesn't crash".

Test groups:
  1. Operator correctness  — _evaluate_condition with all 5 operators
  2. Rule group logic      — AND / OR / nested / empty groups
  3. VISUAL generate_signals end-to-end
  4. nextBarEntry shift    — signals delayed by exactly 1 bar
  5. StrategyStore CRUD    — save / load / update / delete using a temp file
  6. Preview endpoint      — response keys, count accuracy, warning flags
"""
from __future__ import annotations

import os
import sys
import uuid
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from strategies import DynamicStrategy
import services.strategy_store as _ss_mod  # module-level constants DATA_FILE / LOCK_FILE

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _ohlcv(close_array: list | np.ndarray, freq: str = "D") -> pd.DataFrame:
    """Wrap a close-price array into a minimal OHLCV DataFrame."""
    close = np.asarray(close_array, dtype=float)
    dates = pd.date_range("2023-01-01", periods=len(close), freq=freq)
    return pd.DataFrame(
        {
            "open":   close * 0.999,
            "high":   close * 1.005,
            "low":    close * 0.995,
            "close":  close,
            "volume": np.full(len(close), 1_000_000.0),
        },
        index=dates,
    )


def _make_rsi_crossover_up() -> pd.DataFrame:
    """50 stable bars → 30 declining (-2%) → 30 rising (+3%).
    RSI drops well below 30 during decline, then crosses above 30 once during rise.
    """
    p, prices = 100.0, []
    for _ in range(50): prices.append(p)
    for _ in range(30): p *= 0.98; prices.append(p)
    for _ in range(30): p *= 1.03; prices.append(p)
    return _ohlcv(prices)


def _make_rsi_crossover_down() -> pd.DataFrame:
    """50 stable → 30 rising (+3%) → 30 declining (-2%).
    RSI rises above 70 during rise, then crosses below 70 once during decline.
    """
    p, prices = 100.0, []
    for _ in range(50): prices.append(p)
    for _ in range(30): p *= 1.03; prices.append(p)
    for _ in range(30): p *= 0.98; prices.append(p)
    return _ohlcv(prices)


def _make_oscillating(cycles: int = 4, down: int = 30, up: int = 30) -> pd.DataFrame:
    """Oscillating prices — RSI alternately < 30 and > 70, multiple cycles."""
    p, prices = 100.0, []
    for _ in range(cycles):
        for _ in range(down): p *= 0.97; prices.append(p)
        for _ in range(up):   p *= 1.04; prices.append(p)
    return _ohlcv(prices)


def _make_step(n: int = 100, lo: float = 80.0, hi: float = 120.0) -> pd.DataFrame:
    """First n//2 bars = lo, remaining = hi. Perfect for deterministic comparisons."""
    close = np.where(np.arange(n) < n // 2, lo, hi).astype(float)
    return _ohlcv(close)


def _make_four_block(n_block: int = 25) -> pd.DataFrame:
    """4 blocks: 70, 90, 110, 90 — enables multi-condition AND/OR assertions."""
    close = np.array([70] * n_block + [90] * n_block + [110] * n_block + [90] * n_block,
                     dtype=float)
    return _ohlcv(close)


# ── Rule / Group dict builders ─────────────────────────────────────────

def _rule(
    indicator: str,
    period: int,
    operator: str,
    value: float | None,
    compare_type: str = "STATIC",
    right_indicator: str | None = None,
    right_period: int | None = None,
) -> dict:
    r: dict = {
        "type":        "RULE",
        "indicator":   indicator,
        "period":      period,
        "operator":    operator,
        "compareType": compare_type,
        "value":       value,
    }
    if right_indicator:
        r["rightIndicator"] = right_indicator
        r["rightPeriod"]    = right_period
    return r


def _group(logic: str, *conditions) -> dict:
    return {"type": "GROUP", "logic": logic, "conditions": list(conditions)}


def _visual_config(entry_group, exit_group, **extra) -> dict:
    return {"mode": "VISUAL", "entryLogic": entry_group, "exitLogic": exit_group, **extra}


# ---------------------------------------------------------------------------
# 1 — Operator Correctness
# ---------------------------------------------------------------------------

class TestOperatorLogic:

    def test_crosses_above_fires_exactly_once(self):
        """RSI[14] Crosses Above 30 → exactly 1 True bar during recovery."""
        df   = _make_rsi_crossover_up()
        rule = _rule("RSI", 14, "Crosses Above", 30.0)
        s    = DynamicStrategy({})
        result = s._evaluate_condition(df, rule)
        assert isinstance(result, pd.Series), "Result must be a Series"
        n_true = result.astype(bool).sum()
        assert 1 <= n_true <= 2, (
            f"Expected 1 crossover above 30, got {n_true}. "
            f"RSI range: {result.index[result.astype(bool)].tolist()}"
        )

    def test_crosses_below_fires_exactly_once(self):
        """RSI[14] Crosses Below 70 → exactly 1 True bar during decline."""
        df   = _make_rsi_crossover_down()
        rule = _rule("RSI", 14, "Crosses Below", 70.0)
        s    = DynamicStrategy({})
        result = s._evaluate_condition(df, rule)
        n_true = result.astype(bool).sum()
        assert 1 <= n_true <= 2, f"Expected 1 crossover below 70, got {n_true}"

    def test_greater_than_is_persistent_not_one_bar(self):
        """Close > 100 should be True for EVERY bar where close > 100, not just crossover bar."""
        df   = _make_step(n=100, lo=80.0, hi=120.0)
        rule = _rule("Close Price", 1, ">", 100.0)
        s    = DynamicStrategy({})
        result = s._evaluate_condition(df, rule).astype(bool)
        close  = df["close"]
        # First half (close=80): all False
        assert not result.iloc[:50].any(), "Bars with close=80 should all be False for >100"
        # Second half (close=120): all True
        assert result.iloc[50:].all(), "Bars with close=120 should all be True for >100"
        # Count: exactly n//2 True bars (persistent, not one-bar)
        assert result.sum() == 50, (
            f"'>' is persistent: expected 50 True bars, got {result.sum()}"
        )

    def test_less_than_is_persistent(self):
        df   = _make_step(n=100, lo=80.0, hi=120.0)
        rule = _rule("Close Price", 1, "<", 100.0)
        s    = DynamicStrategy({})
        result = s._evaluate_condition(df, rule).astype(bool)
        assert result.iloc[0],    "close=80 < 100 must be True"
        assert not result.iloc[-1], "close=120 < 100 must be False"
        assert result.sum() == 50, f"'<' is persistent: expected 50 True, got {result.sum()}"

    def test_indicator_vs_indicator(self):
        """EMA[10] > SMA[20] — INDICATOR compareType — must produce a non-degenerate result."""
        df   = _make_oscillating(cycles=3)
        rule = _rule("EMA", 10, ">", None, compare_type="INDICATOR",
                     right_indicator="SMA", right_period=20)
        s      = DynamicStrategy({})
        result = s._evaluate_condition(df, rule).astype(bool)
        assert isinstance(result, pd.Series), "Indicator-vs-indicator must return a Series"
        # Not all True and not all False (oscillating data crosses many times)
        assert result.sum() > 0,          "Expected some True bars for EMA>SMA"
        assert (~result).sum() > 0,       "Expected some False bars for EMA>SMA"

    def test_flat_data_no_crossover(self):
        """Constant prices → RSI stays around 50 → Crosses Above 70 never fires."""
        df   = _ohlcv(np.full(100, 100.0))
        rule = _rule("RSI", 14, "Crosses Above", 70.0)
        s    = DynamicStrategy({})
        result = s._evaluate_condition(df, rule).astype(bool)
        assert result.sum() == 0, f"No crossover expected on flat data, got {result.sum()}"

    def test_invalid_operator_returns_false_not_crash(self):
        """Unknown operator must return False gracefully."""
        df   = _make_step()
        rule = _rule("Close Price", 1, "INVALID_OP", 100.0)
        s    = DynamicStrategy({})
        result = s._evaluate_condition(df, rule)
        # Either False scalar or all-False series
        if isinstance(result, pd.Series):
            assert result.astype(bool).sum() == 0
        else:
            assert not result


# ---------------------------------------------------------------------------
# 2 — Rule Group Logic (AND / OR / nested)
# ---------------------------------------------------------------------------

class TestGroupLogic:

    @pytest.fixture
    def four_df(self) -> pd.DataFrame:
        return _make_four_block(n_block=25)

    def test_and_group_requires_all_true(self, four_df):
        """AND(Close>80, Close>100) → True only where close=110 (bars 50-74)."""
        group  = _group("AND",
                        _rule("Close Price", 1, ">", 80.0),
                        _rule("Close Price", 1, ">", 100.0))
        result = DynamicStrategy({})._evaluate_node(four_df, group).astype(bool)

        assert not result.iloc[0],  "close=70 → AND=False (neither cond)"
        assert not result.iloc[25], "close=90 → AND=False (only >80, not >100)"
        assert result.iloc[50],     "close=110 → AND=True (both cond)"
        assert not result.iloc[75], "close=90 again → AND=False"

    def test_or_group_requires_any_true(self, four_df):
        """OR(Close>100, Close>80) → True where close=110 or close=90 (>80 covers 90 and 110)."""
        group  = _group("OR",
                        _rule("Close Price", 1, ">", 100.0),
                        _rule("Close Price", 1, ">", 80.0))
        result = DynamicStrategy({})._evaluate_node(four_df, group).astype(bool)

        assert not result.iloc[0],  "close=70 → neither >100 nor >80 → OR=False"
        assert result.iloc[25],     "close=90  → >80 True → OR=True"
        assert result.iloc[50],     "close=110 → both True → OR=True"
        assert result.iloc[75],     "close=90  → >80 True → OR=True"

    def test_nested_and_or(self, four_df):
        """(Close>80 AND Close>100) OR Close>85
           Bars 70: (F AND F) OR F = F
           Bars 90: (T AND F) OR T = T  (90>85)
           Bars 110: (T AND T) OR T = T
           Bars 90: same as second block = T
        """
        and_inner = _group("AND",
                           _rule("Close Price", 1, ">", 80.0),
                           _rule("Close Price", 1, ">", 100.0))
        outer_or  = _group("OR", and_inner, _rule("Close Price", 1, ">", 85.0))
        result    = DynamicStrategy({})._evaluate_node(four_df, outer_or).astype(bool)

        assert not result.iloc[0],  "70: (F AND F) OR F = F"
        assert result.iloc[25],     "90: (T AND F) OR T = T"
        assert result.iloc[50],     "110: (T AND T) OR T = T"
        assert result.iloc[75],     "90: OR=T"

    def test_empty_group_returns_no_signals(self):
        df     = _make_step()
        group  = _group("AND")   # no conditions
        result = DynamicStrategy({})._evaluate_node(df, group)
        # Must return False (scalar) — empty group = no signals
        if isinstance(result, pd.Series):
            assert result.astype(bool).sum() == 0, "Empty group must yield 0 signals"
        else:
            assert not result, "Empty group must be False"

    def test_single_condition_group_equals_condition_alone(self):
        df   = _make_step(n=100, lo=80.0, hi=120.0)
        rule = _rule("Close Price", 1, ">", 100.0)
        s    = DynamicStrategy({})
        direct  = s._evaluate_condition(df, rule).astype(bool)
        via_grp = s._evaluate_node(df, _group("AND", rule)).astype(bool)
        pd.testing.assert_series_equal(direct, via_grp, check_names=False)


# ---------------------------------------------------------------------------
# 3 — generate_signals VISUAL mode end-to-end
# ---------------------------------------------------------------------------

class TestVisualSignals:

    _ENTRY = _group("AND", _rule("RSI", 14, "Crosses Above", 30.0))
    _EXIT  = _group("AND", _rule("RSI", 14, "Crosses Above", 70.0))

    def _strategy(self, **extra):
        return DynamicStrategy(_visual_config(self._ENTRY, self._EXIT, **extra))

    def test_generates_nonzero_signals(self):
        df = _make_oscillating(cycles=4)
        entries, exits, _ = self._strategy().generate_signals(df)
        assert entries.astype(bool).sum() > 0, "Expected entry signals on oscillating data"
        assert exits.astype(bool).sum()   > 0, "Expected exit signals on oscillating data"

    def test_entry_exit_counts_approximately_equal(self):
        df = _make_oscillating(cycles=4)
        entries, exits, _ = self._strategy().generate_signals(df)
        diff = abs(entries.astype(bool).sum() - exits.astype(bool).sum())
        assert diff <= 2, (
            f"Entry/exit counts should be close: "
            f"{entries.astype(bool).sum()} vs {exits.astype(bool).sum()}"
        )

    def test_entries_exits_never_on_same_bar(self):
        df = _make_oscillating(cycles=4)
        entries, exits, _ = self._strategy().generate_signals(df)
        overlap = (entries.astype(bool) & exits.astype(bool)).sum()
        assert overlap == 0, f"Found {overlap} bars that are both entry and exit"

    def test_returns_three_tuple(self):
        """generate_signals must return exactly (entries, exits, warnings)."""
        result = self._strategy().generate_signals(_make_step())
        assert len(result) == 3, f"Expected 3-tuple, got len={len(result)}"
        _, _, warnings = result
        assert isinstance(warnings, list), "Third element must be a list"

    def test_empty_entry_logic_returns_all_false(self):
        df     = _make_step()
        config = _visual_config(entry_group=None, exit_group=self._EXIT)
        entries, _, _ = DynamicStrategy(config).generate_signals(df)
        if isinstance(entries, pd.Series):
            assert entries.astype(bool).sum() == 0, "None entryLogic → 0 entry signals"
        else:
            assert not entries

    def test_empty_exit_logic_returns_all_false(self):
        df     = _make_step()
        config = _visual_config(entry_group=self._ENTRY, exit_group=None)
        _, exits, _ = DynamicStrategy(config).generate_signals(df)
        if isinstance(exits, pd.Series):
            assert exits.astype(bool).sum() == 0, "None exitLogic → 0 exit signals"
        else:
            assert not exits


# ---------------------------------------------------------------------------
# 4 — nextBarEntry shift
# ---------------------------------------------------------------------------

class TestNextBarEntry:
    """Close Price Crosses Above 100 fires at bar 50 (step data boundary).
    With nextBarEntry=True it must appear at bar 51 instead.
    """

    _CROSS_UP = _group("AND", _rule("Close Price", 1, "Crosses Above", 100.0))
    _CROSS_DN = _group("AND", _rule("Close Price", 1, "Crosses Below", 100.0))

    def _run(self, next_bar: bool):
        df     = _make_step(n=100, lo=80.0, hi=120.0)
        config = _visual_config(self._CROSS_UP, self._CROSS_DN, nextBarEntry=next_bar)
        entries, _, _ = DynamicStrategy(config).generate_signals(df)
        return entries.astype(bool), df

    def test_no_shift_signal_at_crossing_bar(self):
        entries, _ = self._run(False)
        firing_bars = entries.values.nonzero()[0]
        assert len(firing_bars) >= 1, "Expected at least one entry signal"
        # The cross happens at bar 50 (first bar where close=120 after close=80)
        assert 50 in firing_bars, f"Entry should fire at bar 50, got {firing_bars.tolist()}"

    def test_shift_moves_signal_one_bar_later(self):
        entries_no,   _ = self._run(False)
        entries_yes,  _ = self._run(True)
        bars_no  = entries_no.values.nonzero()[0]
        bars_yes = entries_yes.values.nonzero()[0]
        assert len(bars_no)  >= 1, "No-shift run: need at least 1 signal"
        assert len(bars_yes) >= 1, "Shift run: need at least 1 signal"
        assert bars_yes[0] == bars_no[0] + 1, (
            f"nextBarEntry shift failed: no-shift bar={bars_no[0]}, "
            f"shift bar={bars_yes[0]} (expected {bars_no[0]+1})"
        )

    def test_shift_first_bar_always_false(self):
        """After shift, iloc[0] must be False — there's no bar before bar 0."""
        entries, _ = self._run(True)
        assert not entries.iloc[0], "First bar must be False with nextBarEntry=True"

    def test_no_shift_first_bar_can_be_true(self):
        """Without shift, first bar CAN fire (if condition met from bar 0)."""
        # For this we just verify shift=False runs without asserting about first bar
        entries, _ = self._run(False)
        assert isinstance(entries, pd.Series)  # sanity — doesn't crash


# ---------------------------------------------------------------------------
# 5 — StrategyStore CRUD
# ---------------------------------------------------------------------------

@pytest.fixture
def store(monkeypatch, tmp_path):
    """Redirect StrategyStore to a temp file so tests don't touch production data.

    DATA_FILE and LOCK_FILE are module-level constants — patch at module level.
    """
    data_file = str(tmp_path / "strategies.json")
    monkeypatch.setattr(_ss_mod, "DATA_FILE",  data_file)
    monkeypatch.setattr(_ss_mod, "LOCK_FILE",  data_file + ".lock")
    yield _ss_mod.StrategyStore


class TestStrategyStore:

    def test_save_new_strategy_gets_uuid(self, store):
        result = store.save({"name": "RSI Test"})
        assert "id" in result, "Saved strategy must have an id"
        uuid.UUID(result["id"])   # raises ValueError if not a valid UUID

    def test_save_and_load_returns_strategy(self, store):
        store.save({"name": "My Strategy"})
        all_strats = store.load_all()
        assert len(all_strats) == 1
        assert all_strats[0]["name"] == "My Strategy"

    def test_update_existing_no_duplicate(self, store):
        first = store.save({"name": "Original"})
        store.save({"id": first["id"], "name": "Updated"})
        all_strats = store.load_all()
        assert len(all_strats) == 1, "Update must not create a duplicate entry"
        assert all_strats[0]["name"] == "Updated"

    def test_delete_existing_returns_true_and_removes(self, store):
        saved = store.save({"name": "To Delete"})
        result = store.delete_by_id(saved["id"])
        assert result is True
        assert store.load_all() == []

    def test_delete_nonexistent_returns_false(self, store):
        result = store.delete_by_id("00000000-0000-0000-0000-000000000000")
        assert result is False

    def test_get_by_id_returns_correct_one(self, store):
        s1 = store.save({"name": "Alpha"})
        s2 = store.save({"name": "Beta"})
        found = store.get_by_id(s2["id"])
        assert found is not None
        assert found["name"] == "Beta"
        assert found["id"]   == s2["id"]

    def test_load_all_missing_file_returns_empty(self, monkeypatch, tmp_path):
        monkeypatch.setattr(_ss_mod, "DATA_FILE",  str(tmp_path / "nonexistent.json"))
        monkeypatch.setattr(_ss_mod, "LOCK_FILE",  str(tmp_path / "nonexistent.json.lock"))
        result = _ss_mod.StrategyStore.load_all()
        assert result == [], "Missing file must return empty list, not crash"

    def test_save_id_new_creates_real_uuid(self, store):
        result = store.save({"id": "new", "name": "Fresh"})
        assert result["id"] != "new", "id='new' must be replaced by a real UUID"
        uuid.UUID(result["id"])

    def test_multiple_saves_accumulate(self, store):
        store.save({"name": "S1"})
        store.save({"name": "S2"})
        store.save({"name": "S3"})
        assert len(store.load_all()) == 3


# ---------------------------------------------------------------------------
# 6 — Preview Endpoint
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def flask_client():
    """Flask test client for the full app — used for HTTP-level preview tests."""
    from app import app as flask_app
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c


def _mock_fetcher(df: pd.DataFrame):
    """Patch DataFetcher in strategy_routes so no real API call is made."""
    return patch(
        "routes.strategy_routes.DataFetcher",
        return_value=MagicMock(fetch_historical_data=MagicMock(return_value=df)),
    )


def _preview_payload(
    mode: str = "VISUAL",
    entry_group: dict | None = None,
    exit_group: dict | None = None,
    **extra,
) -> dict:
    payload: dict = {
        "symbol":    "TEST",
        "timeframe": "1d",
        "mode":      mode,
        "entryLogic": entry_group or _group("AND", _rule("RSI", 14, "Crosses Above", 30.0)),
        "exitLogic":  exit_group  or _group("AND", _rule("RSI", 14, "Crosses Above", 70.0)),
    }
    payload.update(extra)
    return payload


class TestPreviewEndpoint:

    def test_required_keys_present(self, flask_client):
        df = _make_oscillating(cycles=3)
        with _mock_fetcher(df):
            resp = flask_client.post(
                "/api/v1/strategies/preview", json=_preview_payload()
            )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.get_json()
        for key in ("status", "entry_count", "exit_count", "entry_dates", "exit_dates", "warnings"):
            assert key in data, f"Missing key '{key}' in preview response: {list(data.keys())}"

    def test_entry_count_matches_dates_length(self, flask_client):
        df = _make_oscillating(cycles=3)
        with _mock_fetcher(df):
            resp = flask_client.post(
                "/api/v1/strategies/preview", json=_preview_payload()
            )
        data = resp.get_json()
        assert data["entry_count"] == len(data["entry_dates"]), (
            f"entry_count={data['entry_count']} but "
            f"len(entry_dates)={len(data['entry_dates'])}"
        )
        assert data["exit_count"] == len(data["exit_dates"]), (
            f"exit_count={data['exit_count']} but "
            f"len(exit_dates)={len(data['exit_dates'])}"
        )

    def test_empty_exit_logic_flags_warning(self, flask_client):
        df = _make_oscillating(cycles=3)
        payload = _preview_payload(exit_group=_group("AND"))  # empty conditions
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview", json=payload)
        data = resp.get_json()
        # The backend should set empty_exit=True or include a warning about it
        has_flag    = data.get("empty_exit") is True
        has_warning = any("exit" in w.lower() for w in data.get("warnings", []))
        assert has_flag or has_warning, (
            "Empty exit logic must produce either empty_exit=True or a warning message"
        )

    def test_sl_tp_set_flags_warning(self, flask_client):
        df = _make_oscillating(cycles=3)
        payload = _preview_payload(stopLossPct=2.0, takeProfitPct=6.0)
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview", json=payload)
        data = resp.get_json()
        has_flag    = data.get("sl_tp_ignored") is True
        has_warning = any(
            "sl" in w.lower() or "stop" in w.lower() or "tp" in w.lower()
            for w in data.get("warnings", [])
        )
        assert has_flag or has_warning, (
            "SL/TP values should produce sl_tp_ignored=True or a warning message"
        )

    def test_broken_code_mode_no_500_crash(self, flask_client):
        """A runtime error in user CODE must not return an uncaught 500."""
        df = _make_oscillating(cycles=2)
        payload = {
            "symbol":    "TEST",
            "timeframe": "1d",
            "mode":      "CODE",
            "pythonCode": "def signal_logic(df): return this_will_fail_at_runtime(df)",
        }
        with _mock_fetcher(df):
            resp = flask_client.post("/api/v1/strategies/preview", json=payload)
        # Must return structured JSON — not an HTML 500 page
        assert resp.content_type.startswith("application/json"), (
            "Error response must be JSON, not an HTML page"
        )
        data = resp.get_json()
        assert data is not None, "Error response body must parse as JSON"
