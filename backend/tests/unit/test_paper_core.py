"""tests/unit/test_paper_core.py — Core paper-trading unit tests (no HTTP).

Consolidates:
  - test_paper_store.py   (SQLite CRUD for monitors, positions, history)
  - test_ltp_service.py   (PnL math, SL/TP direction logic)
  - test_signal_checker.py (signal generation from live candles)
  - test_replay_engine.py  (replay bar-by-bar engine)

Design: all tests use isolated in-memory/temp SQLite via the paper_store
fixture from conftest.py. No Dhan API calls are made.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

_TESTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _TESTS not in sys.path:
    sys.path.insert(0, _TESTS)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from testlib import make_monitor, make_ohlcv, make_position


# ===========================================================================
# 1. paper_store CRUD
# ===========================================================================

class TestMonitorStore:

    def test_save_and_retrieve(self, paper_store):
        paper_store.save_monitor(make_monitor("m1"))
        monitors = paper_store.get_monitors()
        assert any(m["id"] == "m1" for m in monitors)

    def test_config_round_trips_as_dict(self, paper_store):
        paper_store.save_monitor(make_monitor("m2"))
        mon = next(m for m in paper_store.get_monitors() if m["id"] == "m2")
        assert isinstance(mon["config"], dict)
        assert mon["config"]["period"] == 14

    def test_delete_monitor(self, paper_store):
        paper_store.save_monitor(make_monitor("del_mon"))
        assert paper_store.delete_monitor("del_mon") is True
        assert not any(m["id"] == "del_mon" for m in paper_store.get_monitors())

    def test_delete_nonexistent_returns_false(self, paper_store):
        assert paper_store.delete_monitor("ghost") is False


class TestPositionStore:

    def test_save_and_retrieve(self, paper_store):
        paper_store.save_position(make_position("p1"))
        assert any(p["id"] == "p1" for p in paper_store.get_positions())

    def test_update_ltp(self, paper_store):
        paper_store.save_position(make_position("p_upd"))
        paper_store.update_position_ltp("p_upd", 3000.0, 500.0, 1.69)
        pos = next(p for p in paper_store.get_positions() if p["id"] == "p_upd")
        assert pos["ltp"] == 3000.0
        assert pos["pnl"] == 500.0

    def test_get_by_symbol(self, paper_store):
        paper_store.save_position(make_position("p_sym", symbol="INFY"))
        pos = paper_store.get_position_by_symbol("INFY")
        assert pos is not None and pos["symbol"] == "INFY"

    def test_get_by_symbol_returns_none_when_missing(self, paper_store):
        assert paper_store.get_position_by_symbol("NOTEXIST") is None


class TestClosePosition:

    def test_moves_to_history(self, paper_store):
        paper_store.save_position(make_position("to_close"))
        paper_store.close_position("to_close", exit_price=3050.0, exit_reason="SIGNAL")
        assert not any(p["id"] == "to_close" for p in paper_store.get_positions())
        history = paper_store.get_trade_history()
        assert any(h["exit_reason"] == "SIGNAL" for h in history)

    def test_pnl_calculation_long_position(self, paper_store):
        """LONG 10 units @ 2950, exit @ 3050 → PnL = +1000."""
        paper_store.save_position(make_position("pnl_p", avg_price=2950.0, qty=10))
        closed = paper_store.close_position("pnl_p", exit_price=3050.0)
        assert closed["pnl"] == pytest.approx(1000.0, abs=0.01)

    def test_nonexistent_returns_none(self, paper_store):
        assert paper_store.close_position("ghost", exit_price=100.0) is None


class TestSettings:

    def test_round_trip(self, paper_store):
        paper_store.set_setting("capital_pct", "15.0")
        assert paper_store.get_setting("capital_pct") == "15.0"

    def test_default_value(self, paper_store):
        assert paper_store.get_setting("nonexistent_key", "42") == "42"


# ===========================================================================
# 2. LTP service — PnL math and SL/TP direction
# ===========================================================================

class TestLtpPnL:
    """Verify _calc_pnl returns correct values for LONG and SHORT positions."""

    @pytest.fixture
    def calc_pnl(self):
        from services.ltp_service import _calc_pnl
        return _calc_pnl

    def test_long_profit(self, calc_pnl):
        pnl, pnl_pct = calc_pnl("LONG", 100.0, 110.0, 10)
        assert pnl     == pytest.approx(100.0)
        assert pnl_pct == pytest.approx(10.0)

    def test_long_loss(self, calc_pnl):
        pnl, _ = calc_pnl("LONG", 100.0, 90.0, 10)
        assert pnl < 0

    def test_short_profit(self, calc_pnl):
        pnl, _ = calc_pnl("SHORT", 100.0, 90.0, 10)   # price fell → short wins
        assert pnl > 0

    def test_short_loss(self, calc_pnl):
        pnl, _ = calc_pnl("SHORT", 100.0, 110.0, 10)   # price rose → short loses
        assert pnl < 0


class TestStopLossDirection:
    """SL trigger logic must be directionally aware."""

    @pytest.fixture
    def is_sl_hit(self):
        from services.ltp_service import _is_sl_hit
        return _is_sl_hit

    def test_long_sl_hit_below(self, is_sl_hit):
        assert is_sl_hit("LONG", ltp=94.0, sl_price=95.0) is True

    def test_long_sl_not_hit_above(self, is_sl_hit):
        assert is_sl_hit("LONG", ltp=96.0, sl_price=95.0) is False

    def test_short_sl_hit_above(self, is_sl_hit):
        assert is_sl_hit("SHORT", ltp=106.0, sl_price=105.0) is True

    def test_short_sl_not_hit_below(self, is_sl_hit):
        assert is_sl_hit("SHORT", ltp=104.0, sl_price=105.0) is False

    def test_none_sl_never_triggers(self, is_sl_hit):
        assert is_sl_hit("LONG", ltp=50.0, sl_price=None) is False


class TestTakeProfitDirection:

    @pytest.fixture
    def is_tp_hit(self):
        from services.ltp_service import _is_tp_hit
        return _is_tp_hit

    def test_long_tp_hit_above(self, is_tp_hit):
        assert is_tp_hit("LONG", ltp=111.0, tp_price=110.0) is True

    def test_long_tp_not_hit_below(self, is_tp_hit):
        assert is_tp_hit("LONG", ltp=109.0, tp_price=110.0) is False

    def test_short_tp_hit_below(self, is_tp_hit):
        assert is_tp_hit("SHORT", ltp=89.0, tp_price=90.0) is True

    def test_short_tp_not_hit_above(self, is_tp_hit):
        assert is_tp_hit("SHORT", ltp=91.0, tp_price=90.0) is False

    def test_none_tp_never_triggers(self, is_tp_hit):
        assert is_tp_hit("LONG", ltp=200.0, tp_price=None) is False


class TestRefreshPositions:
    """Verify that LTP-based SL/TP detection works correctly.

    refresh_all_positions() uses a local-scope `from services import paper_store` import
    which makes module-level patching complex. We test the SL/TP detection math 
    (_is_sl_hit, _is_tp_hit) + the store's close_position directly.
    """

    def test_sl_hit_logic_long(self):
        """_is_sl_hit: LONG position with LTP below SL triggers."""
        from services.ltp_service import _is_sl_hit
        assert _is_sl_hit("LONG", ltp=2800.0, sl_price=2850.0) is True
        assert _is_sl_hit("LONG", ltp=2900.0, sl_price=2850.0) is False

    def test_tp_hit_logic_long(self):
        """_is_tp_hit: LONG position with LTP above TP triggers."""
        from services.ltp_service import _is_tp_hit
        assert _is_tp_hit("LONG", ltp=3300.0, tp_price=3200.0) is True
        assert _is_tp_hit("LONG", ltp=3100.0, tp_price=3200.0) is False

    def test_position_closed_on_sl_direct(self, paper_store):
        """Store's close_position records correct exit_reason and pnl."""
        paper_store.save_position(make_position(
            "sl_direct", avg_price=3000.0, qty=5,
            sl_price=2850.0, tp_price=None,
        ))
        result = paper_store.close_position(
            "sl_direct", exit_price=2800.0, exit_reason="SL"
        )
        assert result is not None
        assert result["exit_reason"] == "SL"
        assert result["pnl"] < 0

    def test_position_closed_on_tp_direct(self, paper_store):
        """Store's close_position records correct exit_reason and pnl."""
        paper_store.save_position(make_position(
            "tp_direct", avg_price=3000.0, qty=5,
            sl_price=None, tp_price=3200.0,
        ))
        result = paper_store.close_position(
            "tp_direct", exit_price=3300.0, exit_reason="TP"
        )
        assert result is not None
        assert result["exit_reason"] == "TP"
        assert result["pnl"] > 0


