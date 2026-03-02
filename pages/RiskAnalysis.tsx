import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Play, TrendingDown, Activity, AlertTriangle, Shuffle, BookOpen } from 'lucide-react';
import { runMonteCarlo, runMonteCarloFromTrades } from '../services/api';
import { MonteCarloResult } from '../types';
import { MonteCarloGuide } from '../components/montecarlo/MonteCarloGuide';
import {
    ResponsiveContainer, ComposedChart, Area, Line,
    XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';

const COMMON_SYMBOLS = [
    'NIFTY 50', 'BANKNIFTY', 'SENSEX',
    'RELIANCE', 'HDFCBANK', 'INFY', 'TCS', 'ICICIBANK',
    'SBIN', 'MARUTI', 'DLF', 'DIXON', 'PNB',
];

/** Compute percentile bands from paths at each time step */
function computeBands(paths: { values: number[] }[]) {
    if (!paths.length) return [];
    const n = paths[0].values.length;
    return Array.from({ length: n }, (_, i) => {
        const vals = paths.map(p => p.values[i]).sort((a, b) => a - b);
        const p = (q: number) => vals[Math.max(0, Math.floor(q * (vals.length - 1)))];
        return { i, p5: p(0.05), p25: p(0.25), p50: p(0.50), p75: p(0.75), p95: p(0.95) };
    });
}

const StatBox: React.FC<{ label: string; value: string; sub?: string; bad?: boolean }> = ({ label, value, sub, bad }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</div>
        <div className={`text-xl font-bold font-mono ${bad ? 'text-red-400' : 'text-emerald-400'}`}>{value}</div>
        {sub && <div className="text-[10px] text-slate-600 mt-1">{sub}</div>}
    </div>
);

const RiskAnalysis: React.FC = () => {
    const location = useLocation();

    // Pre-loaded state from Results page (Phase 3)
    const fromBacktest: { tradeReturns: number[]; symbol: string; strategyName: string } | null =
        (location.state as any)?.mcData ?? null;

    const [mode, setMode] = useState<'GBM' | 'TRADES'>(fromBacktest ? 'TRADES' : 'GBM');
    const [symbol, setSymbol] = useState(fromBacktest?.symbol ?? 'NIFTY 50');
    const [simulations, setSimulations] = useState(200);
    const [volMultiplier, setVolMultiplier] = useState(1.0);
    const [useFatTails, setUseFatTails] = useState(false);
    const [result, setResult] = useState<MonteCarloResult | null>(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'SIMULATOR' | 'GUIDE'>('SIMULATOR');

    // Auto-run when arriving from Results page
    useEffect(() => {
        if (fromBacktest) handleRun();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRun = async () => {
        setRunning(true);
        setError(null);
        try {
            let res: MonteCarloResult;
            if (mode === 'TRADES' && fromBacktest?.tradeReturns?.length) {
                res = await runMonteCarloFromTrades(fromBacktest.tradeReturns, simulations);
            } else {
                res = await runMonteCarlo(simulations, volMultiplier, symbol, useFatTails);
            }
            setResult(res);
        } catch (e: any) {
            setError(e?.message || 'Simulation failed');
        } finally {
            setRunning(false);
        }
    };

    const bands = useMemo(() => computeBands(result?.paths ?? []), [result]);
    const stats = result?.stats;

    const chartData = bands.map(b => ({
        name: b.i,
        band_outer: [b.p5, b.p95] as [number, number],
        band_inner: [b.p25, b.p75] as [number, number],
        median: b.p50,
    }));

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100">Risk Analysis (Monte Carlo)</h2>
                    <p className="text-slate-400 text-sm">
                        {fromBacktest
                            ? `Trade-sequence stress test for: ${fromBacktest.strategyName}`
                            : 'Stress test strategies using Monte Carlo simulations.'}
                    </p>
                </div>
                {/* Tab Controls */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex">
                    <button
                        onClick={() => setActiveTab('SIMULATOR')}
                        className={`flex items-center px-4 py-2 text-sm font-medium rounded ${activeTab === 'SIMULATOR' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Activity className="w-4 h-4 mr-2" /> Simulator
                    </button>
                    <button
                        onClick={() => setActiveTab('GUIDE')}
                        className={`flex items-center px-4 py-2 text-sm font-medium rounded ${activeTab === 'GUIDE' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                    >
                        <BookOpen className="w-4 h-4 mr-2" /> How to Use
                    </button>
                </div>
            </div>

            {activeTab === 'GUIDE' && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <MonteCarloGuide />
                </div>
            )}

            {activeTab === 'SIMULATOR' && (
                <>
                    {fromBacktest && (
                        <div className="flex items-center gap-2 bg-indigo-900/20 border border-indigo-700/40 rounded-lg px-4 py-2 text-sm text-indigo-300 mb-6">
                            <Shuffle className="w-4 h-4 shrink-0" />
                            <span>
                                Loaded <strong>{fromBacktest.tradeReturns.length} trades</strong> from "{fromBacktest.strategyName}" ({fromBacktest.symbol}).
                                Running trade-sequence bootstrap — shuffling your actual trades to test sequence-of-returns risk.
                            </span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Config Panel */}
                        <div className="lg:col-span-1 space-y-4">
                            <Card title="Configuration">
                                <div className="space-y-4">
                                    {/* Mode toggle */}
                                    <div>
                                        <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Simulation Mode</label>
                                        <div className="flex rounded-lg overflow-hidden border border-slate-700">
                                            <button
                                                onClick={() => setMode('GBM')}
                                                className={`flex-1 text-xs py-2 font-medium transition-colors ${mode === 'GBM' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}
                                            >
                                                Price Path
                                            </button>
                                            <button
                                                onClick={() => setMode('TRADES')}
                                                disabled={!fromBacktest}
                                                title={!fromBacktest ? 'Run a backtest first to use this mode' : ''}
                                                className={`flex-1 text-xs py-2 font-medium transition-colors ${mode === 'TRADES' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'} disabled:opacity-40 disabled:cursor-not-allowed`}
                                            >
                                                Trade Seq
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-600 mt-1">
                                            {mode === 'GBM'
                                                ? 'GBM forward simulation from historical volatility.'
                                                : 'Bootstraps actual trade returns to reveal sequence risk.'}
                                        </p>
                                    </div>

                                    {/* Symbol — only for GBM mode */}
                                    {mode === 'GBM' && (
                                        <div>
                                            <label className="text-xs text-slate-500 block mb-1">Symbol</label>
                                            <input
                                                list="mc-symbol-list"
                                                value={symbol}
                                                onChange={e => setSymbol(e.target.value.toUpperCase())}
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
                                            />
                                            <datalist id="mc-symbol-list">
                                                {COMMON_SYMBOLS.map(s => <option key={s} value={s} />)}
                                            </datalist>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-xs text-slate-500 block mb-1">Simulations</label>
                                        <select
                                            value={simulations}
                                            onChange={e => setSimulations(parseInt(e.target.value))}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200"
                                        >
                                            <option value="100">100 paths</option>
                                            <option value="200">200 paths</option>
                                            <option value="500">500 paths</option>
                                            <option value="1000">1000 paths (slow)</option>
                                        </select>
                                    </div>

                                    {/* Vol multiplier — only for GBM */}
                                    {mode === 'GBM' && (
                                        <>
                                            <div>
                                                <label className="text-xs text-slate-500 block mb-1">
                                                    Volatility Stress <span className="text-emerald-400 font-mono">{volMultiplier}×</span>
                                                </label>
                                                <input
                                                    type="range" min="0.5" max="3.0" step="0.1"
                                                    value={volMultiplier}
                                                    onChange={e => setVolMultiplier(parseFloat(e.target.value))}
                                                    className="w-full accent-emerald-500"
                                                />
                                                <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                                                    <span>0.5× calm</span><span>3× stress</span>
                                                </div>
                                            </div>

                                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800/80 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={useFatTails}
                                                    onChange={e => setUseFatTails(e.target.checked)}
                                                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/50"
                                                />
                                                <div className="flex-1">
                                                    <div className="text-sm text-slate-200 font-medium">Enable Fat-Tail Shocks</div>
                                                    <div className="text-[10px] text-slate-500 leading-snug">Injects random catastrophic market crashes (Jump Diffusion) into price paths.</div>
                                                </div>
                                            </label>
                                        </>
                                    )}

                                    <Button onClick={handleRun} disabled={running} className="w-full py-3" icon={<Play className="w-4 h-4" />}>
                                        {running ? 'Simulating...' : 'Run Simulation'}
                                    </Button>

                                    {error && (
                                        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
                                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                                            <span>{error}</span>
                                        </div>
                                    )}
                                </div>
                            </Card>

                            {/* Interpretation guide */}
                            <Card title="How to Read">
                                <div className="space-y-2 text-xs text-slate-400">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-2 rounded bg-emerald-500/20 border border-emerald-500/40 shrink-0" />
                                        <span>Middle 50% of outcomes (P25–P75)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-2 rounded bg-slate-500/10 border border-slate-600/30 shrink-0" />
                                        <span>Full range P5–P95</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-0.5 bg-emerald-400 shrink-0" />
                                        <span>Median (P50)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-0.5 border-t border-dashed border-slate-500 shrink-0" />
                                        <span>Break-even (100)</span>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Chart + Stats */}
                        <div className="lg:col-span-3 space-y-4">
                            {/* Stats row */}
                            {stats && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <StatBox
                                        label="VaR 95%"
                                        value={`${stats.var95 >= 0 ? '+' : ''}${stats.var95.toFixed(1)}%`}
                                        sub="Worst 5% outcome"
                                        bad={stats.var95 < 0}
                                    />
                                    <StatBox
                                        label="CVaR 95%"
                                        value={`${stats.cvar95 >= 0 ? '+' : ''}${stats.cvar95.toFixed(1)}%`}
                                        sub="Avg of worst 5%"
                                        bad={stats.cvar95 < 0}
                                    />
                                    <StatBox
                                        label="Ruin Probability"
                                        value={`${stats.ruin_prob.toFixed(1)}%`}
                                        sub="Paths losing >50%"
                                        bad={stats.ruin_prob > 5}
                                    />
                                    <StatBox
                                        label="Median Return"
                                        value={`${stats.median_return >= 0 ? '+' : ''}${stats.median_return.toFixed(1)}%`}
                                        sub="50th percentile"
                                        bad={stats.median_return < 0}
                                    />
                                </div>
                            )}

                            {/* Chart */}
                            <Card
                                title={`Monte Carlo — ${simulations} Paths`}
                                className="h-[430px] flex flex-col"
                                bodyClassName="flex-1 flex flex-col"
                            >
                                {!result ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                                        <Activity className="w-12 h-12 mb-3 opacity-20" />
                                        <p className="text-sm">Configure settings and click Run Simulation.</p>
                                        {!fromBacktest && (
                                            <p className="text-xs text-slate-700 mt-1">
                                                Tip: run a backtest first, then click "Monte Carlo" on the Results page to load your actual trades.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex-1 w-full min-w-0 min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                                <XAxis
                                                    dataKey="name"
                                                    stroke="#475569"
                                                    fontSize={11}
                                                    tickLine={false}
                                                    label={mode === 'GBM'
                                                        ? { value: 'Trading Days', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 10 }
                                                        : { value: 'Trade #', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 10 }
                                                    }
                                                />
                                                <YAxis
                                                    stroke="#475569"
                                                    fontSize={11}
                                                    tickLine={false}
                                                    tickFormatter={v => `${v.toFixed(0)}`}
                                                    domain={['auto', 'auto']}
                                                />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: 11 }}
                                                    formatter={(val: any, name: string) => {
                                                        if (name === 'median') return [`${Number(val).toFixed(1)}`, 'Median'];
                                                        return [val, name];
                                                    }}
                                                />
                                                {/* Break-even line */}
                                                <ReferenceLine y={100} stroke="#475569" strokeDasharray="4 4" strokeWidth={1} />
                                                {/* P5-P95 outer band */}
                                                <Area
                                                    dataKey="band_outer"
                                                    stroke="none"
                                                    fill="#334155"
                                                    fillOpacity={0.25}
                                                    isAnimationActive={false}
                                                />
                                                {/* P25-P75 inner band */}
                                                <Area
                                                    dataKey="band_inner"
                                                    stroke="none"
                                                    fill="#10b981"
                                                    fillOpacity={0.15}
                                                    isAnimationActive={false}
                                                />
                                                {/* Median line */}
                                                <Line
                                                    dataKey="median"
                                                    stroke="#10b981"
                                                    strokeWidth={2}
                                                    dot={false}
                                                    isAnimationActive={false}
                                                />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </Card>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default RiskAnalysis;
