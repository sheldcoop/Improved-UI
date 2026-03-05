/**
 * StatisticalProfile.tsx — Tab 1: Core statistical metrics.
 *
 * Displays institutional-grade metrics: returns, volatility, VaR, Hurst,
 * beta, autocorrelation, and drawdown analysis.
 */

import React from 'react';
import { TrendingUp, TrendingDown, Activity, Shield, BarChart, Target } from 'lucide-react';
import type { ProfileData } from '../../services/researchService';

interface StatisticalProfileProps {
    data: ProfileData;
}

const MetricCard: React.FC<{
    label: string;
    value: string;
    subtitle?: string;
    color?: 'green' | 'red' | 'blue' | 'amber' | 'default';
    icon?: React.ReactNode;
}> = ({ label, value, subtitle, color = 'default', icon }) => {
    const colorMap = {
        green: 'text-emerald-400',
        red: 'text-red-400',
        blue: 'text-sky-400',
        amber: 'text-amber-400',
        default: 'text-slate-100',
    };
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{label}</span>
                {icon && <span className="text-slate-600">{icon}</span>}
            </div>
            <div className={`text-xl font-bold font-mono ${colorMap[color]}`}>{value}</div>
            {subtitle && <div className="text-[10px] text-slate-500 mt-1">{subtitle}</div>}
        </div>
    );
};

