"""services/ltp_service.py — Live price updates for open positions.

Polls the Dhan market quote endpoint to update LTP, P&L, and check
stop-loss / take-profit triggers for all open positions.
"""
from __future__ import annotations

from logging import getLogger

logger = getLogger(__name__)


def get_ltp(symbol: str) -> float | None:
    """Fetch the last traded price for a symbol from Dhan market quote API.

    Args:
        symbol: NSE ticker or index symbol (e.g. 'RELIANCE', 'NIFTY 50').

    Returns:
        Last traded price as float, or None if the call fails.
    """
    try:
        from services.dhan_fetcher import DhanDataFetcher
        fetcher = DhanDataFetcher()
        security_id = fetcher.symbol_to_security_id(symbol)
        if not security_id:
            logger.warning(f"Security ID not found for symbol: {symbol}")
            return None

        quote = fetcher.get_market_quote(security_id)
        ltp = quote.get("last_price") or quote.get("ltp")
        if ltp is None:
            logger.warning(f"LTP missing in quote response for {symbol}: {quote}")
        return float(ltp) if ltp is not None else None
    except Exception as exc:
        logger.error(f"LTP fetch failed for {symbol}: {exc}", exc_info=True)
        return None


def _calc_pnl(side: str, avg_price: float, ltp: float, qty: int) -> tuple[float, float]:
    """Calculate absolute and percentage P&L.

    Args:
        side: 'LONG' or 'SHORT'.
        avg_price: Entry price.
        ltp: Current last traded price.
        qty: Number of units.

    Returns:
        Tuple of (pnl_abs, pnl_pct).
    """
    multiplier = 1.0 if side == "LONG" else -1.0
    pnl_abs = multiplier * (ltp - avg_price) * qty
    pnl_pct = (pnl_abs / (avg_price * qty)) * 100
    return round(pnl_abs, 2), round(pnl_pct, 4)


def _is_sl_hit(side: str, ltp: float, sl_price: float | None) -> bool:
    """Check if stop-loss price has been breached.

    Args:
        side: 'LONG' or 'SHORT'.
        ltp: Current last traded price.
        sl_price: Stop-loss price, or None if not set.

    Returns:
        True if SL is triggered.
    """
    if sl_price is None:
        return False
    if side == "LONG":
        return ltp <= sl_price
    return ltp >= sl_price  # SHORT


def _is_tp_hit(side: str, ltp: float, tp_price: float | None) -> bool:
    """Check if take-profit price has been reached.

    Args:
        side: 'LONG' or 'SHORT'.
        ltp: Current last traded price.
        tp_price: Take-profit price, or None if not set.

    Returns:
        True if TP is triggered.
    """
    if tp_price is None:
        return False
    if side == "LONG":
        return ltp >= tp_price
    return ltp <= tp_price  # SHORT


def refresh_all_positions() -> list[dict]:
    """Update LTP and P&L for every open position. Close on SL/TP breach.

    Fetches live LTP for each unique symbol in parallel, applies zero-trust
    anomalous tick validation, updates the database, and automatically closes
    positions where SL or TP has been triggered.

    Returns:
        Updated list of all open positions after refresh.
    """
    from services import paper_store
    from concurrent.futures import ThreadPoolExecutor

    positions = paper_store.get_positions()
    if not positions:
        return []

    # Deduplicate LTP calls — fetch each symbol once
    unique_symbols = {p["symbol"] for p in positions}
    ltp_map: dict[str, float] = {}
    
    # Phase 3 Fix: Execute in parallel to avoid single-thread I/O blocking
    with ThreadPoolExecutor(max_workers=min(10, len(unique_symbols))) as executor:
        future_to_sym = {executor.submit(get_ltp, sym): sym for sym in unique_symbols}
        for future in future_to_sym:
            sym = future_to_sym[future]
            try:
                price = future.result()
                # ZTS check: Must be positive number
                if price is not None and price > 0:
                    ltp_map[sym] = price
                elif price is not None and price <= 0:
                    logger.critical(f"ZTS Block: Received negative/zero price for {sym}: {price}")
            except Exception as e:
                logger.error(f"Parallel LTP fetch failed for {sym}: {e}", exc_info=True)

    for pos in positions:
        ltp = ltp_map.get(pos["symbol"])
        if ltp is None:
            logger.debug(f"Skipping LTP update for {pos['symbol']} — no price available")
            continue

        # ZTS check: Reject anomalous instantaneous jumps >15%
        recorded_ltp = pos.get("ltp")
        reference_price = recorded_ltp if recorded_ltp and recorded_ltp > 0 else pos["avg_price"]
        jump_pct = abs((ltp - reference_price) / reference_price) * 100
        if jump_pct > 15.0:
            logger.warning(f"ZTS Block: Rejecting anomalous tick {pos['symbol']} @ ₹{ltp:.2f} (Implies {jump_pct:.1f}% jump)")
            continue

        pnl_abs, pnl_pct = _calc_pnl(pos["side"], pos["avg_price"], ltp, pos["qty"])
        
        # Check SL / TP
        sl_price = pos.get("sl_price")
        tp_price = pos.get("tp_price")
        
        indicators = pos.get("indicators", {}) or {}
        tsl_pct = indicators.get("tsl_pct")
        
        # Trailing Stop Loss execution modifier
        if tsl_pct:
            peak = indicators.get("peak_price", pos["avg_price"])
            if pos["side"] == "LONG" and ltp > peak:
                indicators["peak_price"] = ltp
                new_sl = round(ltp * (1 - tsl_pct / 100), 2)
                if sl_price is None or new_sl > sl_price:
                    sl_price = new_sl
            elif pos["side"] == "SHORT" and ltp < peak:
                indicators["peak_price"] = ltp
                new_sl = round(ltp * (1 + tsl_pct / 100), 2)
                if sl_price is None or new_sl < sl_price:
                    sl_price = new_sl

        paper_store.update_position_ltp(pos["id"], ltp, pnl_abs, pnl_pct, indicators)

        slippage_pct = float(paper_store.get_setting("slippage", "0.0"))
        commission   = float(paper_store.get_setting("commission", "20.0"))

        if _is_sl_hit(pos["side"], ltp, sl_price):
            # Apply exit slippage: LONG exits at a worse (lower) price
            exit_price = round(ltp * (1 - slippage_pct / 100), 2)
            logger.info(f"Stop-loss hit for {pos['symbol']} @ ₹{ltp:.2f} (SL=₹{sl_price}, slipped exit ₹{exit_price:.2f})")
            paper_store.close_position(pos["id"], exit_price, exit_reason="SL", commission=commission)

        elif _is_tp_hit(pos["side"], ltp, tp_price):
            exit_price = round(ltp * (1 - slippage_pct / 100), 2)
            logger.info(f"Take-profit hit for {pos['symbol']} @ ₹{ltp:.2f} (TP=₹{tp_price}, slipped exit ₹{exit_price:.2f})")
            paper_store.close_position(pos["id"], exit_price, exit_reason="TP", commission=commission)

    return paper_store.get_positions()