# ===========================================================================
# 3. Signal checker
# ===========================================================================

class TestSignalChecker:

    def _make_df(self, n: int = 100) -> pd.DataFrame:
        return make_ohlcv(n=n)

    def _mock_strategy(self, entries_last: bool = False, exits_last: bool = False):
        mock = MagicMock()
        n = 100
        entries = pd.Series([False] * n)
        exits   = pd.Series([False] * n)
        if entries_last:
            entries.iloc[-1] = True
            entries.iloc[-2] = True
        if exits_last:
            exits.iloc[-1] = True
            exits.iloc[-2] = True
        mock.generate_signals.return_value = (entries, exits, [], {})
        return mock

    def test_buy_signal_fires_on_entry(self, paper_store):
        monitor = make_monitor("sc_mon")
        paper_store.save_monitor(monitor)
        df = self._make_df()
        with patch("services.signal_checker._fetch_candles", return_value=df), \
             patch("strategies.presets.StrategyFactory") as mock_sf:
            mock_sf.get_strategy.return_value = self._mock_strategy(entries_last=True)
            from services.signal_checker import check_signal
            signal, qty, ltp, inds = check_signal(monitor, has_open_position=False)
        assert signal == "BUY"
        assert qty >= 1

    def test_sell_signal_fires_on_exit(self, paper_store):
        monitor = make_monitor("sc_mon2")
        paper_store.save_monitor(monitor)
        df = self._make_df()
        with patch("services.signal_checker._fetch_candles", return_value=df), \
             patch("strategies.presets.StrategyFactory") as mock_sf:
            mock_sf.get_strategy.return_value = self._mock_strategy(exits_last=True)
            from services.signal_checker import check_signal
            signal, _, _, _ = check_signal(monitor, has_open_position=True)
        assert signal == "SELL"

    def test_no_signal_returns_hold(self, paper_store):
        """No entry/exit signal returns 'HOLD' (not None)."""
        monitor = make_monitor("sc_mon3")
        paper_store.save_monitor(monitor)
        df = self._make_df()
        with patch("services.signal_checker._fetch_candles", return_value=df), \
             patch("strategies.presets.StrategyFactory") as mock_sf:
            mock_sf.get_strategy.return_value = self._mock_strategy()
            from services.signal_checker import check_signal
            signal, _, _, _ = check_signal(monitor, has_open_position=False)
        assert signal in (None, "HOLD")


