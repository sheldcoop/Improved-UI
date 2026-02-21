import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Sliders, Play, GitBranch, Target, ArrowRight, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { runOptimization, runWFO, runAutoTune } from '../services/optimizationService';
import { OptimizationResult, WFOResult } from '../types';
import { useBacktestContext } from '../context/BacktestContext';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { formatDateDisplay } from '../utils/dateUtils';
import { DateInput } from '../components/ui/DateInput';

interface ParamConfig {
    id: string;
    name: string;
    min: number;
    max: number;
    step: number;
}

const PRESET_NAMES: Record<string, string> = {
    '1': 'RSI Mean Reversion',
    '3': 'MACD Crossover',
};

const Optimization: React.FC = () => {
    const navigate = useNavigate();
    const {
        symbol, strategyId, customStrategies, setParams: setGlobalParams, startDate, endDate,
        timeframe, paramRanges,
        autoTuneConfig, setAutoTuneConfig,
        wfoConfig, setWfoConfig,
        capital, commission, slippage, pyramiding, positionSizing, positionSizeValue,
        stopLossPct, takeProfitPct, useTrailingStop
    } = useBacktestContext();

    // Auto-Tune is the default — it's the only valid out-of-sample workflow
    const [activeTab, setActiveTab] = useState<'AUTOTUNE' | 'WFO' | 'GRID'>('AUTOTUNE');
    const [results, setResults] = useState<{ grid: OptimizationResult[], wfo: WFOResult[], period?: string, bestParams?: Record<string, number> } | null>(null);
    const [running, setRunning] = useState(false);
    const [optunaMetric, setOptunaMetric] = useState('sharpe');

    const [params, setParams] = useState<ParamConfig[]>([]);

    const strategyName =
        customStrategies.find(s => s.id === strategyId)?.name ??
        PRESET_NAMES[strategyId] ??
        'Strategy';

    // Auto-sync params when strategyId or customStrategies change
    React.useEffect(() => {
        const strategy = customStrategies.find(s => s.id === strategyId);
        if (strategy && strategy.params) {
            const initialParams = strategy.params.map((p, idx) => ({
                id: idx.toString(),
                name: p.name,
                min: p.type === 'float' ? p.default / 2 : Math.max(1, Math.floor(p.default / 2)),
                max: p.type === 'float' ? p.default * 1.5 : Math.ceil(p.default * 1.5),
                step: p.type === 'float' ? 0.1 : 1
            }));
            setParams(initialParams);
        } else {
            const builtinRanges: Record<string, Record<string, { min: number; max: number; step: number }>> = {
                '1': { period: { min: 5, max: 30, step: 1 }, lower: { min: 10, max: 40, step: 1 }, upper: { min: 60, max: 90, step: 1 } },
                '3': { fast: { min: 5, max: 20, step: 1 }, slow: { min: 15, max: 50, step: 1 }, signal: { min: 3, max: 15, step: 1 } },
            };
            const source = Object.keys(paramRanges).length > 0 ? paramRanges : (builtinRanges[strategyId] ?? {});
            const presetParams = Object.entries(source).map(([name, range], idx) => ({
                id: idx.toString(),
                name,
                min: range.min,
                max: range.max,
                step: range.step
            }));
            setParams(presetParams);
        }
    }, [strategyId, customStrategies, paramRanges]);

    const updateParam = (id: string, field: keyof ParamConfig, value: string | number) =>
        setParams(params.map(p => p.id === id ? { ...p, [field]: value } : p));

    const applyParamsAndRun = (paramSet: Record<string, number>) => {
        setGlobalParams(paramSet);
    };

    const handleRun = async () => {
        setRunning(true);
        setResults(null);

        const ranges = params.reduce((acc, p) => {
            acc[p.name] = { min: p.min, max: p.max, step: p.step };
            return acc;
        }, {} as any);

        const configPayload = {
            initial_capital: capital, commission, slippage, pyramiding,
            positionSizing, positionSizeValue, stopLossPct, takeProfitPct, useTrailingStop
        };

        try {
            if (activeTab === 'GRID') {
                const optConfig = {
                    n_trials: 30,
                    scoring_metric: optunaMetric,
                    startDate,
                    endDate,
                    timeframe,
                    config: configPayload
                };
                const res = await runOptimization(symbol || 'NIFTY 50', strategyId || '1', ranges, optConfig);
                setResults({ grid: res.grid, wfo: [], bestParams: res.bestParams });
            } else if (activeTab === 'AUTOTUNE') {
                const res = await runAutoTune(symbol || 'NIFTY 50', strategyId || '1', ranges, startDate || '2026-01-01', autoTuneConfig.lookbackMonths || 6, autoTuneConfig.metric || optunaMetric, { timeframe, ...configPayload });
                setResults({ grid: res.grid, wfo: [], period: res.period, bestParams: res.bestParams });
                setGlobalParams(res.bestParams);
            } else {
                const wfoRes = await runWFO(symbol || 'NIFTY 50', strategyId || '1', ranges, wfoConfig, configPayload);
                setResults({ grid: [], wfo: wfoRes });
            }
        } catch (e) {
            alert("Optimization failed: " + e);
        }
        setRunning(false);
    };

    // ── Right-panel content per tab ──────────────────────────────────────────

    const RightPanelAutoTune = () => (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-semibold text-slate-200 mb-1">How Auto-Tune works</h3>
                <p className="text-xs text-slate-400">
                    Optuna searches <span className="text-emerald-400 font-medium">{autoTuneConfig.lookbackMonths} months of data before your start date</span> — data your backtest will never touch. Parameters found here are genuinely out-of-sample.
                </p>
            </div>

            {/* Timeline diagram */}
            <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">Timeline</span>
                <div className="flex h-8 rounded overflow-hidden text-[10px] font-bold">
                    <div className="flex items-center justify-center bg-indigo-600/30 border border-indigo-600/50 text-indigo-300 flex-1 px-2">
                        Lookback Window
                    </div>
                    <div className="w-px bg-slate-500" />
                    <div className="flex items-center justify-center bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 flex-1 px-2">
                        Your Backtest Range
                    </div>
                </div>
                <div className="flex text-[9px] text-slate-500 mt-1">
                    <div className="flex-1 text-center">Params optimized here</div>
                    <div className="flex-1 text-center">Tested here (never seen)</div>
                </div>
            </div>

            <div className="flex items-start space-x-2 text-xs text-emerald-400 bg-emerald-900/10 border border-emerald-900/40 rounded p-3">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>No lookahead bias. Parameters found on unseen data produce honest backtest results.</span>
            </div>
        </div>
    );

    const RightPanelWFO = () => (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-semibold text-slate-200 mb-1">Walk-Forward Validation</h3>
                <p className="text-xs text-slate-400">
                    Divides your date range into rolling <span className="text-indigo-400 font-medium">train → test</span> windows. The most rigorous way to validate a strategy.
                </p>
            </div>

            {/* Rolling window diagram */}
            <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Rolling Windows</span>
                {[0, 1, 2].map(i => (
                    <div key={i} className="flex h-6 rounded overflow-hidden text-[9px] font-bold" style={{ marginLeft: `${i * 16}px` }}>
                        <div className="flex items-center justify-center bg-indigo-600/30 border border-indigo-600/50 text-indigo-300 flex-[3] px-1">
                            Train
                        </div>
                        <div className="w-px bg-slate-600" />
                        <div className="flex items-center justify-center bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 flex-1 px-1">
                            Test
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-start space-x-2 text-xs text-indigo-300 bg-indigo-900/10 border border-indigo-900/40 rounded p-3">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Out-of-sample performance across multiple periods — the gold standard for strategy validation.</span>
            </div>
        </div>
    );

    const RightPanelGrid = () => (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-semibold text-slate-200 mb-1">Manual Optuna Search</h3>
                <p className="text-xs text-slate-400">
                    Runs 30 TPE trials over your full backtest range to surface the top 10 parameter configurations.
                </p>
            </div>

            <div className="flex items-start space-x-3 bg-amber-950/40 border border-amber-700/50 rounded-lg p-4">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                    <p className="text-xs font-semibold text-amber-300 mb-1">Overfitting Risk</p>
                    <p className="text-[11px] text-amber-400/80">
                        This method optimizes on the <em>same data</em> your backtest uses. Results look great in-sample but may not generalize. Use <strong>Auto-Tune</strong> or <strong>Walk-Forward</strong> for unbiased results.
                    </p>
                </div>
            </div>

            <div className="flex items-start space-x-2 text-xs text-slate-400 bg-slate-900/50 border border-slate-800 rounded p-3">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Best for research, exploring parameter sensitivity, or when you understand the in-sample limitation.</span>
            </div>
        </div>
    );

    return (
        <div className="w-full h-full flex flex-col space-y-6 max-w-7xl mx-auto">

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100">Optimization Engine</h2>
                    <p className="text-emerald-400 text-sm mt-1 flex items-center">
                        <Target className="w-4 h-4 mr-1" />
                        Targeting <strong className="mx-1">{strategyName}</strong> on <strong className="mx-1">{symbol || 'Asset'}</strong> — backtest starts <strong className="ml-1">{formatDateDisplay(startDate)}</strong>
                    </p>
                </div>

                {/* Tab bar — Auto-Tune first, Manual Optuna last */}
                <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-1 rounded-lg shrink-0">
                    <button
                        onClick={() => setActiveTab('AUTOTUNE')}
                        className={`flex items-center px-3 py-1.5 rounded text-xs font-semibold transition-colors ${activeTab === 'AUTOTUNE'
                            ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
                            : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <Target className="w-3.5 h-3.5 mr-1.5" />
                        Auto-Tune
                        <span className="ml-1.5 text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1 py-0.5 rounded font-bold tracking-wide">REC</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('WFO')}
                        className={`flex items-center px-3 py-1.5 rounded text-xs font-semibold transition-colors ${activeTab === 'WFO'
                            ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/40'
                            : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <GitBranch className="w-3.5 h-3.5 mr-1.5" />
                        Walk-Forward
                    </button>

                    <button
                        onClick={() => setActiveTab('GRID')}
                        className={`flex items-center px-3 py-1.5 rounded text-xs font-semibold transition-colors ${activeTab === 'GRID'
                            ? 'bg-slate-700 text-slate-200 border border-slate-600'
                            : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Sliders className="w-3.5 h-3.5 mr-1.5" />
                        Advanced
                    </button>
                </div>
            </div>

            {/* Config + Right panel */}
            {!results && !running && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Parameter configuration (shared by all tabs) */}
                    <Card title="Hyperparameter Search Space">
                        <div className="space-y-6">
                            <div className="space-y-3">
                                {params.map((param) => (
                                    <div key={param.id} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded border border-slate-800">
                                        <div className="col-span-4">
                                            <span className="text-sm font-medium text-slate-300 ml-2">
                                                {param.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                            </span>
                                        </div>
                                        <div className="col-span-8 grid grid-cols-3 gap-3">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-slate-500 mb-1">Min</span>
                                                <input type="number" step={param.step} value={param.min} onChange={(e) => updateParam(param.id, 'min', parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-slate-500 mb-1">Max</span>
                                                <input type="number" step={param.step} value={param.max} onChange={(e) => updateParam(param.id, 'max', parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-slate-500 mb-1">Step</span>
                                                <input type="number" step={param.step} value={param.step} onChange={(e) => updateParam(param.id, 'step', parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {params.length === 0 && (
                                    <div className="text-sm text-yellow-500 p-4 bg-yellow-900/20 rounded border border-yellow-900">
                                        No tunable parameters defined for this strategy.
                                    </div>
                                )}
                            </div>

                            {/* Tab-specific controls */}
                            <div className="pt-4 border-t border-slate-800 space-y-3">
                                {(activeTab === 'AUTOTUNE' || activeTab === 'GRID') && (
                                    <div>
                                        <label className="text-xs text-slate-500 block mb-1">Scoring Metric</label>
                                        <select
                                            value={optunaMetric}
                                            onChange={(e) => setOptunaMetric(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 outline-none"
                                        >
                                            <option value="sharpe">Maximize Sharpe Ratio</option>
                                            <option value="calmar">Maximize Calmar Ratio</option>
                                            <option value="total_return">Maximize Total Return</option>
                                            <option value="drawdown">Minimize Max Drawdown</option>
                                        </select>
                                    </div>
                                )}

                                {activeTab === 'AUTOTUNE' && (
                                    <div>
                                        <label className="text-xs text-slate-500 block mb-1">Lookback Window (Months)</label>
                                        <div className="flex items-center space-x-3">
                                            <input
                                                type="number"
                                                min="3"
                                                max="36"
                                                className="w-24 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:border-emerald-500 outline-none"
                                                value={autoTuneConfig.lookbackMonths}
                                                onChange={(e) => setAutoTuneConfig({ ...autoTuneConfig, lookbackMonths: parseInt(e.target.value) })}
                                            />
                                            <span className="text-xs text-slate-500">
                                                months before <span className="text-slate-300">{formatDateDisplay(startDate)}</span>
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'WFO' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-slate-500 block mb-1">Train Window (Months)</label>
                                            <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:border-indigo-500 outline-none" value={wfoConfig.trainWindow} onChange={(e) => setWfoConfig({ ...wfoConfig, trainWindow: parseInt(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-500 block mb-1">Test Window (Months)</label>
                                            <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:border-indigo-500 outline-none" value={wfoConfig.testWindow} onChange={(e) => setWfoConfig({ ...wfoConfig, testWindow: parseInt(e.target.value) })} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleRun}
                                className={`w-full py-4 mt-2 rounded-xl font-bold text-white flex items-center justify-center transition-colors ${activeTab === 'AUTOTUNE'
                                    ? 'bg-emerald-600 hover:bg-emerald-500'
                                    : activeTab === 'WFO'
                                        ? 'bg-indigo-600 hover:bg-indigo-500'
                                        : 'bg-slate-700 hover:bg-slate-600'}`}
                            >
                                <Play className="w-5 h-5 mr-2" />
                                {activeTab === 'AUTOTUNE' ? 'Run Auto-Tune' : activeTab === 'WFO' ? 'Start Walk-Forward Analysis' : 'Start Manual Optuna Study'}
                            </button>
                        </div>
                    </Card>

                    {/* Right: Contextual explanation */}
                    <div className="flex flex-col justify-center p-6 bg-slate-950/50 rounded-xl border border-slate-800">
                        {activeTab === 'AUTOTUNE' && <RightPanelAutoTune />}
                        {activeTab === 'WFO' && <RightPanelWFO />}
                        {activeTab === 'GRID' && <RightPanelGrid />}
                    </div>
                </div>
            )}

            {/* Running state */}
            {running && (
                <Card className="flex flex-col items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
                    <h3 className="text-lg font-medium text-slate-200">
                        {activeTab === 'AUTOTUNE' ? 'Finding optimal parameters on unseen data...' : activeTab === 'WFO' ? 'Processing rolling WFO windows...' : 'Running Optuna trials...'}
                    </h3>
                    <p className="text-slate-400 text-sm mt-1">
                        {activeTab === 'AUTOTUNE' ? `Searching ${autoTuneConfig.lookbackMonths}-month lookback window` : activeTab === 'WFO' ? 'Train → Test across all windows' : 'Maximizing objective across 30 trials'}
                    </p>
                </Card>
            )}

            {/* AUTO-TUNE RESULTS */}
            {results && activeTab === 'AUTOTUNE' && (
                <div className="max-w-xl mx-auto space-y-4">
                    <Card className="text-center py-12 border-emerald-500 border">
                        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-slate-100 mb-1">Auto-Tuned Successfully</h3>
                        {results.period && (
                            <p className="text-xs text-slate-500 mb-4">
                                Optimized on: <span className="text-slate-300">{results.period}</span>
                            </p>
                        )}
                        <p className="text-slate-400 mb-6">Found optimal parameters on out-of-sample data. Your Backtest settings have been pre-filled.</p>

                        <div className="flex justify-center flex-wrap gap-2 mb-8">
                            {Object.entries(results.bestParams || {}).map(([k, v]) => (
                                <div key={k} className="bg-slate-900 border border-slate-700 px-4 py-2 rounded">
                                    <span className="text-xs text-slate-500 block uppercase tracking-wider">{k}</span>
                                    <span className="text-lg font-mono text-emerald-400">{v as React.ReactNode}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-center space-x-4">
                            <Button variant="secondary" onClick={() => setResults(null)}>Tune Again</Button>
                            <Button
                                variant="primary"
                                onClick={() => navigate('/backtest', { state: { autoRun: true } })}
                                icon={<Play className="w-4 h-4" />}
                            >
                                Run Complete Backtest
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* GRID RESULTS */}
            {results && activeTab === 'GRID' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-bold text-slate-200">Top Configurations Found</h3>
                            <p className="text-xs text-amber-400 flex items-center mt-1">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                In-sample results — verify with Auto-Tune or Walk-Forward before trading
                            </p>
                        </div>
                        <Button variant="secondary" onClick={() => setResults(null)}>Reset</Button>
                    </div>
                    <Card className="p-0 overflow-hidden">
                        <table className="w-full text-left text-sm text-slate-400">
                            <thead className="bg-slate-950 text-slate-200">
                                <tr>
                                    <th className="p-4 rounded-tl-lg">Rank</th>
                                    <th className="p-4">Parameter Set</th>
                                    <th className="p-4">Score ({optunaMetric})</th>
                                    <th className="p-4">Win Rate</th>
                                    <th className="p-4">Drawdown</th>
                                    <th className="p-4">Trades</th>
                                    <th className="p-4 text-right rounded-tr-lg">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {results.grid?.slice(0, 10).map((res, idx) => (
                                    <tr key={idx} className="hover:bg-slate-800/50 group transition-colors">
                                        <td className="p-4 font-bold text-emerald-500">#{idx + 1}</td>
                                        <td className="p-4 font-mono text-xs text-slate-300">
                                            <div className="flex gap-2 flex-wrap">
                                                {Object.entries(res.paramSet).map(([k, v]) => (
                                                    <span key={k} className="bg-slate-950 border border-slate-700 px-2 py-0.5 rounded">
                                                        {k}: <span className="text-indigo-400">{v as React.ReactNode}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="p-4 text-slate-100 font-medium">{res.score.toFixed(4)}</td>
                                        <td className="p-4">{res.winRate?.toFixed(1)}%</td>
                                        <td className="p-4"><span className="text-red-400">-{res.drawdown?.toFixed(2)}%</span></td>
                                        <td className="p-4">{res.trades}</td>
                                        <td className="p-4 text-right">
                                            <Button size="sm" onClick={() => applyParamsAndRun(res.paramSet)} className="opacity-0 group-hover:opacity-100 transition-opacity" icon={<ArrowRight className="w-4 h-4" />}>Apply</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Card>
                </div>
            )}

            {/* WFO RESULTS */}
            {results && activeTab === 'WFO' && (
                <div className="grid grid-cols-1 gap-6">
                    <Card title="Out-of-Sample Performance (Test Windows)">
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={results.wfo}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                    <XAxis dataKey="period" stroke="#64748b" />
                                    <YAxis stroke="#64748b" />
                                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                                    <Bar dataKey="returnPct" name="Return %" fill="#6366f1" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <Card title="Walk-Forward Log">
                        <table className="w-full text-left text-sm text-slate-400">
                            <thead className="bg-slate-950 text-slate-200">
                                <tr>
                                    <th className="p-3">Window</th>
                                    <th className="p-3">Optimal Params</th>
                                    <th className="p-3">OOS Sharpe</th>
                                    <th className="p-3">OOS Return</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {(results.wfo || []).map((res: any, idx) => (
                                    <tr key={idx}>
                                        <td className="p-3">{res.period}</td>
                                        <td className="p-3 font-mono text-xs text-slate-300">{res.params}</td>
                                        <td className="p-3">{res.sharpe?.toFixed(2)}</td>
                                        <td className={`p-3 font-bold ${(res.returnPct || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {res.returnPct?.toFixed(2)}%
                                        </td>
                                        <td className="p-3"><Badge variant="info">Verified</Badge></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Card>
                    <Button variant="secondary" onClick={() => setResults(null)} className="w-full">Back to Config</Button>
                </div>
            )}
        </div>
    );
};

export default Optimization;
