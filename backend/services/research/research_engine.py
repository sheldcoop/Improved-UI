"""Research Engine — Institutional-grade statistical analysis.

Computes quantitative metrics for a single stock across three analysis
domains: Statistical Profile, Seasonality & Patterns, and
Distribution & Normality.

Dependencies:
    numpy, pandas, scipy.stats, statsmodels
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import numpy as np
import pandas as pd
from scipy import stats as sp_stats

logger = logging.getLogger(__name__)

# Indian risk-free rate (10Y Govt bond approx.)
_RISK_FREE_ANNUAL = 0.06
_TRADING_DAYS = 252


# ════════════════════════════════════════════════════════════════════════
# Public entry point
# ════════════════════════════════════════════════════════════════════════

def analyze(
    df: pd.DataFrame,
    benchmark_df: Optional[pd.DataFrame] = None,
) -> dict[str, Any]:
    """Run the full research analysis suite.

    Args:
        df: OHLCV DataFrame for the target stock (DatetimeIndex, lowercase cols).
        benchmark_df: Optional OHLCV DataFrame for NIFTY 50 benchmark.

    Returns:
        Dictionary with keys ``profile``, ``seasonality``, ``distribution``.
    """
    if df is None or df.empty:
        raise ValueError("Cannot analyse empty DataFrame")

    close = df["close"].astype(float)
    returns = close.pct_change().dropna()

    profile = _compute_profile(close, returns, benchmark_df)
    seasonality = _compute_seasonality(close, returns)
    distribution = _compute_distribution(returns)

    return {
        "profile": profile,
        "seasonality": seasonality,
        "distribution": distribution,
    }


# ════════════════════════════════════════════════════════════════════════
# Tab 1 — Statistical Profile
# ════════════════════════════════════════════════════════════════════════

def _compute_profile(
    close: pd.Series,
    returns: pd.Series,
    benchmark_df: Optional[pd.DataFrame],
) -> dict[str, Any]:
    """Core statistical metrics for the asset.

    Args:
        close: Daily close price series.
        returns: Daily percentage returns series.
        benchmark_df: Optional benchmark OHLCV for beta calculation.

    Returns:
        Dictionary of statistical profile metrics.
    """
    mean_daily = float(returns.mean())
    std_daily = float(returns.std())
    annualized_return = float((1 + mean_daily) ** _TRADING_DAYS - 1)
    annualized_vol = float(std_daily * np.sqrt(_TRADING_DAYS))
    skewness = float(sp_stats.skew(returns))
    kurtosis = float(sp_stats.kurtosis(returns))

    # VaR & CVaR (Historical)
    var_95 = float(np.percentile(returns, 5))
    var_99 = float(np.percentile(returns, 1))
    cvar_95 = float(returns[returns <= var_95].mean()) if (returns <= var_95).any() else var_95

    # Sharpe Ratio
    rf_daily = _RISK_FREE_ANNUAL / _TRADING_DAYS
    sharpe = float((mean_daily - rf_daily) / std_daily) * np.sqrt(_TRADING_DAYS) if std_daily > 0 else 0.0

    # Autocorrelation (lag 1–5)
    autocorr = {}
    for lag in range(1, 6):
        try:
            autocorr[f"lag_{lag}"] = round(float(returns.autocorr(lag=lag)), 4)
        except Exception:
            autocorr[f"lag_{lag}"] = None

    # Hurst Exponent (Rescaled Range)
    hurst = _hurst_exponent(returns)

    # Max Drawdown
    dd_info = _max_drawdown_info(close)

    # Beta vs Benchmark
    beta = _compute_beta(returns, benchmark_df)

    # Price range
    range_high = float(close.max())
    range_low = float(close.min())
    current_price = float(close.iloc[-1])

    return {
        "meanDailyReturn": round(mean_daily * 100, 4),
        "annualizedReturn": round(annualized_return * 100, 2),
        "stdDaily": round(std_daily * 100, 4),
        "annualizedVolatility": round(annualized_vol * 100, 2),
        "skewness": round(skewness, 4),
        "kurtosis": round(kurtosis, 4),
        "var95": round(var_95 * 100, 4),
        "var99": round(var_99 * 100, 4),
        "cvar95": round(cvar_95 * 100, 4),
        "sharpeRatio": round(sharpe, 4),
        "autocorrelation": autocorr,
        "hurstExponent": round(hurst, 4) if hurst is not None else None,
        "maxDrawdownPct": round(dd_info["max_dd_pct"], 2),
        "maxDrawdownDays": dd_info["recovery_days"],
        "drawdownPeakDate": dd_info["peak_date"],
        "drawdownTroughDate": dd_info["trough_date"],
        "beta": round(beta, 4) if beta is not None else None,
        "rangeHigh": round(range_high, 2),
        "rangeLow": round(range_low, 2),
        "currentPrice": round(current_price, 2),
        "totalDays": len(close),
    }


# ════════════════════════════════════════════════════════════════════════
# Tab 2 — Seasonality & Patterns
# ════════════════════════════════════════════════════════════════════════

def _compute_seasonality(
    close: pd.Series,
    returns: pd.Series,
) -> dict[str, Any]:
    """Seasonal return patterns.

    Args:
        close: Daily close price series.
        returns: Daily percentage returns series.

    Returns:
        Dictionary containing monthly heatmap, day-of-week, and streak data.
    """
    # Monthly returns heatmap  (year × month pivot)
    monthly_ret = returns.copy()
    monthly_ret.index = pd.to_datetime(monthly_ret.index)
    monthly_grouped = monthly_ret.groupby(
        [monthly_ret.index.year, monthly_ret.index.month]
    ).apply(lambda x: float((1 + x).prod() - 1) * 100)
    monthly_grouped.index.names = ["year", "month"]

    heatmap_rows: list[dict] = []
    for (year, month), ret in monthly_grouped.items():
        heatmap_rows.append({"year": int(year), "month": int(month), "returnPct": round(ret, 2)})

    # Monthly average (across all years)
    monthly_avg: list[dict] = []
    for month in range(1, 13):
        vals = [r["returnPct"] for r in heatmap_rows if r["month"] == month]
        avg = sum(vals) / len(vals) if vals else 0
        monthly_avg.append({"month": month, "avgReturnPct": round(avg, 2), "count": len(vals)})

    # Day-of-week returns
    dow_returns = returns.groupby(returns.index.dayofweek).mean() * 100
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    dow_data = [
        {"day": day_names[i], "avgReturnPct": round(float(dow_returns.iloc[i]), 4)}
        for i in range(min(5, len(dow_returns)))
    ]

    # 52-week high/low proximity
    rolling_high = close.rolling(window=min(252, len(close)), min_periods=1).max()
    rolling_low = close.rolling(window=min(252, len(close)), min_periods=1).min()
    pct_from_high = float((close.iloc[-1] / rolling_high.iloc[-1] - 1) * 100)
    pct_from_low = float((close.iloc[-1] / rolling_low.iloc[-1] - 1) * 100)

    # Consecutive win/loss streaks
    streak_info = _compute_streaks(returns)

    # Best / Worst months
    best_month = max(heatmap_rows, key=lambda x: x["returnPct"]) if heatmap_rows else None
    worst_month = min(heatmap_rows, key=lambda x: x["returnPct"]) if heatmap_rows else None

    return {
        "monthlyHeatmap": heatmap_rows,
        "monthlyAverage": monthly_avg,
        "dayOfWeek": dow_data,
        "pctFrom52WeekHigh": round(pct_from_high, 2),
        "pctFrom52WeekLow": round(pct_from_low, 2),
        "bestMonth": best_month,
        "worstMonth": worst_month,
        "streaks": streak_info,
    }


# ════════════════════════════════════════════════════════════════════════
# Tab 3 — Distribution & Normality
# ════════════════════════════════════════════════════════════════════════

def _compute_distribution(returns: pd.Series) -> dict[str, Any]:
    """Return distribution analysis and normality tests.

    Args:
        returns: Daily percentage returns series.

    Returns:
        Dictionary containing histogram, QQ-plot, and normality test data.
    """
    r = returns.dropna().values

    # Histogram
    counts, bin_edges = np.histogram(r, bins=50)
    histogram = [
        {
            "binStart": round(float(bin_edges[i]) * 100, 4),
            "binEnd": round(float(bin_edges[i + 1]) * 100, 4),
            "count": int(counts[i]),
        }
        for i in range(len(counts))
    ]

    # Normal curve overlay parameters
    mu = float(np.mean(r))
    sigma = float(np.std(r))

    # QQ-plot data
    sorted_r = np.sort(r)
    n = len(sorted_r)
    theoretical_quantiles = sp_stats.norm.ppf(
        (np.arange(1, n + 1) - 0.5) / n
    )
    # Downsample to max 200 points for frontend rendering
    step = max(1, n // 200)
    qq_data = [
        {
            "theoretical": round(float(theoretical_quantiles[i]) * 100, 4),
            "sample": round(float(sorted_r[i]) * 100, 4),
        }
        for i in range(0, n, step)
    ]

    # Normality Tests
    jb_stat, jb_p = sp_stats.jarque_bera(r)

    shapiro_stat, shapiro_p = None, None
    if len(r) <= 5000:
        shapiro_stat, shapiro_p = sp_stats.shapiro(r)
    else:
        # Shapiro-Wilk limit: sample first 5000
        sample = np.random.default_rng(42).choice(r, size=5000, replace=False)
        shapiro_stat, shapiro_p = sp_stats.shapiro(sample)

    ad_result = sp_stats.anderson(r, dist="norm")

    # Confidence intervals for expected daily return
    se = sigma / np.sqrt(n)
    ci_68 = (round(float((mu - 1.0 * se) * 100), 4), round(float((mu + 1.0 * se) * 100), 4))
    ci_95 = (round(float((mu - 1.96 * se) * 100), 4), round(float((mu + 1.96 * se) * 100), 4))
    ci_99 = (round(float((mu - 2.576 * se) * 100), 4), round(float((mu + 2.576 * se) * 100), 4))

    return {
        "histogram": histogram,
        "normalMu": round(mu * 100, 6),
        "normalSigma": round(sigma * 100, 6),
        "qqPlot": qq_data,
        "jarqueBera": {
            "statistic": round(float(jb_stat), 4),
            "pValue": float(jb_p),
            "isNormal": float(jb_p) > 0.05,
        },
        "shapiroWilk": {
            "statistic": round(float(shapiro_stat), 4) if shapiro_stat else None,
            "pValue": float(shapiro_p) if shapiro_p else None,
            "isNormal": float(shapiro_p) > 0.05 if shapiro_p else None,
        },
        "andersonDarling": {
            "statistic": round(float(ad_result.statistic), 4),
            "criticalValues": {
                f"{int(s)}%": round(float(c), 4)
                for s, c in zip(ad_result.significance_level, ad_result.critical_values)
            },
        },
        "confidenceIntervals": {
            "ci68": ci_68,
            "ci95": ci_95,
            "ci99": ci_99,
        },
        "sampleSize": n,
    }


# ════════════════════════════════════════════════════════════════════════
# Helper functions
# ════════════════════════════════════════════════════════════════════════

def _hurst_exponent(returns: pd.Series, max_k: int = 20) -> Optional[float]:
    """Estimate Hurst exponent via rescaled range (R/S) analysis.

    Args:
        returns: Daily returns series.
        max_k: Maximum subdivisions to test.

    Returns:
        Estimated Hurst exponent or None on failure.
    """
    try:
        ts = returns.dropna().values
        n = len(ts)
        if n < 20:
            return None

        max_k = min(max_k, n // 2)
        rs_list = []
        ns_list = []

        for k in range(2, max_k + 1):
            subset_size = n // k
            if subset_size < 2:
                continue
            rs_values = []
            for i in range(k):
                subset = ts[i * subset_size: (i + 1) * subset_size]
                mean_sub = np.mean(subset)
                deviations = np.cumsum(subset - mean_sub)
                r = np.max(deviations) - np.min(deviations)
                s = np.std(subset, ddof=1)
                if s > 0:
                    rs_values.append(r / s)
            if rs_values:
                rs_list.append(np.mean(rs_values))
                ns_list.append(subset_size)

        if len(rs_list) < 3:
            return None

        log_n = np.log(ns_list)
        log_rs = np.log(rs_list)
        slope, _, _, _, _ = sp_stats.linregress(log_n, log_rs)
        return float(slope)
    except Exception as e:
        logger.warning(f"Hurst exponent calculation failed: {e}")
        return None


def _max_drawdown_info(close: pd.Series) -> dict[str, Any]:
    """Compute max drawdown with peak/trough dates and recovery duration.

    Args:
        close: Daily close price series.

    Returns:
        Dictionary with max drawdown %, dates, and recovery info.
    """
    cummax = close.cummax()
    drawdown = (close - cummax) / cummax

    trough_idx = drawdown.idxmin()
    peak_idx = close.loc[:trough_idx].idxmax()
    max_dd = float(drawdown.min() * 100)

    # Recovery: find first date after trough where price >= peak price
    peak_price = close.loc[peak_idx]
    recovery_slice = close.loc[trough_idx:]
    recovered = recovery_slice[recovery_slice >= peak_price]
    if len(recovered) > 0:
        recovery_date = recovered.index[0]
        recovery_days = (recovery_date - trough_idx).days
    else:
        recovery_days = None  # not yet recovered

    return {
        "max_dd_pct": abs(max_dd),
        "peak_date": str(peak_idx.date()) if hasattr(peak_idx, "date") else str(peak_idx),
        "trough_date": str(trough_idx.date()) if hasattr(trough_idx, "date") else str(trough_idx),
        "recovery_days": recovery_days,
    }


def _compute_beta(
    returns: pd.Series,
    benchmark_df: Optional[pd.DataFrame],
) -> Optional[float]:
    """Calculate beta vs benchmark using OLS regression.

    Args:
        returns: Target stock daily returns.
        benchmark_df: Benchmark OHLCV DataFrame.

    Returns:
        Beta coefficient or None if benchmark unavailable.
    """
    if benchmark_df is None or benchmark_df.empty:
        return None

    try:
        bench_close = benchmark_df["close"].astype(float)
        bench_returns = bench_close.pct_change().dropna()

        # Align dates
        aligned = pd.DataFrame({
            "stock": returns,
            "bench": bench_returns,
        }).dropna()

        if len(aligned) < 20:
            return None

        slope, _, _, _, _ = sp_stats.linregress(aligned["bench"], aligned["stock"])
        return float(slope)
    except Exception as e:
        logger.warning(f"Beta calculation failed: {e}")
        return None


def _compute_streaks(returns: pd.Series) -> dict[str, int]:
    """Calculate consecutive winning and losing day streaks.

    Args:
        returns: Daily returns series.

    Returns:
        Dictionary with max win/loss streaks and current streak.
    """
    signs = np.sign(returns.values)
    max_win = 0
    max_loss = 0
    current = 0
    current_type = 0

    for s in signs:
        if s > 0:
            if current_type > 0:
                current += 1
            else:
                current = 1
                current_type = 1
            max_win = max(max_win, current)
        elif s < 0:
            if current_type < 0:
                current += 1
            else:
                current = 1
                current_type = -1
            max_loss = max(max_loss, current)
        else:
            current = 0
            current_type = 0

    return {
        "maxWinStreak": int(max_win),
        "maxLossStreak": int(max_loss),
        "currentStreak": int(current),
        "currentStreakType": "win" if current_type > 0 else "loss" if current_type < 0 else "flat",
    }