const StatisticalProfile: React.FC<StatisticalProfileProps> = ({ data }) => {
    const hurstLabel = data.hurstExponent !== null
        ? data.hurstExponent > 0.55 ? 'Trending' : data.hurstExponent < 0.45 ? 'Mean-Reverting' : 'Random Walk'
        : 'N/A';
    const hurstColor = data.hurstExponent !== null
        ? data.hurstExponent > 0.55 ? 'green' : data.hurstExponent < 0.45 ? 'amber' : 'default'
        : 'default';

    return (
        <div className="space-y-6">
            {/* Returns & Volatility */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                    <TrendingUp className="w-3.5 h-3.5 mr-2" /> Returns & Volatility
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <MetricCard
                        label="Mean Daily Return"
                        value={`${data.meanDailyReturn > 0 ? '+' : ''}${data.meanDailyReturn}%`}
                        color={data.meanDailyReturn > 0 ? 'green' : 'red'}
                    />
                    <MetricCard
                        label="Annualized Return"
                        value={`${data.annualizedReturn > 0 ? '+' : ''}${data.annualizedReturn}%`}
                        color={data.annualizedReturn > 0 ? 'green' : 'red'}
                        icon={<TrendingUp className="w-3.5 h-3.5" />}
                    />
                    <MetricCard
                        label="Daily σ"
                        value={`${data.stdDaily}%`}
                        subtitle="Standard Deviation"
                    />
                    <MetricCard
                        label="Annual Volatility"
                        value={`${data.annualizedVolatility}%`}
                        subtitle={`σ × √252`}
                        icon={<Activity className="w-3.5 h-3.5" />}
                    />
                    <MetricCard
                        label="Sharpe Ratio"
                        value={data.sharpeRatio.toFixed(2)}
                        subtitle="RF = 6% (India)"
                        color={data.sharpeRatio > 1 ? 'green' : data.sharpeRatio < 0 ? 'red' : 'amber'}
                        icon={<Target className="w-3.5 h-3.5" />}
                    />
                </div>
            </div>

            {/* Risk Metrics */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                    <Shield className="w-3.5 h-3.5 mr-2" /> Risk Metrics
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <MetricCard label="VaR (95%)" value={`${data.var95}%`} subtitle="Max 1-day loss (95%)" color="red" />
                    <MetricCard label="VaR (99%)" value={`${data.var99}%`} subtitle="Max 1-day loss (99%)" color="red" />
                    <MetricCard label="CVaR (95%)" value={`${data.cvar95}%`} subtitle="Expected Shortfall" color="red" />
                    <MetricCard
                        label="Max Drawdown"
                        value={`-${data.maxDrawdownPct}%`}
                        subtitle={data.maxDrawdownDays !== null ? `Recovery: ${data.maxDrawdownDays}d` : 'Not yet recovered'}
                        color="red"
                        icon={<TrendingDown className="w-3.5 h-3.5" />}
                    />
                    <MetricCard
                        label="Beta (vs NIFTY)"
                        value={data.beta !== null ? data.beta.toFixed(2) : 'N/A'}
                        subtitle={data.beta !== null ? (data.beta > 1 ? 'More volatile than market' : 'Less volatile') : 'Benchmark unavailable'}
                        color={data.beta !== null ? (data.beta > 1.2 ? 'red' : data.beta < 0.8 ? 'green' : 'default') : 'default'}
                    />
                </div>
            </div>

            {/* Distributional Shape */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                    <BarChart className="w-3.5 h-3.5 mr-2" /> Distributional Shape
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <MetricCard
                        label="Skewness"
                        value={data.skewness.toFixed(4)}
                        subtitle={data.skewness < -0.5 ? '⚠ Left-skewed (crash prone)' : data.skewness > 0.5 ? 'Right-skewed (rally prone)' : 'Roughly symmetric'}
                        color={data.skewness < -0.5 ? 'red' : data.skewness > 0.5 ? 'green' : 'default'}
                    />
                    <MetricCard
                        label="Excess Kurtosis"
                        value={data.kurtosis.toFixed(4)}
                        subtitle={data.kurtosis > 3 ? '⚠ Heavy tails (fat-tail risk)' : 'Normal-like tails'}
                        color={data.kurtosis > 3 ? 'amber' : 'default'}
                    />
                    <MetricCard
                        label="Hurst Exponent"
                        value={data.hurstExponent !== null ? data.hurstExponent.toFixed(4) : 'N/A'}
                        subtitle={hurstLabel}
                        color={hurstColor}
                    />
                    <MetricCard label="Price Range High" value={`₹${data.rangeHigh.toLocaleString()}`} color="green" />
                    <MetricCard label="Price Range Low" value={`₹${data.rangeLow.toLocaleString()}`} color="red" />
                </div>
            </div>

            {/* Autocorrelation */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Autocorrelation (Lag 1–5)</h4>
                <div className="flex gap-2 flex-wrap">
                    {Object.entries(data.autocorrelation).map(([lag, val]) => (
                        <div key={lag} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-center min-w-[80px]">
                            <div className="text-[10px] text-slate-500 uppercase">{lag.replace('_', ' ')}</div>
                            <div className={`text-sm font-mono font-bold ${val !== null && Math.abs(val) > 0.1 ? 'text-amber-400' : 'text-slate-300'}`}>
                                {val !== null ? val.toFixed(4) : '—'}
                            </div>
                        </div>
                    ))}
                </div>
                <p className="text-[10px] text-slate-600 mt-2 italic">
                    Values &gt; |0.1| suggest returns have predictive structure (exploitable).
                </p>
            </div>

            {/* Drawdown Detail */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Drawdown Detail</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                        <span className="text-slate-500">Peak Date</span>
                        <div className="text-slate-200 font-mono">{data.drawdownPeakDate}</div>
                    </div>
                    <div>
                        <span className="text-slate-500">Trough Date</span>
                        <div className="text-red-400 font-mono">{data.drawdownTroughDate}</div>
                    </div>
                    <div>
                        <span className="text-slate-500">Max Drawdown</span>
                        <div className="text-red-400 font-bold">-{data.maxDrawdownPct}%</div>
                    </div>
                    <div>
                        <span className="text-slate-500">Recovery</span>
                        <div className="text-slate-200 font-mono">
                            {data.maxDrawdownDays !== null ? `${data.maxDrawdownDays} days` : 'Ongoing ⚠'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary bar */}
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
                <span>Current Price: <span className="text-slate-200 font-mono">₹{data.currentPrice.toLocaleString()}</span></span>
                <span>·</span>
                <span>Data Points: <span className="text-slate-300">{data.totalDays}</span></span>
            </div>
        </div>
    );
};

export default StatisticalProfile;
