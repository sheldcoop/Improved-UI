"""services/replay_engine.py — Historical replay simulation engine.

Runs a bar-by-bar simulation of a strategy against historical OHLCV data,
emitting typed events that the frontend can animate in real time.

Design principles:
    - Cache-first data fetch via DataFetcher (no live API call per click)
    - Supports LONG and SHORT positions with correct SL/TP direction math
    - Tracks a running equity curve so the frontend chart updates per tick
    - Emits well-typed events: TICK, POSITION_OPENED, TRADE_CLOSED
    - Returns a summary dict with all key performance metrics
    - Zero business logic in the HTTP handler (paper_routes.run_replay is a
      3-line call)

Usage:
    result = ReplayEngine.run(
        symbol="RELIANCE",
        strategy_id="3",
        timeframe="15m",
        from_date="2024-01-01",
        to_date="2024-06-30",
        sl_pct=1.5,
        tp_pct=3.0,
        capital_pct=10.0,
        virtual_capital=100_000.0,
    )
    # result = {"events": [...], "summary": {...}}
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Event type constants — single source of truth, matches frontend enum
# ---------------------------------------------------------------------------
_EVT_TICK           = "TICK"
_EVT_POS_OPENED     = "POSITION_OPENED"
_EVT_TRADE_CLOSED   = "TRADE_CLOSED"

# Exit reason codes
_REASON_SIGNAL  = "SIGNAL"
_REASON_SL      = "SL"
_REASON_TP      = "TP"
_REASON_EOD     = "END_OF_DATA"   # force-close open position at last bar


class ReplayEngine:
    """Bar-by-bar historical replay simulation.

    All methods are static — no instance state is needed.

    The engine pre-computes strategy signals over the entire DataFrame (O(n))
    and then walks bar by bar emitting events.  SL/TP checks are evaluated
    using the *current bar's close price* before signal inspection, matching
    the conservative approach used by most retail paper-trading simulators.

    SL/TP direction logic:
        LONG  : SL fires when close <= entry * (1 − sl/100)
                TP fires when close >= entry * (1 + tp/100)
        SHORT : SL fires when close >= entry * (1 + sl/100)  ← price rises
                TP fires when close <= entry * (1 − tp/100)  ← price falls
    """

    @staticmethod
    def run(
        symbol: str,
        strategy_id: str,
        timeframe: str,
        from_date: str,
        to_date: str,
        sl_pct: Optional[float],
        tp_pct: Optional[float],
        capital_pct: float,
        virtual_capital: float,
        slippage: float = 0.05,
        commission: float = 20.0,
        tsl_pct: Optional[float] = None,
    ) -> dict:
        """Run a full historical replay and return events + summary.

        Args:
            symbol: NSE ticker (e.g. 'RELIANCE').
            strategy_id: Preset ID ('1'-'7') or saved-strategy UUID.
            timeframe: Candle interval string (e.g. '15m', '1d').
            from_date: Start date 'YYYY-MM-DD'.
            to_date: End date 'YYYY-MM-DD'.
            sl_pct: Stop-loss percentage (e.g. 1.5 = 1.5%). None = disabled.
            tp_pct: Take-profit percentage. None = disabled.
            capital_pct: Fraction of virtual_capital per trade (e.g. 10 = 10%).
            virtual_capital: Starting virtual cash in INR.
            slippage: Slippage percentage per trade (e.g., 0.05).
            commission: Flat commission fee per trade in INR.

        Returns:
            dict with keys:
                events (list[dict]): Bar-by-bar event stream.
                summary (dict): totalTrades, winTrades, lossTrades, winRate,
                                netPnl, netPnlPct, maxDrawdown, finalEquity.
        """
        df = ReplayEngine._load_data(symbol, timeframe, from_date, to_date)
        if df is None or df.empty:
            return {"events": [], "summary": ReplayEngine._empty_summary(virtual_capital)}

        entries, exits, sides, next_bar_entry, indicators = ReplayEngine._compute_signals(df, strategy_id)
        events, summary = ReplayEngine._simulate(
            df=df,
            symbol=symbol,
            entries=entries,
            exits=exits,
            sides=sides,
            indicators=indicators,
            sl_pct=sl_pct,
            tp_pct=tp_pct,
            capital_pct=capital_pct,
            virtual_capital=virtual_capital,
            next_bar_entry=next_bar_entry,
            slippage=slippage,
            commission=commission,
            tsl_pct=tsl_pct,
        )
        return {"events": events, "summary": summary}

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _load_data(
        symbol: str,
        timeframe: str,
        from_date: str,
        to_date: str,
    ) -> Optional[pd.DataFrame]:
        """Fetch OHLCV data via cache-first DataFetcher.

        Args:
            symbol: NSE ticker.
            timeframe: Candle interval (any recognised format).
            from_date: 'YYYY-MM-DD'.
            to_date: 'YYYY-MM-DD'.

        Returns:
            Cleaned DataFrame or None on error.
        """
        try:
            from services.data_fetcher import DataFetcher
            fetcher = DataFetcher()
            df = fetcher.fetch_historical_data(
                symbol=symbol,
                timeframe=timeframe,
                from_date=from_date,
                to_date=to_date,
            )
            if df is None or df.empty:
                logger.warning(f"ReplayEngine: no data for {symbol} / {timeframe} [{from_date}→{to_date}]")
                return None
            return df
        except Exception as exc:
            logger.error(f"ReplayEngine._load_data failed: {exc}", exc_info=True)
            return None

    @staticmethod
    def _compute_signals(
        df: pd.DataFrame,
        strategy_id: str,
    ) -> tuple[pd.Series, pd.Series, pd.Series | None, bool]:
        """Pre-compute entry/exit/side signals over the full DataFrame.

        Signals are computed once (O(n)) before the bar loop so the simulation
        is O(n) overall rather than O(n²).

        Args:
            df: Full OHLCV DataFrame.
            strategy_id: Preset ID or saved-strategy UUID.

        Returns:
            Tuple of (entries, exits, sides, next_bar_entry).
            sides may be None for strategies that only emit LONG signals.

        Raises:
            ValueError: If strategy_id cannot be resolved.
        """
        from strategies.presets import StrategyFactory
        from services.strategy_store import StrategyStore

        config: dict = {}
        if strategy_id not in ("1", "2", "3", "4", "5", "6", "7"):
            saved = StrategyStore.get_by_id(strategy_id)
            if saved:
                config = saved
                logger.info(f"ReplayEngine: loaded custom strategy '{saved.get('name')}'")

        strategy = StrategyFactory.get_strategy(strategy_id, config)
        result = strategy.generate_signals(df)

        next_bar_entry = bool(config.get("nextBarEntry", True))

        # generate_signals returns (entries, exits, warnings, indicators)
        entries = result[0] if len(result) >= 1 else pd.Series(False, index=df.index)
        exits   = result[1] if len(result) >= 2 else pd.Series(False, index=df.index)
        sides   = result[2] if len(result) >= 3 else None
        indicators = result[3] if len(result) >= 4 else {}

        return entries, exits, sides, next_bar_entry, indicators

    @staticmethod
    def _simulate(
        df: pd.DataFrame,
        symbol: str,
        entries: pd.Series,
        exits: pd.Series,
        sides: pd.Series | None,
        sl_pct: Optional[float],
        tp_pct: Optional[float],
        capital_pct: float,
        virtual_capital: float,
        next_bar_entry: bool,
        slippage: float,
        commission: float,
        indicators: dict[str, pd.Series] = None,
        tsl_pct: Optional[float] = None,
    ) -> tuple[list[dict], dict]:
        """Walk the DataFrame bar by bar and emit events.

        Args:
            df: Full OHLCV DataFrame.
            symbol: Ticker for event payloads.
            entries: Boolean entry signal Series.
            exits: Boolean exit signal Series.
            sides: Optional Series of 'LONG'/'SHORT' strings.
            sl_pct: Stop-loss percentage. None = disabled.
            tp_pct: Take-profit percentage. None = disabled.
            capital_pct: Capital per trade (%).
            virtual_capital: Starting equity in INR.
            next_bar_entry: True if shifted execution on bar Open.
            slippage: Slippage percentage per trade.
            commission: Flat commission fee in INR.

        Returns:
            Tuple of (events list, summary dict).
        """
        events: list[dict] = []
        open_pos: Optional[dict] = None

        equity = float(virtual_capital)
        peak_equity = equity

        total_trades = 0
        win_trades = 0
        cumulative_pnl = 0.0

        if indicators is None:
            indicators = {}
        max_drawdown = 0.0

        n = len(df)

        for bar_idx in range(n):
            row = df.iloc[bar_idx]
            ltp = float(row["close"])
            open_price = float(row["open"])
            high_price = float(row["high"])
            low_price = float(row["low"])
            
            # Update peak/trough for TSL
            if open_pos:
                if open_pos["side"] == "LONG":
                    open_pos["peak_price"] = max(open_pos.get("peak_price", open_pos["avg_price"]), high_price)
                else:
                    open_pos["peak_price"] = min(open_pos.get("peak_price", open_pos["avg_price"]), low_price)
            
            ts  = str(df.index[bar_idx])
            is_last_bar = (bar_idx == n - 1)

            # ----------------------------------------------------------
            # 1. Force-close at last bar if position is still open
            # ----------------------------------------------------------
            if is_last_bar and open_pos:
                closed_evt, open_pos, equity, pnl = ReplayEngine._close_position(
                    open_pos, ltp, ts, _REASON_EOD, commission
                )
                cumulative_pnl += pnl
                if pnl > 0:
                    win_trades += 1
                total_trades += 1
                peak_equity = max(peak_equity, equity + cumulative_pnl)
                drawdown = (peak_equity - (equity + cumulative_pnl)) / peak_equity * 100
                max_drawdown = max(max_drawdown, drawdown)
                events.append(closed_evt)
                events.append({"type": _EVT_TICK, "timestamp": ts, "ltp": ltp,
                                "equity": round(virtual_capital + cumulative_pnl, 2)})
                continue

            # ----------------------------------------------------------
            # 2. SL / TP check (before signal, conservative)
            # ----------------------------------------------------------
            if open_pos:
                sl_triggered = tp_triggered = False
                side = open_pos["side"]
                exec_price = ltp

                # Resolve active SL criteria based on static or trailing inputs
                active_sl_price = None
                if tsl_pct:
                    if side == "LONG":
                        active_sl_price = open_pos["peak_price"] * (1 - tsl_pct / 100)
                    else:
                        active_sl_price = open_pos["peak_price"] * (1 + tsl_pct / 100)
                elif sl_pct:
                    if side == "LONG":
                        active_sl_price = open_pos["avg_price"] * (1 - sl_pct / 100)
                    else:
                        active_sl_price = open_pos["avg_price"] * (1 + sl_pct / 100)

                if active_sl_price:
                    if side == "LONG" and low_price <= active_sl_price:
                        sl_triggered = True
                        exec_price = active_sl_price
                    elif side == "SHORT" and high_price >= active_sl_price:
                        sl_triggered = True
                        exec_price = active_sl_price

                if tp_pct and not sl_triggered:
                    if side == "LONG" and high_price >= open_pos["avg_price"] * (1 + tp_pct / 100):
                        tp_triggered = True
                        exec_price = open_pos["avg_price"] * (1 + tp_pct / 100)
                    elif side == "SHORT" and low_price <= open_pos["avg_price"] * (1 - tp_pct / 100):
                        tp_triggered = True
                        exec_price = open_pos["avg_price"] * (1 - tp_pct / 100)

                if sl_triggered or tp_triggered:
                    reason = _REASON_SL if sl_triggered else _REASON_TP
                    
                    # Apply slippage on the SL/TP execution price
                    sl_adj_exec = exec_price * (1 - slippage/100) if side == "LONG" else exec_price * (1 + slippage/100)
                    
                    closed_evt, open_pos, equity, pnl = ReplayEngine._close_position(
                        open_pos, sl_adj_exec, ts, reason, commission
                    )
                    cumulative_pnl += pnl
                    if pnl > 0:
                        win_trades += 1
                    total_trades += 1
                    peak_equity = max(peak_equity, equity + cumulative_pnl)
                    drawdown = (peak_equity - (equity + cumulative_pnl)) / peak_equity * 100
                    max_drawdown = max(max_drawdown, drawdown)
                    events.append(closed_evt)
                    # Emit TICK for this bar and move to next
                    events.append({"type": _EVT_TICK, "timestamp": ts, "ltp": ltp,
                                   "equity": round(virtual_capital + cumulative_pnl, 2)})
                    continue

            # ----------------------------------------------------------
            # 3. Exit signal — close existing position
            # ----------------------------------------------------------
            entry_sig = bool(entries.iloc[bar_idx]) if bar_idx < len(entries) else False
            exit_sig  = bool(exits.iloc[bar_idx])   if bar_idx < len(exits)   else False

            entry_exec_price = open_price if next_bar_entry else ltp
            exit_exec_price  = open_price if next_bar_entry else ltp

            if exit_sig and open_pos:
                side = open_pos["side"]
                sl_adj_exit = exit_exec_price * (1 - slippage/100) if side == "LONG" else exit_exec_price * (1 + slippage/100)
                closed_evt, open_pos, equity, pnl = ReplayEngine._close_position(
                    open_pos, sl_adj_exit, ts, _REASON_SIGNAL, commission
                )
                cumulative_pnl += pnl
                if pnl > 0:
                    win_trades += 1
                total_trades += 1
                peak_equity = max(peak_equity, equity + cumulative_pnl)
                drawdown = (peak_equity - (equity + cumulative_pnl)) / peak_equity * 100
                max_drawdown = max(max_drawdown, drawdown)
                events.append(closed_evt)

            # ----------------------------------------------------------
            # 4. Entry signal — open new position (only if flat)
            # ----------------------------------------------------------
            # Re-check open_pos as it might have just closed via exit_sig (Stop-and-Reverse fix)
            if entry_sig and not open_pos:
                
                # The indicators payload is unshifted, so if we execute on Next Bar Open, the math occurred 1 tick prior.
                signal_idx = bar_idx - 1 if next_bar_entry and bar_idx > 0 else bar_idx
                current_indicators = {}
                for k, v in indicators.items():
                    if isinstance(v, pd.Series):
                        try:
                            val = float(v.iloc[signal_idx])
                            if not np.isnan(val) and not np.isinf(val):
                                current_indicators[k] = round(val, 2)
                        except Exception:
                            pass

                side = "LONG"
                if sides is not None and bar_idx < len(sides):
                    raw_side = sides.iloc[bar_idx]
                    if isinstance(raw_side, str) and raw_side.upper() == "SHORT":
                        side = "SHORT"

                # Apply slippage on entry
                sl_adj_entry = entry_exec_price * (1 + slippage/100) if side == "LONG" else entry_exec_price * (1 - slippage/100)

                qty = max(1, int((virtual_capital * (capital_pct / 100.0)) / sl_adj_entry)) if sl_adj_entry > 0 else 1
                open_pos = {
                    "id":         str(uuid.uuid4())[:8],
                    "symbol":     symbol,
                    "side":       side,
                    "qty":        qty,
                    "avg_price":  sl_adj_entry,
                    "peak_price": sl_adj_entry,
                    "entry_time": ts,
                    "indicators": current_indicators,
                }
                events.append({
                    "type":      _EVT_POS_OPENED,
                    "timestamp": ts,
                    "ltp":       ltp,
                    "equity":    round(virtual_capital + cumulative_pnl, 2),
                    "position":  dict(open_pos),
                })

            # ----------------------------------------------------------
            # 5. TICK — always emit (for chart animation)
            # ----------------------------------------------------------
            events.append({
                "type":      _EVT_TICK,
                "timestamp": ts,
                "ltp":       ltp,
                "equity":    round(virtual_capital + cumulative_pnl, 2),
            })

        # Build summary
        loss_trades = total_trades - win_trades
        win_rate = (win_trades / total_trades * 100) if total_trades > 0 else 0.0
        final_equity = round(virtual_capital + cumulative_pnl, 2)
        net_pnl_pct  = round(cumulative_pnl / virtual_capital * 100, 2) if virtual_capital > 0 else 0.0

        summary = {
            "totalTrades":  total_trades,
            "winTrades":    win_trades,
            "lossTrades":   loss_trades,
            "winRate":      round(win_rate, 2),
            "netPnl":       round(cumulative_pnl, 2),
            "netPnlPct":    net_pnl_pct,
            "maxDrawdown":  round(max_drawdown, 2),
            "finalEquity":  final_equity,
            "startingEquity": round(virtual_capital, 2),
        }

        logger.info(
            f"ReplayEngine: {symbol} {n} bars → "
            f"{total_trades} trades | winRate={win_rate:.1f}% | netPnl={cumulative_pnl:.2f}"
        )
        return events, summary

    @staticmethod
    def _close_position(
        open_pos: dict,
        exit_price: float,
        timestamp: str,
        reason: str,
        commission: float,
    ) -> tuple[dict, None, float, float]:
        """Compute PnL and build a TRADE_CLOSED event.

        PnL direction:
            LONG  : (exit − entry) × qty
            SHORT : (entry − exit) × qty   ← profit when price falls

        Args:
            open_pos: Current open position dict.
            exit_price: Closing price (close of exit bar).
            timestamp: ISO-8601 string of exit bar.
            reason: Exit reason code ('SIGNAL', 'SL', 'TP', 'END_OF_DATA').
            commission: Fixed commission deducted from PnL logic.

        Returns:
            Tuple of (event_dict, None, unused_equity, pnl).
        """
        side      = open_pos["side"]
        avg_entry = open_pos["avg_price"]
        qty       = open_pos["qty"]

        if side == "LONG":
            pnl     = (exit_price - avg_entry) * qty
        else:  # SHORT
            pnl     = (avg_entry - exit_price) * qty
            
        # Realistic friction implementation: deduct flat commission
        pnl -= commission

        entry_val = avg_entry * qty
        pnl_pct = (pnl / entry_val) * 100 if entry_val > 0 else 0.0

        event = {
            "type":      _EVT_TRADE_CLOSED,
            "timestamp": timestamp,
            "ltp":       exit_price,
            "trade": {
                **open_pos,
                "entry_price": avg_entry,
                "exit_price":  round(exit_price, 2),
                "exit_time":   timestamp,
                "exit_reason": reason,
                "pnl":         round(pnl, 2),
                "pnl_pct":     round(pnl_pct, 2),
            },
        }
        return event, None, 0.0, pnl  # return None for open_pos (position closed)

    @staticmethod
    def _empty_summary(virtual_capital: float) -> dict:
        """Return a zeroed summary when no data is available."""
        return {
            "totalTrades":    0,
            "winTrades":      0,
            "lossTrades":     0,
            "winRate":        0.0,
            "netPnl":         0.0,
            "netPnlPct":      0.0,
            "maxDrawdown":    0.0,
            "finalEquity":    round(virtual_capital, 2),
            "startingEquity": round(virtual_capital, 2),
        }
