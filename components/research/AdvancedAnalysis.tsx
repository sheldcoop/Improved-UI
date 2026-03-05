/**
 * AdvancedAnalysis.tsx — Tab 4: Advanced Volatility & Regime Analysis.
 *
 * Sections:
 *   1. GARCH(1,1) — Parameters + conditional vol chart
 *   2. ACF / PACF — Bar charts on squared returns + Ljung-Box test
 *   3. Rolling Volatility — 20d/60d dual-line chart + percentile badge
 *   4. Regime Detection (HMM) — State cards + regime timeline
 *   5. Correlation Matrix — Color-coded heatmap table
 */

import React from 'react';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell,
} from 'recharts';
import { TrendingUp, BarChart2, Layers, Activity, GitBranch } from 'lucide-react';
import type { AdvancedData } from '../../services/researchService';

interface Props {
    data: AdvancedData;
}

const COLORS = {
    cyan: '#22d3ee',
    purple: '#a78bfa',
    emerald: '#34d399',
    amber: '#fbbf24',
    red: '#f87171',
    indigo: '#818cf8',
    slate: '#94a3b8',
};

const MetricCard: React.FC<{ label: string; value: string | number | null; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
        <div className="text-xs text-slate-500 mb-1">{label}</div>
        <div className={`text-lg font-bold ${color || 'text-slate-100'}`}>
            {value ?? '—'}
        </div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
);

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; badge?: string; badgeColor?: string }> = ({ icon, title, badge, badgeColor }) => (
    <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        {badge && (
            <span className={`text-xs px-2 py-0.5 rounded font-bold ${badgeColor || 'bg-slate-700 text-slate-300'}`}>
                {badge}
            </span>
        )}
    </div>
);

