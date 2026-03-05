"""Research Engine — Institutional-grade statistical analysis.

Computes quantitative metrics for a single stock across four analysis
domains: Statistical Profile, Seasonality & Patterns,
Distribution & Normality, and Advanced Analysis (GARCH, HMM, etc.).

Dependencies:
    numpy, pandas, scipy.stats, statsmodels, arch, hmmlearn
"""

from __future__ import annotations

import logging
import warnings
from typing import Any, Optional

import numpy as np
import pandas as pd
from scipy import stats as sp_stats
from statsmodels.tsa.stattools import acf, pacf
from statsmodels.stats.diagnostic import acorr_ljungbox

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
    correlation_dfs: Optional[dict[str, pd.DataFrame]] = None,
) -> dict[str, Any]:
    """Run the full research analysis suite.

    Args:
        df: OHLCV DataFrame for the target stock (DatetimeIndex, lowercase cols).
        benchmark_df: Optional OHLCV DataFrame for NIFTY 50 benchmark.
        correlation_dfs: Optional dict of {symbol: OHLCV DataFrame} for correlation matrix.

    Returns:
        Dictionary with keys ``profile``, ``seasonality``, ``distribution``, ``advanced``.
    """
    if df is None or df.empty:
        raise ValueError("Cannot analyse empty DataFrame")

    close = df["close"].astype(float)
    returns = close.pct_change().dropna()

    profile = _compute_profile(close, returns, benchmark_df)
    seasonality = _compute_seasonality(close, returns)
    distribution = _compute_distribution(returns)
    advanced = _compute_advanced(close, returns, correlation_dfs)

    return {
        "profile": profile,
        "seasonality": seasonality,
        "distribution": distribution,
        "advanced": advanced,
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
# Tab 4 — Advanced Analysis
# ════════════════════════════════════════════════════════════════════════

def _compute_advanced(
    close: pd.Series,
    returns: pd.Series,
    correlation_dfs: Optional[dict[str, pd.DataFrame]] = None,
) -> dict[str, Any]:
    """Advanced volatility modelling, regime detection, and correlation.

    Args:
        close: Daily close price series.
        returns: Daily percentage returns series.
        correlation_dfs: Optional dict of {symbol: OHLCV DataFrame} for correlation.

    Returns:
        Dictionary with garch, acfPacf, rollingVol, regimes, and correlation data.
    """
    result: dict[str, Any] = {}

    # 1. GARCH(1,1)
    result["garch"] = _fit_garch(returns)

    # 2. ACF / PACF on squared returns
    result["acfPacf"] = _compute_acf_pacf(returns)

    # 3. Rolling Volatility (20d / 60d)
    result["rollingVol"] = _compute_rolling_vol(returns)

    # 4. Regime Detection (HMM)
    result["regimes"] = _fit_hmm_regimes(returns)

    # 5. Correlation Matrix
    result["correlation"] = _compute_correlation(returns, correlation_dfs)

    return result


def _fit_garch(returns: pd.Series) -> dict[str, Any]:
    """Fit GARCH(1,1) model and return parameters + conditional vol.

    Args:
        returns: Daily returns series.

    Returns:
        Dictionary with omega, alpha, beta, persistence, conditional vol series,
        and GARCH-based VaR.
    """
    try:
        from arch import arch_model

        # Scale returns to percentage for numerical stability
        r_pct = returns * 100

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = arch_model(r_pct, vol="Garch", p=1, q=1, dist="normal", mean="Constant")
            result = model.fit(disp="off", show_warning=False)

        params = result.params
        omega = float(params.get("omega", 0))
        alpha = float(params.get("alpha[1]", 0))
        beta = float(params.get("beta[1]", 0))
        persistence = alpha + beta

        # Conditional volatility (annualized, back to decimal)
        cond_vol = result.conditional_volatility / 100  # back to decimal
        cond_vol_annual = cond_vol * np.sqrt(_TRADING_DAYS)

        # Last 252 points for charting
        chart_len = min(252, len(cond_vol_annual))
        vol_series = []
        for i in range(-chart_len, 0):
            idx = cond_vol_annual.index[i]
            date_str = str(idx.date()) if hasattr(idx, "date") else str(idx)
            vol_series.append({
                "date": date_str,
                "condVol": round(float(cond_vol_annual.iloc[i]) * 100, 2),
            })

        # GARCH-based VaR (95%)
        last_vol_daily = float(cond_vol.iloc[-1])
        garch_var_95 = float(returns.mean() - 1.645 * last_vol_daily) * 100
        hist_var_95 = float(np.percentile(returns, 5)) * 100

        return {
            "omega": round(omega, 6),
            "alpha": round(alpha, 4),
            "beta": round(beta, 4),
            "persistence": round(persistence, 4),
            "halfLife": round(np.log(2) / (-np.log(persistence)), 1) if persistence < 1 else None,
            "conditionalVolSeries": vol_series,
            "currentCondVol": round(float(cond_vol_annual.iloc[-1]) * 100, 2),
            "garchVaR95": round(garch_var_95, 4),
            "historicalVaR95": round(hist_var_95, 4),
            "logLikelihood": round(float(result.loglikelihood), 2),
            "aic": round(float(result.aic), 2),
            "bic": round(float(result.bic), 2),
            "fitted": True,
        }
    except Exception as e:
        logger.warning(f"GARCH fitting failed: {e}")
        return {"fitted": False, "error": str(e)}


def _compute_acf_pacf(returns: pd.Series, max_lags: int = 20) -> dict[str, Any]:
    """Compute ACF and PACF on squared returns for volatility clustering diagnostics.

    Args:
        returns: Daily returns series.
        max_lags: Maximum number of lags.

    Returns:
        Dictionary with acf, pacf arrays, confidence bands, and Ljung-Box test.
    """
    try:
        r_sq = (returns ** 2).dropna().values
        n = len(r_sq)
        nlags = min(max_lags, n // 2 - 1)

        if nlags < 2:
            return {"computed": False, "error": "Insufficient data"}

        # ACF with confidence intervals
        acf_vals, acf_ci = acf(r_sq, nlags=nlags, alpha=0.05)
        pacf_vals, pacf_ci = pacf(r_sq, nlags=nlags, alpha=0.05, method="ywm")

        conf_bound = 1.96 / np.sqrt(n)

        acf_data = [
            {"lag": i, "value": round(float(acf_vals[i]), 4)}
            for i in range(1, len(acf_vals))
        ]
        pacf_data = [
            {"lag": i, "value": round(float(pacf_vals[i]), 4)}
            for i in range(1, len(pacf_vals))
        ]

        # Ljung-Box test on squared returns (test for ARCH effects)
        lb_result = acorr_ljungbox(r_sq, lags=[10], return_df=True)
        lb_stat = float(lb_result["lb_stat"].iloc[0])
        lb_pval = float(lb_result["lb_pvalue"].iloc[0])

        return {
            "computed": True,
            "acf": acf_data,
            "pacf": pacf_data,
            "confidenceBound": round(float(conf_bound), 4),
            "ljungBox": {
                "statistic": round(lb_stat, 4),
                "pValue": lb_pval,
                "hasArchEffects": lb_pval < 0.05,
            },
        }
    except Exception as e:
        logger.warning(f"ACF/PACF computation failed: {e}")
        return {"computed": False, "error": str(e)}


def _compute_rolling_vol(returns: pd.Series) -> dict[str, Any]:
    """Compute 20-day and 60-day rolling annualized volatility.

    Args:
        returns: Daily returns series.

    Returns:
        Dictionary with rolling vol time-series and percentile info.
    """
    try:
        vol_20 = returns.rolling(window=20, min_periods=15).std() * np.sqrt(_TRADING_DAYS) * 100
        vol_60 = returns.rolling(window=60, min_periods=40).std() * np.sqrt(_TRADING_DAYS) * 100

        # Combine into chart-ready series (last 252 points)
        chart_len = min(252, len(vol_20.dropna()))
        vol_20_clean = vol_20.dropna()
        vol_60_clean = vol_60.dropna()

        series = []
        for i in range(-chart_len, 0):
            idx = vol_20_clean.index[i]
            date_str = str(idx.date()) if hasattr(idx, "date") else str(idx)
            v60 = None
            if idx in vol_60_clean.index:
                v60 = round(float(vol_60_clean.loc[idx]), 2)
            series.append({
                "date": date_str,
                "vol20d": round(float(vol_20_clean.iloc[i]), 2),
                "vol60d": v60,
            })

        # Current vol percentile rank (20d vol vs full history)
        current_vol = float(vol_20.iloc[-1]) if not np.isnan(vol_20.iloc[-1]) else 0
        vol_history = vol_20.dropna().values
        percentile_rank = float(sp_stats.percentileofscore(vol_history, current_vol))

        return {
            "series": series,
            "currentVol20d": round(current_vol, 2),
            "currentVol60d": round(float(vol_60.iloc[-1]), 2) if not np.isnan(vol_60.iloc[-1]) else None,
            "volPercentileRank": round(percentile_rank, 1),
            "volRegime": "HIGH" if percentile_rank > 75 else "LOW" if percentile_rank < 25 else "NORMAL",
        }
    except Exception as e:
        logger.warning(f"Rolling vol computation failed: {e}")
        return {"series": [], "error": str(e)}


def _fit_hmm_regimes(returns: pd.Series, n_states: int = 2) -> dict[str, Any]:
    """Fit a Hidden Markov Model to detect market regimes.

    Args:
        returns: Daily returns series.
        n_states: Number of hidden states (default 2: low-vol, high-vol).

    Returns:
        Dictionary with state parameters, transition matrix, current regime, and timeline.
    """
    try:
        from hmmlearn.hmm import GaussianHMM

        r = returns.dropna().values.reshape(-1, 1)
        if len(r) < 60:
            return {"fitted": False, "error": "Need at least 60 data points"}

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = GaussianHMM(
                n_components=n_states,
                covariance_type="full",
                n_iter=200,
                random_state=42,
            )
            model.fit(r)

        hidden_states = model.predict(r)
        state_probs = model.predict_proba(r)

        # Sort states by volatility (low-vol first)
        state_vols = [float(np.sqrt(model.covars_[i][0][0])) for i in range(n_states)]
        sorted_indices = np.argsort(state_vols)
        label_map = {old: new for new, old in enumerate(sorted_indices)}
        state_labels = ["Low Volatility", "High Volatility"] if n_states == 2 else \
                       ["Low Vol", "Medium Vol", "High Vol"]

        # State parameters
        states = []
        for new_idx, old_idx in enumerate(sorted_indices):
            mean_ret = float(model.means_[old_idx][0]) * 100 * _TRADING_DAYS
            vol = float(np.sqrt(model.covars_[old_idx][0][0])) * 100 * np.sqrt(_TRADING_DAYS)
            states.append({
                "id": new_idx,
                "label": state_labels[new_idx] if new_idx < len(state_labels) else f"State {new_idx}",
                "annualizedReturn": round(mean_ret, 2),
                "annualizedVol": round(vol, 2),
            })

        # Transition matrix (re-ordered)
        trans_matrix = model.transmat_[np.ix_(sorted_indices, sorted_indices)]
        trans_data = [
            [round(float(trans_matrix[i][j]), 4) for j in range(n_states)]
            for i in range(n_states)
        ]

        # Current regime
        current_state_raw = int(hidden_states[-1])
        current_state = label_map[current_state_raw]
        current_prob = round(float(state_probs[-1][current_state_raw]), 4)

        # Regime timeline (last 252 points)
        chart_len = min(252, len(hidden_states))
        idx_series = returns.dropna().index
        timeline = []
        for i in range(-chart_len, 0):
            idx = idx_series[i]
            date_str = str(idx.date()) if hasattr(idx, "date") else str(idx)
            raw_state = int(hidden_states[i])
            timeline.append({
                "date": date_str,
                "regime": label_map[raw_state],
                "probability": round(float(state_probs[i][raw_state]), 4),
            })

        return {
            "fitted": True,
            "nStates": n_states,
            "states": states,
            "transitionMatrix": trans_data,
            "currentRegime": current_state,
            "currentRegimeLabel": states[current_state]["label"],
            "currentProbability": current_prob,
            "timeline": timeline,
        }
    except Exception as e:
        logger.warning(f"HMM regime detection failed: {e}")
        return {"fitted": False, "error": str(e)}


def _compute_correlation(
    returns: pd.Series,
    correlation_dfs: Optional[dict[str, pd.DataFrame]] = None,
) -> dict[str, Any]:
    """Compute multi-stock correlation matrix.

    Args:
        returns: Primary stock daily returns (used as base).
        correlation_dfs: Dict of {symbol: OHLCV DataFrame} for other stocks.

    Returns:
        Dictionary with correlation matrix and rolling correlation.
    """
    if not correlation_dfs:
        return {"computed": False, "message": "No correlation symbols provided"}

    try:
        ret_dict: dict[str, pd.Series] = {"target": returns}
        for sym, cdf in correlation_dfs.items():
            if cdf is not None and not cdf.empty:
                sym_close = cdf["close"].astype(float)
                ret_dict[sym] = sym_close.pct_change().dropna()

        if len(ret_dict) < 2:
            return {"computed": False, "message": "Need at least 2 stocks"}

        combined = pd.DataFrame(ret_dict).dropna()
        if len(combined) < 20:
            return {"computed": False, "message": "Insufficient overlapping data"}

        # Correlation matrix
        corr_matrix = combined.corr()
        symbols = list(corr_matrix.columns)
        matrix = [
            [round(float(corr_matrix.iloc[i, j]), 4) for j in range(len(symbols))]
            for i in range(len(symbols))
        ]

        # Rolling 60-day correlation (each symbol vs target)
        rolling_corr: dict[str, list[dict]] = {}
        for sym in symbols:
            if sym == "target":
                continue
            rc = combined["target"].rolling(window=60, min_periods=30).corr(combined[sym]).dropna()
            chart_len = min(120, len(rc))
            rolling_corr[sym] = [
                {
                    "date": str(rc.index[i].date()) if hasattr(rc.index[i], "date") else str(rc.index[i]),
                    "correlation": round(float(rc.iloc[i]), 4),
                }
                for i in range(-chart_len, 0)
            ]

        return {
            "computed": True,
            "symbols": symbols,
            "matrix": matrix,
            "rollingCorrelation": rolling_corr,
        }
    except Exception as e:
        logger.warning(f"Correlation computation failed: {e}")
        return {"computed": False, "error": str(e)}


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
