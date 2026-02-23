# Strategy Developer Guide

This guide explains everything a new developer needs to know to:
1. Add a new trading strategy to the system
2. Understand how all risk / execution parameters work (SL, TP, TSL, slippage, commission, pyramiding, position sizing)

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Adding a New Strategy — Minimum Required Changes](#2-adding-a-new-strategy--minimum-required-changes)
3. [Step 1: Write the Signal Logic (strategies.py)](#3-step-1-write-the-signal-logic-strategiespy)
4. [Step 2: Register Metadata (strategy_routes.py)](#4-step-2-register-metadata-strategy_routespy)
5. [Signal Modes: VISUAL vs CODE](#5-signal-modes-visual-vs-code)
6. [Available Indicators](#6-available-indicators)
7. [Operators Reference](#7-operators-reference)
8. [nextBarEntry — Realistic Fill Timing](#8-nextbarentry--realistic-fill-timing)
9. [Risk Parameters: SL / TP / TSL](#9-risk-parameters-sl--tp--tsl)
10. [Position Sizing Modes](#10-position-sizing-modes)
11. [Slippage and Commission](#11-slippage-and-commission)
12. [Pyramiding (Multiple Entries)](#12-pyramiding-multiple-entries)
13. [All Config Keys — Quick Reference](#13-all-config-keys--quick-reference)
14. [Complete Worked Example: Bollinger Bands](#14-complete-worked-example-bollinger-bands)
15. [What You Get for Free (Zero Extra Code)](#15-what-you-get-for-free-zero-extra-code)

---

## 1. System Architecture Overview

```
User selects strategy + params
        │
        ▼
BacktestEngine.run()              ← orchestrates everything
        │
        ├─ StrategyFactory.get_strategy(id, config)
        │         │
        │         └─ DynamicStrategy.generate_signals(df)
        │                   → returns (entries, exits) boolean Series
        │
        ├─ portfolio_utils.build_portfolio(close, entries, exits, config)
        │         │
        │         └─ vbt.Portfolio.from_signals(...)
        │               with SL / TP / TSL / slippage / commission / sizing
        │
        └─ _extract_results(pf)   → metrics, equity curve, trades, stats
```

**Three engines share the same `build_portfolio` call:**

| Engine | File | Purpose |
|---|---|---|
| BacktestEngine | `services/backtest_engine.py` | Single backtest run |
| GridEngine | `services/grid_engine.py` | Optuna Phase 1 + Phase 2 optimization |
| WFOEngine | `services/wfo_engine.py` | Rolling walk-forward optimization |

Because they all call `portfolio_utils.build_portfolio()`, any fix to portfolio construction is automatically reflected everywhere.

---

## 2. Adding a New Strategy — Minimum Required Changes

**Backend: 2 files to edit, ~15–30 lines total.**
**Frontend: 0 changes needed.** The UI auto-adapts to whatever `params` you register.

| File | What to add |
|---|---|
| `backend/strategies.py` | One `if strategy_id == "N":` block with signal logic |
| `backend/routes/strategy_routes.py` | One dict with name, description, and params list |

---

## 3. Step 1: Write the Signal Logic (`strategies.py`)

Open `backend/strategies.py` and add a block inside `StrategyFactory.get_strategy()`.

Choose **CODE mode** (recommended — full Python flexibility) or **VISUAL mode** (rule builder JSON, no Python).

### CODE Mode Template

```python
if strategy_id == "8":
    period = int(config.get("period", 20))
    std_dev = float(config.get("std_dev", 2.0))
    return DynamicStrategy({
        "nextBarEntry": True,
        "mode": "CODE",
        "pythonCode": f"""
def signal_logic(df):
    close = df['Close']
    bb = vbt.BBANDS.run(close, window={period}, alpha={std_dev})
    entries = close.vbt.crossed_below(bb.lower)
    exits = close.vbt.crossed_above(bb.upper)
    return entries, exits
"""
    })
```

**Rules for `signal_logic(df)`:**
- The function receives a pandas DataFrame `df` with columns: `Open`, `High`, `Low`, `Close`, `Volume`
- It must return a tuple: `(entries, exits)` — both boolean `pd.Series` aligned to `df.index`
- Use `crossed_above` / `crossed_below` (not `>` / `<`) for single-bar trigger signals
- Available in scope: `vbt`, `pd`, `np`, `ta`, `df`

### VISUAL Mode Template

```python
if strategy_id == "9":
    return DynamicStrategy({
        "nextBarEntry": True,
        "entryLogic": {
            "type": "GROUP",
            "logic": "AND",
            "conditions": [
                {
                    "indicator": "RSI",
                    "period": config.get("period", 14),
                    "operator": "Crosses Below",
                    "compareType": "STATIC",
                    "value": config.get("lower", 30),
                }
            ],
        },
        "exitLogic": {
            "type": "GROUP",
            "logic": "AND",
            "conditions": [
                {
                    "indicator": "RSI",
                    "period": config.get("period", 14),
                    "operator": "Crosses Above",
                    "compareType": "STATIC",
                    "value": config.get("upper", 70),
                }
            ],
        }
    })
```

---

## 4. Step 2: Register Metadata (`strategy_routes.py`)

Open `backend/routes/strategy_routes.py` and add one dict to the `strategies` list:

```python
{
    "id": "8",                                    # must match strategy_id in strategies.py
    "name": "Bollinger Bands Breakout",
    "description": "Buy below lower band, sell above upper band.",
    "params": [
        {
            "name": "period",                     # key used in config.get("period")
            "label": "BB Length",                 # displayed in the UI
            "min": 10,
            "max": 50,
            "default": 20
        },
        {
            "name": "std_dev",
            "label": "StdDev Multiplier",
            "min": 1.0,
            "max": 3.0,
            "default": 2.0,
            "step": 0.1                           # optional; defaults to 1
        }
    ]
}
```

**That's it.** The frontend automatically:
- Shows this strategy in the dropdown
- Renders input fields for each param with the specified `min`/`max`/`default`
- Passes param values as `config = {"period": <user_value>, "std_dev": <user_value>}`
- Includes this strategy in the Optimization page param ranges

---

## 5. Signal Modes: VISUAL vs CODE

### VISUAL Mode
- Uses a JSON rule tree with `entryLogic` / `exitLogic`
- Groups can be nested with `AND` / `OR` logic
- Each condition compares an indicator to a static value or another indicator
- Evaluated by `DynamicStrategy._evaluate_node()` → `_evaluate_condition()`

```python
{
    "type": "GROUP",
    "logic": "AND",         # "AND" or "OR"
    "conditions": [
        {
            "indicator": "RSI",
            "period": 14,
            "operator": "Crosses Below",   # see Operators Reference
            "compareType": "STATIC",       # "STATIC" = compare to a number
            "value": 30,
        },
        {
            "indicator": "Close Price",
            "operator": ">",
            "compareType": "INDICATOR",    # "INDICATOR" = compare to another series
            "rightIndicator": "SMA",
            "rightPeriod": 200,
        }
    ]
}
```

**Nested OR/AND example:**
```python
{
    "type": "GROUP",
    "logic": "OR",
    "conditions": [
        { "type": "GROUP", "logic": "AND", "conditions": [...] },
        { "type": "GROUP", "logic": "AND", "conditions": [...] },
    ]
}
```

### CODE Mode
- Full Python with `vbt`, `pd`, `np`, `ta` available
- Must define `signal_logic(df)` that returns `(entries, exits)`
- Runs in a restricted sandbox (see Security section)
- **Recommended** for any non-trivial indicator logic

### Security Sandbox (CODE Mode)
The sandbox blocks common Python escape attacks:
- Blocked attributes: `__class__`, `__bases__`, `__subclasses__`, `__globals__`, `eval`, `exec`, `open`, etc.
- AST scan runs before execution — any blocked attribute access aborts with an error
- Available builtins: `abs`, `max`, `min`, `len`, `range`, `round`, `int`, `float`, `bool`, `str`, `list`, `dict`, `set`
- **NOT available:** `print`, `open`, `__import__`

---

## 6. Available Indicators

### In VISUAL Mode (`indicator` key)

| Indicator Name | Description | Uses `period` |
|---|---|---|
| `RSI` | Relative Strength Index | ✅ |
| `SMA` | Simple Moving Average | ✅ |
| `EMA` | Exponential Moving Average | ✅ |
| `MACD` | MACD line | ❌ (fixed 12/26/9) |
| `MACD Signal` | MACD signal line | ❌ (fixed 12/26/9) |
| `Bollinger Upper` | Upper Bollinger Band | ✅ |
| `Bollinger Lower` | Lower Bollinger Band | ✅ |
| `Bollinger Mid` | Middle Bollinger Band | ✅ |
| `ATR` | Average True Range | ✅ |
| `Close Price` | Raw close price | ❌ |
| `Open Price` | Raw open price | ❌ |
| `High Price` | Raw high price | ❌ |
| `Low Price` | Raw low price | ❌ |
| `Volume` | Trading volume | ❌ |

### In CODE Mode

You have full access to:
- `vbt` — VectorBT (RSI, MACD, BBANDS, ATR, MA, etc.)
- `ta` — pandas-ta (200+ indicators)
- `pd`, `np` — standard pandas/numpy

**Examples:**
```python
# RSI
rsi = vbt.RSI.run(df['Close'], window=14).rsi

# Bollinger Bands
bb = vbt.BBANDS.run(df['Close'], window=20, alpha=2.0)
upper, middle, lower = bb.upper, bb.middle, bb.lower

# EMA
ema = vbt.MA.run(df['Close'], 50, ewm=True).ma

# MACD
macd = vbt.MACD.run(df['Close'], fast_window=12, slow_window=26, signal_window=9)
macd_line = macd.macd
signal_line = macd.signal

# ATR
atr = vbt.ATR.run(df['High'], df['Low'], df['Close'], window=14).atr

# Stochastic (via ta library)
stoch_k = ta.momentum.stoch(df['High'], df['Low'], df['Close'], window=14, smooth_window=3)

# SuperTrend (manual, see strategy 5 for example)
```

### Multi-Timeframe (MTF) in VISUAL Mode

Add `"timeframe": "1h"` to any condition to resample the indicator to a higher timeframe:

```python
{
    "indicator": "RSI",
    "period": 14,
    "operator": "Crosses Below",
    "compareType": "STATIC",
    "value": 30,
    "timeframe": "1h"       # compute RSI on hourly bars, reindex to base TF
}
```

Supported values: `"1m"`, `"5m"`, `"15m"`, `"1h"`, `"1d"`

---

## 7. Operators Reference

| Operator | Behavior | When to use |
|---|---|---|
| `"Crosses Above"` | True **once** on the bar where left crosses above right | Crossover entries/exits — generates one signal per event |
| `"Crosses Below"` | True **once** on the bar where left crosses below right | Crossover entries/exits — generates one signal per event |
| `">"` | True on **every bar** where left > right | Level filters, sustained conditions |
| `"<"` | True on **every bar** where left < right | Level filters, sustained conditions |
| `"="` | True on **every bar** where left == right | Rare; avoid for floats |

> **Why `Crosses Below` beats `<` for RSI entries:**
>
> If you use `RSI < 30`, VectorBT sees a new entry signal on *every* bar where RSI stays below 30.
> With pyramiding OFF, it only takes the first one — but it still generates noisy signals.
> `Crosses Below` fires **exactly once** per oversold event (the moment RSI drops through 30),
> which is cleaner and matches how manual traders think about it.

**In CODE mode, always prefer:**
```python
entries = rsi.vbt.crossed_below(30)   # ✅ fires once
exits   = rsi.vbt.crossed_above(70)   # ✅ fires once

# instead of:
entries = rsi < 30    # ❌ fires on every bar RSI stays below 30
exits   = rsi > 70    # ❌ fires on every bar RSI stays above 70
```

---

## 8. `nextBarEntry` — Realistic Fill Timing

When `"nextBarEntry": True` is set in a strategy config, all signals are shifted forward by one bar:

```python
entries = entries.shift(1).fillna(False)
exits   = exits.shift(1).fillna(False)
```

**What this means:** If a signal fires at bar N (e.g. RSI crosses below 30 at the close of Monday), the position is entered at bar N+1 (Tuesday's open). This is **realistic** — you can't fill at the exact closing price that generated the signal; you execute at the *next* candle's open.

**All 7 preset strategies use `nextBarEntry: True` except Strategy 7 (ATR Channel Breakout)**, which embeds the shift directly in its signal logic (`df['High'].shift(1)`).

**Custom strategies** should use `"nextBarEntry": True` unless you have a specific reason not to (e.g. intraday strategies where same-bar execution is realistic).

---

## 9. Risk Parameters: SL / TP / TSL

All three are configured by the user on the Backtest page and passed through `config`. They are processed in `portfolio_utils.build_portfolio()`.

### Stop Loss (SL)

```python
# Config key: "stopLossPct"  (default: 0 = disabled)
# Value: percentage of entry price (e.g. 2.0 = 2%)

config["stopLossPct"] = 2.0
```

How it works:
- Converts to decimal: `sl_pct = 2.0 / 100.0 = 0.02`
- Passed to VectorBT as `sl_stop=0.02`
- VectorBT closes the position if price drops `2%` below the entry price
- If `df` has `High`/`Low`/`Open` columns, VectorBT checks **intra-bar** (not just at bar close), giving more accurate fill prices

### Take Profit (TP)

```python
# Config key: "takeProfitPct"  (default: 0 = disabled)
# Value: percentage above entry price (e.g. 5.0 = 5%)

config["takeProfitPct"] = 5.0
```

How it works:
- Converts to decimal: `tp_pct = 5.0 / 100.0 = 0.05`
- Passed to VectorBT as `tp_stop=0.05`
- Position closes when price rises `5%` above entry

### Trailing Stop Loss (TSL)

```python
# Config key: "trailingStopPct"  (default: 0 = disabled)
# Value: trailing distance in % (e.g. 1.5 = 1.5%)

config["trailingStopPct"] = 1.5
```

How it works:
- Converts to decimal: `tsl_pct = 1.5 / 100.0 = 0.015`
- Passed to VectorBT as `sl_stop=0.015, sl_trail=True`
- The stop level **follows** price upward but never moves down
- E.g. if entry was ₹100 with 1.5% TSL: stop starts at ₹98.50. If price rises to ₹110, stop moves to ₹108.35. If price falls to ₹108, position closes.

### Precedence Rules

```
trailingStopPct > 0  →  TSL mode (overrides fixed SL even if stopLossPct is also set)
stopLossPct > 0      →  Fixed SL (with optional useTrailingStop: true for legacy trailing)
takeProfitPct > 0    →  TP active simultaneously with whichever SL is set
All three = 0        →  No stops; exits driven by signal only
```

**Code in `portfolio_utils.py`:**
```python
if sl_pct > 0:
    pf_kwargs["sl_stop"] = sl_pct

if tp_pct > 0:
    pf_kwargs["tp_stop"] = tp_pct

# TSL takes precedence: overwrites sl_stop and enables trailing flag
if tsl_pct > 0:
    pf_kwargs["sl_stop"] = tsl_pct
    pf_kwargs["sl_trail"] = True
elif sl_pct > 0 and bool(config.get("useTrailingStop", False)):
    pf_kwargs["sl_trail"] = True   # legacy: treat fixed SL as trailing
```

### Intra-bar SL/TP Accuracy

When any stop is active and `df` contains `Open`, `High`, `Low` columns, they are forwarded to VectorBT:

```python
if df is not None and (sl_pct > 0 or tp_pct > 0 or tsl_pct > 0):
    for col, kwarg in [("Open", "open"), ("High", "high"), ("Low", "low")]:
        if col in df.columns:
            pf_kwargs[kwarg] = df[col].reindex(close.index)
```

This allows VectorBT to detect SL/TP triggers that happen **within a bar** (e.g. if the bar's low touches your stop level), not just at bar close. This matches the reference Python backtest script behavior.

---

## 10. Position Sizing Modes

Controlled by `config["positionSizing"]`. Three modes:

### "Fixed Capital" (default)

```python
config["positionSizing"]  = "Fixed Capital"
config["positionSizeValue"] = 100000   # ₹1,00,000 per trade
```

Behavior:
- Deploys exactly `positionSizeValue` rupees per trade
- **No compounding** — each trade always uses the same fixed amount
- Example: 10 winning trades of ₹1L each → still deploys ₹1L on trade 11
- Maps to VectorBT: `size=100000, size_type="value"`

Use when: You want consistent, repeatable trade sizes regardless of account growth.

### "% of Equity"

```python
config["positionSizing"]  = "% of Equity"
config["positionSizeValue"] = 20   # deploy 20% of current equity per trade
```

Behavior:
- Deploys `positionSizeValue / 100` of the current portfolio value
- **Compounds** — trade sizes grow as the account grows (and shrink on drawdowns)
- Example: ₹1L account, 20% → deploys ₹20,000. After equity grows to ₹1.5L → deploys ₹30,000.
- Maps to VectorBT: `size=0.20, size_type="percent"`

Use when: You want risk-proportional sizing that naturally scales with performance.

### "Full Equity" (or any other value)

```python
config["positionSizing"] = "Full Equity"
```

Behavior:
- Deploys all available cash on every entry
- Maps to VectorBT: `size=np.inf, size_type="amount"`

Use when: Testing buy-and-hold-style strategies. Not recommended for multi-trade strategies.

---

## 11. Slippage and Commission

### Slippage

```python
config["slippage"] = 0.05   # 0.05% slippage per trade
```

- Stored as percentage, converted to decimal: `bt_slippage = 0.05 / 100.0 = 0.0005`
- Applied by VectorBT to the fill price on every order (both entry and exit)
- Default: `0.0` (no slippage)

### Commission

```python
config["commission"] = 20.0   # ₹20 flat fee per order
```

- **Flat amount per trade**, not percentage
- Applied as `fixed_fees=20.0` in VectorBT, which deducts exactly ₹20 per order
- Percentage fee is disabled (`fees=0.0`) — the system uses flat fees only
- Default: `₹20` (matching typical Indian broker fees like Zerodha)

**Why flat fee, not percentage?**
Indian discount brokers (Zerodha, Upstox, etc.) charge a flat ₹20 per executed order regardless of trade size. Using percentage-based commission would overstate costs for large trades and understate for small trades.

---

## 12. Pyramiding (Multiple Entries)

```python
config["pyramiding"] = 1    # default: no pyramiding
config["pyramiding"] = 3    # allow up to 3 concurrent entries
```

- Controls how many times VectorBT can enter the same position without exiting first
- `pyramiding = 1` → standard behavior: skip new entry signals when already in a position
- `pyramiding = 3` → allows adding to a winning/losing position up to 3 times
- Maps to VectorBT: `accumulate = (pyramiding > 1)`

**Important:** VectorBT's `accumulate=True` allows unlimited adds. The system uses it as a boolean toggle based on whether `pyramiding > 1`.

Use pyramiding when: Your strategy explicitly builds positions in tranches (e.g. DCA-style entries or scaling into a trending position).

---

## 13. All Config Keys — Quick Reference

These are the keys the backend reads from `config` in `portfolio_utils.build_portfolio()` and `backtest_engine.py`:

| Key | Type | Default | Description |
|---|---|---|---|
| `initial_capital` | float | `100000.0` | Starting portfolio value (₹) |
| `commission` | float | `20.0` | Flat fee per order (₹) |
| `slippage` | float | `0.0` | Slippage % per trade (0.05 = 0.05%) |
| `positionSizing` | string | `"Fixed Capital"` | `"Fixed Capital"`, `"% of Equity"`, or `"Full Equity"` |
| `positionSizeValue` | float | `= initial_capital` | Amount (₹) or percentage, depending on sizing mode |
| `stopLossPct` | float | `0` | Fixed SL distance as % of entry price (0 = disabled) |
| `takeProfitPct` | float | `0` | TP distance as % of entry price (0 = disabled) |
| `trailingStopPct` | float | `0` | TSL trailing distance as % (0 = disabled; overrides SL) |
| `useTrailingStop` | bool | `false` | Legacy: make the fixed SL trailing (only used if TSL = 0) |
| `pyramiding` | int | `1` | Max concurrent entries (1 = no pyramiding) |

**Strategy-specific params** (e.g. `period`, `lower`, `upper`) are read inside `StrategyFactory.get_strategy()` using `config.get("period", 14)`.

---

## 14. Complete Worked Example: Bollinger Bands

Let's say you want to add a new **Bollinger Bands Mean Reversion** strategy (different from preset #2 — this one exits above the *upper* band, not middle).

### Step 1: `backend/strategies.py`

Inside `StrategyFactory.get_strategy()`, add before the final fallback line:

```python
# 8. Bollinger Bands Mean Reversion (enter < lower, exit > upper)
if strategy_id == "8":
    period   = int(config.get("period", 20))
    std_dev  = float(config.get("std_dev", 2.0))
    return DynamicStrategy({
        "nextBarEntry": True,
        "mode": "CODE",
        "pythonCode": f"""
def signal_logic(df):
    close = df['Close']
    bb = vbt.BBANDS.run(close, window={period}, alpha={std_dev})
    # Enter when close crosses below lower band (oversold)
    entries = close.vbt.crossed_below(bb.lower)
    # Exit when close crosses above upper band (overbought)
    exits = close.vbt.crossed_above(bb.upper)
    return entries, exits
"""
    })
```

### Step 2: `backend/routes/strategy_routes.py`

Add to the `strategies` list:

```python
{
    "id": "8",
    "name": "BB Mean Reversion (Full Reversal)",
    "description": "Buy below lower band, sell above upper band.",
    "params": [
        {"name": "period",  "label": "BB Length",         "min": 10, "max": 50,  "default": 20},
        {"name": "std_dev", "label": "StdDev Multiplier", "min": 1.0, "max": 3.0, "default": 2.0, "step": 0.1}
    ]
}
```

### Done. You automatically get:

- ✅ Strategy appears in the UI dropdown
- ✅ `period` and `std_dev` input fields auto-rendered with correct min/max/default
- ✅ Run Backtest → full equity curve, drawdown chart, trade table, monthly returns, all 20+ metrics
- ✅ Overview + Stats + Advanced Stats tabs all populated
- ✅ Optimization page → auto-discovers params → can run Phase 1 (period/std_dev search) + Phase 2 (SL/TP/TSL search)
- ✅ Walk-Forward Optimization works with no changes
- ✅ All SL / TP / TSL / slippage / commission / pyramiding settings apply automatically

---

## 15. What You Get for Free (Zero Extra Code)

| Feature | Where it lives |
|---|---|
| Portfolio construction (VectorBT) | `services/portfolio_utils.py` |
| Stop-loss / Take-profit / Trailing stop | `services/portfolio_utils.py` |
| Slippage + flat commission | `services/portfolio_utils.py` |
| Position sizing (Fixed / % Equity) | `services/portfolio_utils.py` |
| All 20+ performance metrics | `services/backtest_engine.py` |
| Equity curve + drawdown chart | `services/backtest_engine.py` |
| Trade-by-trade records | `services/backtest_engine.py` |
| Monthly returns heatmap | `services/backtest_engine.py` |
| Full `pf.stats()` output (Stats tab) | `services/backtest_engine.py` |
| Returns stats (Advanced Stats tab) | `services/backtest_engine.py` |
| Phase 1 Optuna optimization | `services/grid_engine.py` |
| Phase 2 SL/TP/TSL optimization | `services/grid_engine.py` |
| Walk-Forward Optimization | `services/wfo_engine.py` |
| Strategy param inputs (UI) | `components/backtest/StrategyParamInputs.tsx` |
| Results page (all tabs) | `pages/Results.tsx` |
| Optimization wizard | `pages/Optimization.tsx` |

---

## Appendix: Frequency Detection

VectorBT needs to know the data frequency to compute annualized metrics (Sharpe ratio, CAGR, etc.).
The system auto-detects this from the data in `portfolio_utils.detect_freq()`:

| Bar interval | VectorBT freq string |
|---|---|
| 1 minute | `"1m"` |
| 5 minutes | `"5m"` |
| 15 minutes | `"15m"` |
| 60 minutes (1 hour) | `"1h"` |
| 1440+ minutes (daily or more) | `"1D"` |

Detection uses the **mode** (most common) time delta between bars so weekend/overnight gaps in intraday data don't distort the result. You don't need to do anything — this is fully automatic.

---

*Last updated: Feb 2026*