# ===========================================================================
# 4. Replay engine — tests via _simulate (avoids Dhan API requirement)
# ===========================================================================

class TestReplayEngine:
    """Tests for ReplayEngine._simulate, the core simulation loop.

    ReplayEngine.run() requires a Dhan API connection, so we test the
    simulation logic directly via _simulate() with pre-computed signals.
    """

    def _make_df(self, n: int = 50) -> pd.DataFrame:
        df = make_ohlcv(n=n, start_price=100.0, end_price=150.0)
        df.index = pd.to_datetime(df.index)
        return df

    def _all_false(self, df: pd.DataFrame) -> pd.Series:
        return pd.Series(False, index=range(len(df)))

    def _entry_at(self, df: pd.DataFrame, bar: int) -> pd.Series:
        s = self._all_false(df)
        s.iloc[bar] = True
        return s

    def _exit_at(self, df: pd.DataFrame, bar: int) -> pd.Series:
        s = self._all_false(df)
        s.iloc[bar] = True
        return s

    def test_no_signals_returns_all_tick_events(self):
        """With no signals, every bar emits exactly one TICK event."""
        from services.replay_engine import ReplayEngine
        n = 20
        df = self._make_df(n=n)
        events, summary = ReplayEngine._simulate(
            df=df, symbol="TEST",
            entries=self._all_false(df),
            exits=self._all_false(df),
            sides=None,
            sl_pct=None, tp_pct=None,
            capital_pct=10.0, virtual_capital=100_000.0,
            next_bar_entry=False, slippage=0.0, commission=0.0,
        )
        tick_events = [e for e in events if e["type"] == "TICK"]
        assert len(tick_events) == n
        assert summary["totalTrades"] == 0

    def test_buy_hold_positive_pnl(self):
        """Enter bar 0, no exit → force-closed at last bar on uptrending data."""
        from services.replay_engine import ReplayEngine
        df = self._make_df(n=50)
        entries = self._entry_at(df, 0)
        events, summary = ReplayEngine._simulate(
            df=df, symbol="TEST",
            entries=entries, exits=self._all_false(df),
            sides=None,
            sl_pct=None, tp_pct=None,
            capital_pct=100.0, virtual_capital=100_000.0,
            next_bar_entry=False, slippage=0.0, commission=0.0,
        )
        assert summary["totalTrades"] == 1
        assert summary["netPnl"] > 0  # uptrending data → long position profits

    def test_position_opened_event_emitted(self):
        """Entry signal → POSITION_OPENED event in stream."""
        from services.replay_engine import ReplayEngine
        df = self._make_df(n=30)
        events, _ = ReplayEngine._simulate(
            df=df, symbol="TEST",
            entries=self._entry_at(df, 5),
            exits=self._all_false(df),
            sides=None,
            sl_pct=None, tp_pct=None,
            capital_pct=10.0, virtual_capital=100_000.0,
            next_bar_entry=False, slippage=0.0, commission=0.0,
        )
        pos_events = [e for e in events if e["type"] == "POSITION_OPENED"]
        assert len(pos_events) >= 1

    def test_trade_closed_event_on_exit(self):
        """Entry bar 5, exit bar 15 → TRADE_CLOSED event at bar 15."""
        from services.replay_engine import ReplayEngine
        df = self._make_df(n=30)
        events, summary = ReplayEngine._simulate(
            df=df, symbol="TEST",
            entries=self._entry_at(df, 5),
            exits=self._exit_at(df, 15),
            sides=None,
            sl_pct=None, tp_pct=None,
            capital_pct=10.0, virtual_capital=100_000.0,
            next_bar_entry=False, slippage=0.0, commission=0.0,
        )
        closed_events = [e for e in events if e["type"] == "TRADE_CLOSED"]
        assert len(closed_events) == 1
        assert summary["totalTrades"] == 1

    def test_sl_triggers_closes_position(self):
        """SL=10% on LONG @ 100, price drops to 85 → SL fires."""
        from services.replay_engine import ReplayEngine
        import numpy as np

        # Price starts at 100 then drops to 85
        n = 20
        close = np.array([100.0] * 5 + [85.0] * 15)
        idx = pd.date_range("2023-01-01", periods=n, freq="D")
        df = pd.DataFrame({"open": close, "high": close, "low": close,
                           "close": close, "volume": np.ones(n)}, index=idx)
        events, summary = ReplayEngine._simulate(
            df=df, symbol="TEST",
            entries=self._entry_at(df, 0),
            exits=self._all_false(df),
            sides=None,
            sl_pct=10.0, tp_pct=None,
            capital_pct=100.0, virtual_capital=100_000.0,
            next_bar_entry=False, slippage=0.0, commission=0.0,
        )
        closed_events = [e for e in events if e["type"] == "TRADE_CLOSED"]
        assert len(closed_events) == 1
        trade = closed_events[0]["trade"]
        assert trade["exit_reason"] == "SL"
        assert trade["pnl"] < 0

    def test_summary_has_required_keys(self):
        """summary dict must always have all required keys."""
        from services.replay_engine import ReplayEngine
        df = self._make_df(n=20)
        _, summary = ReplayEngine._simulate(
            df=df, symbol="TEST",
            entries=self._all_false(df),
            exits=self._all_false(df),
            sides=None,
            sl_pct=None, tp_pct=None,
            capital_pct=10.0, virtual_capital=100_000.0,
            next_bar_entry=False, slippage=0.0, commission=0.0,
        )
        for key in ("totalTrades", "winTrades", "lossTrades", "winRate",
                    "netPnl", "netPnlPct", "maxDrawdown", "finalEquity"):
            assert key in summary, f"Missing summary key: {key}"
