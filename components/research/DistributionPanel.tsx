/**
 * DistributionPanel.tsx — Tab 3: Distribution & Normality.
 *
 * Return histogram with normal overlay, QQ-plot, normality tests,
 * and confidence intervals.
 */

import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ScatterChart, Scatter, ReferenceLine,
} from 'recharts';
import { CheckCircle, XCircle, Info } from 'lucide-react';
import type { DistributionData } from '../../services/researchService';

interface DistributionPanelProps {
    data: DistributionData;
}

const TestCard: React.FC<{
    name: string;
    statistic: number | null;
    pValue: number | null;
    isNormal: boolean | null;
    description: string;
}> = ({ name, statistic, pValue, isNormal, description }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-200">{name}</span>
            {isNormal !== null && (
                isNormal
                    ? <span className="flex items-center text-xs text-emerald-400"><CheckCircle className="w-3.5 h-3.5 mr-1" /> Normal</span>
                    : <span className="flex items-center text-xs text-amber-400"><XCircle className="w-3.5 h-3.5 mr-1" /> Non-Normal</span>
            )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs mb-2">
            <div>
                <span className="text-slate-500">Statistic</span>
                <div className="text-slate-200 font-mono">{statistic !== null ? statistic.toFixed(4) : '—'}</div>
            </div>
            <div>
                <span className="text-slate-500">p-value</span>
                <div className={`font-mono ${pValue !== null && pValue < 0.05 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {pValue !== null ? pValue < 0.0001 ? '<0.0001' : pValue.toFixed(4) : '—'}
                </div>
            </div>
        </div>
        <p className="text-[10px] text-slate-600 italic">{description}</p>
    </div>
);

const DistributionPanel: React.FC<DistributionPanelProps> = ({ data }) => {
    // Prepare histogram data with midpoint labels
    const histData = data.histogram.map(h => ({
        range: `${h.binStart.toFixed(1)}`,
        count: h.count,
        mid: (h.binStart + h.binEnd) / 2,
    }));

    const ci = data.confidenceIntervals;

    return (
        <div className="space-y-8">

            {/* Return Distribution Histogram */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Return Distribution (Daily, %)
                </h4>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={histData} barCategoryGap={0}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis
                                dataKey="range"
                                stroke="#64748b"
                                fontSize={10}
                                tickLine={false}
                                interval={Math.floor(histData.length / 10)}
                            />
                            <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                                formatter={(value: number) => [`${value} days`, 'Count']}
                                labelFormatter={(label: string) => `Return: ${label}%`}
                            />
                            <Bar
                                dataKey="count"
                                fill="#6366f1"
                                radius={[2, 2, 0, 0]}
                            />
                            {/* Reference line at mean */}
                            <ReferenceLine x={data.normalMu.toFixed(1)} stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" label={{ value: `μ=${data.normalMu.toFixed(2)}%`, position: 'top', fill: '#10b981', fontSize: 10 }} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-2">
                    <span>μ = {data.normalMu.toFixed(4)}%</span>
                    <span>σ = {data.normalSigma.toFixed(4)}%</span>
                    <span>n = {data.sampleSize}</span>
                </div>
            </div>

            {/* QQ Plot */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    QQ Plot (Quantile-Quantile)
                </h4>
                <p className="text-[10px] text-slate-600 mb-2">
                    If points lie on the diagonal, returns are normally distributed. Deviations at the tails indicate fat tails.
                </p>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis
                                type="number"
                                dataKey="theoretical"
                                name="Theoretical"
                                stroke="#64748b"
                                fontSize={10}
                                label={{ value: 'Theoretical Quantiles (%)', position: 'bottom', fill: '#64748b', fontSize: 10 }}
                            />
                            <YAxis
                                type="number"
                                dataKey="sample"
                                name="Sample"
                                stroke="#64748b"
                                fontSize={10}
                                label={{ value: 'Sample Quantiles (%)', angle: -90, position: 'left', fill: '#64748b', fontSize: 10 }}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                                formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]}
                            />
                            <Scatter data={data.qqPlot} fill="#818cf8" fillOpacity={0.6} />
                            {/* 45° reference line: approximate with two extremes */}
                            {data.qqPlot.length > 0 && (
                                <ReferenceLine
                                    segment={[
                                        { x: data.qqPlot[0].theoretical, y: data.qqPlot[0].theoretical },
                                        { x: data.qqPlot[data.qqPlot.length - 1].theoretical, y: data.qqPlot[data.qqPlot.length - 1].theoretical },
                                    ]}
                                    stroke="#10b981"
                                    strokeWidth={1.5}
                                    strokeDasharray="5 5"
                                />
                            )}
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Normality Tests */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                    <Info className="w-3.5 h-3.5 mr-2" /> Normality Tests
                </h4>
                <p className="text-[10px] text-slate-600 mb-3">
                    p-value &lt; 0.05 means returns are NOT normally distributed (reject null hypothesis of normality).
                    Most real stocks fail these tests ­— that's actually useful information for risk modelling.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <TestCard
                        name="Jarque-Bera"
                        statistic={data.jarqueBera.statistic}
                        pValue={data.jarqueBera.pValue}
                        isNormal={data.jarqueBera.isNormal}
                        description="Tests skewness + kurtosis together. Most sensitive to fat tails."
                    />
                    <TestCard
                        name="Shapiro-Wilk"
                        statistic={data.shapiroWilk.statistic}
                        pValue={data.shapiroWilk.pValue}
                        isNormal={data.shapiroWilk.isNormal}
                        description="Gold standard for normality. W close to 1 = normal."
                    />
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-slate-200">Anderson-Darling</span>
                        </div>
                        <div className="text-xs mb-2">
                            <span className="text-slate-500">Statistic: </span>
                            <span className="text-slate-200 font-mono">{data.andersonDarling.statistic}</span>
                        </div>
                        <div className="text-xs space-y-1">
                            <span className="text-slate-500">Critical Values:</span>
                            {Object.entries(data.andersonDarling.criticalValues).map(([sig, cv]) => (
                                <div key={sig} className="flex justify-between">
                                    <span className="text-slate-500">{sig} significance</span>
                                    <span className={`font-mono ${data.andersonDarling.statistic > cv ? 'text-amber-400' : 'text-emerald-400'}`}>
                                        {cv} {data.andersonDarling.statistic > cv ? '✗' : '✓'}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-600 italic mt-2">Emphasises tail behavior more than J-B.</p>
                    </div>
                </div>
            </div>

            {/* Confidence Intervals */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Confidence Intervals for Expected Daily Return
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { label: '68% CI (±1σ)', range: ci.ci68, color: 'border-sky-500/30' },
                        { label: '95% CI (±1.96σ)', range: ci.ci95, color: 'border-emerald-500/30' },
                        { label: '99% CI (±2.58σ)', range: ci.ci99, color: 'border-amber-500/30' },
                    ].map(c => (
                        <div key={c.label} className={`bg-slate-900 border ${c.color} rounded-lg p-4 text-center`}>
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">{c.label}</div>
                            <div className="text-sm font-mono text-slate-200">
                                [{c.range[0].toFixed(4)}%, {c.range[1].toFixed(4)}%]
                            </div>
                            <div className="text-[10px] text-slate-600 mt-1">
                                True daily return lies in this range with {c.label.match(/\d+/)?.[0]}% confidence
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DistributionPanel;