const AdvancedAnalysis: React.FC<Props> = ({ data }) => {
    const { garch, acfPacf, rollingVol, regimes, correlation } = data;

    return (
        <div className="space-y-8">
            {/* ── 1. GARCH(1,1) ─────────────────────────────────── */}
            <section>
                <SectionHeader
                    icon={<TrendingUp className="w-5 h-5 text-cyan-400" />}
                    title="GARCH(1,1) — Volatility Model"
                    badge={garch.fitted ? `Persistence: ${garch.persistence}` : 'Not Fitted'}
                    badgeColor={garch.fitted ? 'bg-cyan-500/20 text-cyan-400' : 'bg-red-500/20 text-red-400'}
                />
                {garch.fitted ? (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
                            <MetricCard label="ω (Omega)" value={garch.omega!} sub="Long-run variance weight" />
                            <MetricCard label="α (Alpha)" value={garch.alpha!} sub="Shock impact" />
                            <MetricCard label="β (Beta)" value={garch.beta!} sub="Persistence of past vol" />
                            <MetricCard label="α + β" value={garch.persistence!} sub={Number(garch.persistence) > 0.95 ? '⚠ High persistence' : 'Mean-reverting'} color={Number(garch.persistence) > 0.95 ? 'text-amber-400' : 'text-emerald-400'} />
                            <MetricCard label="Half-Life" value={garch.halfLife ? `${garch.halfLife} days` : '∞'} sub="Vol shock decay" />
                            <MetricCard label="Current σ" value={`${garch.currentCondVol}%`} sub="Annualized cond. vol" color="text-cyan-400" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                            <MetricCard label="GARCH VaR (95%)" value={`${garch.garchVaR95}%`} sub="Model-based daily VaR" color="text-red-400" />
                            <MetricCard label="Historical VaR (95%)" value={`${garch.historicalVaR95}%`} sub="Empirical comparison" color="text-amber-400" />
                        </div>
                        {/* Conditional Volatility Chart */}
                        {garch.conditionalVolSeries && garch.conditionalVolSeries.length > 0 && (
                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                                <div className="text-xs text-slate-400 mb-2">Conditional Volatility (Annualized %)</div>
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={garch.conditionalVolSeries}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: 12 }} />
                                        <Line type="monotone" dataKey="condVol" stroke={COLORS.cyan} strokeWidth={1.5} dot={false} name="GARCH σ" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                        <div className="flex gap-4 text-xs text-slate-500 mt-2">
                            <span>AIC: {garch.aic}</span>
                            <span>BIC: {garch.bic}</span>
                            <span>Log-Likelihood: {garch.logLikelihood}</span>
                        </div>
                    </>
                ) : (
                    <div className="text-sm text-red-400">GARCH fitting failed: {garch.error}</div>
                )}
            </section>

            {/* ── 2. ACF / PACF ─────────────────────────────────── */}
            <section>
                <SectionHeader
                    icon={<BarChart2 className="w-5 h-5 text-purple-400" />}
                    title="ACF / PACF — Squared Returns"
                    badge={acfPacf.ljungBox?.hasArchEffects ? 'ARCH Effects Detected' : 'No ARCH Effects'}
                    badgeColor={acfPacf.ljungBox?.hasArchEffects ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}
                />
                {acfPacf.computed ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            {/* ACF */}
                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                                <div className="text-xs text-slate-400 mb-2">Autocorrelation (ACF) of r²</div>
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={acfPacf.acf}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="lag" tick={{ fontSize: 10, fill: '#64748b' }} />
                                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={[-0.2, 'auto']} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: 12 }} />
                                        <ReferenceLine y={acfPacf.confidenceBound} stroke="#64748b" strokeDasharray="4 4" />
                                        <ReferenceLine y={-acfPacf.confidenceBound!} stroke="#64748b" strokeDasharray="4 4" />
                                        <Bar dataKey="value" name="ACF">
                                            {acfPacf.acf!.map((entry, i) => (
                                                <Cell key={i} fill={Math.abs(entry.value) > acfPacf.confidenceBound! ? COLORS.amber : COLORS.purple} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            {/* PACF */}
                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                                <div className="text-xs text-slate-400 mb-2">Partial Autocorrelation (PACF) of r²</div>
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={acfPacf.pacf}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="lag" tick={{ fontSize: 10, fill: '#64748b' }} />
                                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={[-0.2, 'auto']} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: 12 }} />
                                        <ReferenceLine y={acfPacf.confidenceBound} stroke="#64748b" strokeDasharray="4 4" />
                                        <ReferenceLine y={-acfPacf.confidenceBound!} stroke="#64748b" strokeDasharray="4 4" />
                                        <Bar dataKey="value" name="PACF">
                                            {acfPacf.pacf!.map((entry, i) => (
                                                <Cell key={i} fill={Math.abs(entry.value) > acfPacf.confidenceBound! ? COLORS.amber : COLORS.indigo} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        {/* Ljung-Box Result */}
                        <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/30 text-sm">
                            <span className="text-slate-400">Ljung-Box (lag 10): </span>
                            <span className="font-bold text-slate-200">Q = {acfPacf.ljungBox?.statistic}</span>
                            <span className="text-slate-400 mx-2">|</span>
                            <span className="text-slate-200">p = {acfPacf.ljungBox?.pValue.toFixed(6)}</span>
                            <span className="text-slate-400 mx-2">→</span>
                            <span className={acfPacf.ljungBox?.hasArchEffects ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                                {acfPacf.ljungBox?.hasArchEffects
                                    ? '✓ Volatility clustering detected — GARCH is appropriate'
                                    : '✗ No significant clustering — GARCH may not add value'}
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="text-sm text-red-400">ACF/PACF failed: {acfPacf.error}</div>
                )}
            </section>

            {/* ── 3. Rolling Volatility ────────────────────────── */}
            <section>
                <SectionHeader
                    icon={<Activity className="w-5 h-5 text-emerald-400" />}
                    title="Rolling Volatility"
                    badge={rollingVol.volRegime}
                    badgeColor={
                        rollingVol.volRegime === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                            rollingVol.volRegime === 'LOW' ? 'bg-emerald-500/20 text-emerald-400' :
                                'bg-slate-700 text-slate-300'
                    }
                />
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <MetricCard label="20-Day σ" value={`${rollingVol.currentVol20d}%`} sub="Annualized" color="text-cyan-400" />
                    <MetricCard label="60-Day σ" value={rollingVol.currentVol60d ? `${rollingVol.currentVol60d}%` : '—'} sub="Annualized" color="text-purple-400" />
                    <MetricCard
                        label="Vol Percentile"
                        value={`${rollingVol.volPercentileRank}th`}
                        sub="vs own history"
                        color={Number(rollingVol.volPercentileRank) > 75 ? 'text-red-400' : Number(rollingVol.volPercentileRank) < 25 ? 'text-emerald-400' : 'text-slate-100'}
                    />
                </div>
                {rollingVol.series.length > 0 && (
                    <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={rollingVol.series}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: 12 }} />
                                <Legend verticalAlign="top" height={24} />
                                <Line type="monotone" dataKey="vol20d" stroke={COLORS.cyan} strokeWidth={1.5} dot={false} name="20-Day σ" />
                                <Line type="monotone" dataKey="vol60d" stroke={COLORS.purple} strokeWidth={1.5} dot={false} name="60-Day σ" connectNulls />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </section>

            {/* ── 4. Regime Detection (HMM) ───────────────────── */}
            <section>
                <SectionHeader
                    icon={<Layers className="w-5 h-5 text-amber-400" />}
                    title="Regime Detection (HMM)"
                    badge={regimes.fitted ? regimes.currentRegimeLabel : 'Not Fitted'}
                    badgeColor={
                        regimes.currentRegime === 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }
                />
                {regimes.fitted ? (
                    <>
                        {/* State Cards */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            {regimes.states?.map(s => (
                                <div key={s.id} className={`rounded-lg p-4 border ${s.id === regimes.currentRegime ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-700/50 bg-slate-800/30'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`w-3 h-3 rounded-full ${s.id === 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                        <span className="font-bold text-slate-100">{s.label}</span>
                                        {s.id === regimes.currentRegime && (
                                            <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">CURRENT ({(regimes.currentProbability! * 100).toFixed(0)}%)</span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div><span className="text-slate-500">Return: </span><span className="text-slate-200">{s.annualizedReturn}%</span></div>
                                        <div><span className="text-slate-500">Vol: </span><span className="text-slate-200">{s.annualizedVol}%</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Transition Matrix */}
                        {regimes.transitionMatrix && (
                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30 mb-4">
                                <div className="text-xs text-slate-400 mb-2">Transition Probability Matrix</div>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr>
                                            <th className="text-left text-slate-500 pr-4">From ↓ / To →</th>
                                            {regimes.states?.map(s => <th key={s.id} className="text-center text-slate-400 px-4">{s.label}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {regimes.transitionMatrix.map((row, i) => (
                                            <tr key={i}>
                                                <td className="text-slate-400 py-1">{regimes.states?.[i].label}</td>
                                                {row.map((val, j) => (
                                                    <td key={j} className="text-center py-1">
                                                        <span className={`font-mono ${i === j ? 'text-emerald-400 font-bold' : 'text-slate-300'}`}>
                                                            {(val * 100).toFixed(1)}%
                                                        </span>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {/* Regime Timeline */}
                        {regimes.timeline && regimes.timeline.length > 0 && (
                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                                <div className="text-xs text-slate-400 mb-2">Regime Timeline (Last 252 Days)</div>
                                <ResponsiveContainer width="100%" height={80}>
                                    <BarChart data={regimes.timeline} barSize={3}>
                                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: 11 }} formatter={(val: number) => regimes.states?.[val]?.label || `State ${val}`} />
                                        <Bar dataKey="regime" name="Regime">
                                            {regimes.timeline.map((entry, i) => (
                                                <Cell key={i} fill={entry.regime === 0 ? COLORS.emerald : COLORS.red} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-sm text-red-400">HMM fitting failed: {regimes.error}</div>
                )}
            </section>

            {/* ── 5. Correlation Matrix ────────────────────────── */}
            <section>
                <SectionHeader
                    icon={<GitBranch className="w-5 h-5 text-indigo-400" />}
                    title="Correlation Matrix"
                />
                {correlation.computed ? (
                    <>
                        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30 mb-4 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr>
                                        <th className="text-left text-slate-500 pr-4"></th>
                                        {correlation.symbols?.map(s => <th key={s} className="text-center text-slate-400 px-3">{s}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {correlation.matrix?.map((row, i) => (
                                        <tr key={i}>
                                            <td className="text-slate-400 py-1 pr-4 font-medium">{correlation.symbols?.[i]}</td>
                                            {row.map((val, j) => {
                                                const abs = Math.abs(val);
                                                const bg = i === j ? 'bg-slate-700/50' :
                                                    abs > 0.7 ? 'bg-red-500/20' :
                                                        abs > 0.4 ? 'bg-amber-500/15' :
                                                            'bg-slate-800/20';
                                                return (
                                                    <td key={j} className={`text-center py-1 px-3 ${bg} rounded`}>
                                                        <span className={`font-mono text-xs ${val > 0.7 ? 'text-red-400' : val < -0.3 ? 'text-cyan-400' : 'text-slate-200'}`}>
                                                            {val.toFixed(3)}
                                                        </span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Rolling Correlation Chart */}
                        {correlation.rollingCorrelation && Object.keys(correlation.rollingCorrelation).length > 0 && (
                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                                <div className="text-xs text-slate-400 mb-2">Rolling 60-Day Correlation vs Target</div>
                                <ResponsiveContainer width="100%" height={180}>
                                    <LineChart>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v: string) => v.slice(5)} allowDuplicatedCategory={false} interval="preserveStartEnd" />
                                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={[-1, 1]} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: 12 }} />
                                        <Legend verticalAlign="top" height={24} />
                                        <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                                        {Object.entries(correlation.rollingCorrelation).map(([sym, series], idx) => (
                                            <Line
                                                key={sym}
                                                data={series}
                                                type="monotone"
                                                dataKey="correlation"
                                                stroke={[COLORS.cyan, COLORS.purple, COLORS.amber, COLORS.emerald][idx % 4]}
                                                strokeWidth={1.5}
                                                dot={false}
                                                name={sym}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-sm text-slate-500 bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                        {correlation.message || 'Add correlation symbols above and re-run to see the correlation matrix.'}
                    </div>
                )}
            </section>
        </div>
    );
};

export default AdvancedAnalysis;
