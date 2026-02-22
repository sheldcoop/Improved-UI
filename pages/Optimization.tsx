import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Sliders, Play, GitBranch, Target, ArrowRight, CheckCircle2, AlertTriangle, Info, Split } from 'lucide-react';
import { runOptimization, runWFO } from '../services/optimizationService';
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
        wfoConfig, setWfoConfig,
        capital, commission, slippage, pyramiding, positionSizing, positionSizeValue,
        stopLossPct, takeProfitPct, useTrailingStop,
        // setters we'll need when applying parameters
        setStopLossPct, setTakeProfitPct, setUseTrailingStop,
        optResults, setOptResults,
        // data status for guard
        dataStatus,
    } = useBacktestContext();

    // Select workflow
    const [activeTab, setActiveTab] = useState<'WFO' | 'GRID'>('GRID');
    // results are stored in context so they survive navigation away from this page
    const [running, setRunning] = useState(false);
    const [optunaMetric, setOptunaMetric] = useState('sharpe');

    const [params, setParams] = useState<ParamConfig[]>([]);
    const [enableRiskSearch, setEnableRiskSearch] = useState(false);
    // Change 5: useTrailingStop added as Phase 2 risk param (0=off, 1=on)
    const [riskParams, setRiskParams] = useState<ParamConfig[]>([
        { id: 'r0', name: 'stopLossPct',     min: 0, max: 5, step: 1 },
        { id: 'r1', name: 'takeProfitPct',   min: 0, max: 5, step: 1 },
        { id: 'r2', name: 'useTrailingStop', min: 0, max: 1, step: 1 },
    ]);
    // when user wants to perform secondary optimisation after picking a primary
    const [selectedParams, setSelectedParams] = useState<Record<string, number> | null>(null);

    // Change 4: data split toggle + slider
    const [enableDataSplit, setEnableDataSplit] = useState(false);
    const [splitRatio, setSplitRatio] = useState(70); // % of data for Phase 1

    const strategyName =
        customStrategies.find(s => s.id === strategyId)?.name ??
        PRESET_NAMES[strategyId] ??
        'Strategy';

    // Auto-sync params when strategyId or customStrategies change
    React.useEffect(() => {
        const strategy = customStrategies.find(s => s.id === strategyId);
        if (strategy && strategy.params) {
            // Change 7: clamp auto-generated ranges to valid RSI bounds
            const initialParams = strategy.params.map((p, idx) => {
                const v = p.default || 1;
                let min = p.type === 'float' ? v / 2 : Math.max(1, Math.floor(v / 2));
                let max = p.type === 'float' ? v * 1.5 : Math.ceil(v * 1.5);
                if (p.name === 'upper')  max = Math.min(99, max);
                if (p.name === 'lower')  max = Math.min(49, max);
                if (p.name === 'period') { min = Math.max(2, min); max = Math.min(100, max); }
                return { id: idx.toString(), name: p.name, min, max, step: p.type === 'float' ? 0.1 : 1 };
            });
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
        // copy parameters into the shared context so the backtest page immediately
        // shows them.  We no longer request an automatic simulation run – the user
        // can review the settings and hit "Run Simulation" manually.
        setGlobalParams(paramSet);

        // if the parameter set includes risk values we store them in their
        // dedicated state variables as well. this ensures the main UI fields
        // (which now sit outside of "params") are populated correctly.
        if (paramSet.stopLossPct !== undefined) {
            setStopLossPct(paramSet.stopLossPct as number);
        }
        if (paramSet.takeProfitPct !== undefined) {
            setTakeProfitPct(paramSet.takeProfitPct as number);
        }
        if (paramSet.useTrailingStop !== undefined) {
            setUseTrailingStop(Boolean(paramSet.useTrailingStop));
        }

        navigate('/backtest', { state: { appliedParams: paramSet } });
    };

    // Change 3: configPayload no longer includes stopLossPct/takeProfitPct/useTrailingStop
    // Phase 1 backend zeroes these; Phase 2 sources them from riskRanges
    const buildConfigPayload = () => ({
        initial_capital: capital,
        commission,
        slippage,
        pyramiding,
        positionSizing,
        positionSizeValue,
    });

    const handleRun = async () => {
        setRunning(true);
        setOptResults(null);

        const ranges = params.reduce((acc, p) => {
            acc[p.name] = { min: p.min, max: p.max, step: p.step };
            return acc;
        }, {} as any);

        try {
            if (activeTab === 'GRID') {
                const optConfig: any = {
                    n_trials: 30,
                    scoring_metric: optunaMetric,
                    startDate,
                    endDate,
                    timeframe,
                    config: buildConfigPayload(),
                    // Change 4: include split ratio when enabled
                    phase2SplitRatio: enableDataSplit ? splitRatio / 100 : 0.0,
                };

                if (enableRiskSearch) {
                    optConfig.riskRanges = riskParams.reduce((acc, p) => {
                        acc[p.name] = { min: p.min, max: p.max, step: p.step };
                        return acc;
                    }, {} as any);
                }

                const res = await runOptimization(symbol || 'NIFTY 50', strategyId || '1', ranges, optConfig);
                setOptResults({ ...res, wfo: [], period: undefined });
                // clear any previous manual selection since we just re-ran full search
                setSelectedParams(null);
            } else if (activeTab === 'WFO') {
                const wfoRes = await runWFO(symbol || 'NIFTY 50', strategyId || '1', ranges, wfoConfig, buildConfigPayload());
                setOptResults({ grid: [], wfo: wfoRes, period: undefined } as any);
            }
        } catch (e) {
            alert("Optimization failed: " + e);
        }
        setRunning(false);
    };


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
                        This method optimizes on the <em>same data</em> your backtest uses. Results look great in-sample but may not generalize. Consider Walk-Forward validation for unbiased estimates.
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
                    {/* Change 6: data status indicator in header */}
                    <p className="text-emerald-400 text-sm mt-1 flex items-center flex-wrap gap-2">
                        <Target className="w-4 h-4 mr-1" />
                        Targeting <strong className="mx-1">{strategyName}</strong> on <strong className="mx-1">{symbol || 'Asset'}</strong> — backtest starts <strong className="ml-1">{formatDateDisplay(startDate)}</strong>
                        {dataStatus === 'READY'
                            ? <span className="text-emerald-400 text-xs font-mono">● Data Ready</span>
                            : <span className="text-yellow-500 text-xs font-mono">● No Data Loaded</span>
                        }
                    </p>
                </div>

                {/* Tab bar — Walk-Forward and Manual Optuna workflows */}
                <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-1 rounded-lg shrink-0">

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
            {!optResults && !running && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Parameter configuration (shared by all tabs) */}
                    <Card title="Hyperparameter Search Space">
                        <div className="space-y-6">
                            <div className="space-y-3">
                                {/* When Phase 2 is enabled, Phase 1 RSI params are FIXED — visually lock them */}
                                {enableRiskSearch && (
                                    <div className="flex items-center space-x-1 text-[10px] text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded px-2 py-1">
                                        <span>🔒</span>
                                        <span>Phase 1 parameters are fixed — Phase 2 will search SL/TP with these RSI values locked.</span>
                                    </div>
                                )}
                                {params.map((param) => (
                                    <div key={param.id} className={`grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded border transition-opacity ${enableRiskSearch ? 'border-slate-800/50 opacity-40 pointer-events-none' : 'border-slate-800'}`}>
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

                                {/* Change 8A: renamed checkbox to make Phase 2 two-step nature explicit */}
                                <div className="mt-4">
                                    <label className="inline-flex items-center space-x-2 cursor-pointer">
                                        <input type="checkbox" checked={enableRiskSearch} onChange={() => setEnableRiskSearch(!enableRiskSearch)} className="form-checkbox" />
                                        <span className="text-sm text-slate-300">Enable Phase 2: Optimize Stop-Loss / Take-Profit after RSI search</span>
                                    </label>
                                </div>

                                {enableRiskSearch && (
                                    <div className="mt-3 space-y-3">
                                        {/* Risk param rows */}
                                        {riskParams.map((param) => (
                                            <div key={param.id} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded border border-slate-800">
                                                <div className="col-span-4">
                                                    <span className="text-sm font-medium text-slate-300 ml-2">
                                                        {param.name === 'useTrailingStop'
                                                            ? 'Trailing Stop (0/1)'
                                                            : param.name.replace(/_/g, ' ').toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="col-span-8 grid grid-cols-3 gap-3">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-slate-500 mb-1">Min</span>
                                                        <input type="number" min="0" step={param.step} value={param.min} onChange={(e) => setRiskParams(riskParams.map(r => r.id === param.id ? {...r, min: parseFloat(e.target.value)} : r))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-slate-500 mb-1">Max</span>
                                                        <input type="number" min="0" step={param.step} value={param.max} onChange={(e) => setRiskParams(riskParams.map(r => r.id === param.id ? {...r, max: parseFloat(e.target.value)} : r))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-slate-500 mb-1">Step</span>
                                                        <input type="number" min="0" step={param.step} value={param.step} onChange={(e) => setRiskParams(riskParams.map(r => r.id === param.id ? {...r, step: parseFloat(e.target.value)} : r))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Change 4: data split toggle + slider */}
                                        <div className="mt-3 p-3 bg-slate-900/50 rounded border border-slate-800">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-sm text-slate-300 flex items-center">
                                                    <Split className="w-3.5 h-3.5 mr-2 text-indigo-400" />
                                                    Split data between phases
                                                </label>
                                                <button
                                                    onClick={() => setEnableDataSplit(!enableDataSplit)}
                                                    className={`w-10 h-5 rounded-full p-1 transition-colors ${enableDataSplit ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                                >
                                                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${enableDataSplit ? 'translate-x-5' : ''}`} />
                                                </button>
                                            </div>
                                            {enableDataSplit && (
                                                <div className="space-y-2 mt-2">
                                                    <div className="flex justify-between text-xs text-slate-400">
                                                        <span>Phase 1 (RSI): <strong className="text-indigo-400">{splitRatio}%</strong></span>
                                                        <span>Phase 2 (SL/TP): <strong className="text-emerald-400">{100 - splitRatio}%</strong></span>
                                                    </div>
                                                    <input
                                                        type="range" min="50" max="90" step="5"
                                                        value={splitRatio}
                                                        onChange={(e) => setSplitRatio(parseInt(e.target.value))}
                                                        className="w-full accent-indigo-500"
                                                    />
                                                    <p className="text-[10px] text-slate-500 italic">
                                                        RSI params found on first {splitRatio}% of bars. SL/TP tuned on remaining {100 - splitRatio}%. Reduces cascading overfitting.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Tab-specific controls */}
                            <div className="pt-4 border-t border-slate-800 space-y-3">
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

                            {/* Change 6: data guard warning + disabled button */}
                            {dataStatus !== 'READY' && (
                                <div className="flex items-start space-x-2 text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700/40 rounded p-3">
                                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    <span>No data loaded. Go to Backtest → select symbol + date range → click "Load Market Data" first.</span>
                                </div>
                            )}

                            <button
                                onClick={handleRun}
                                disabled={running || dataStatus !== 'READY'}
                                className={`w-full py-4 mt-2 rounded-xl font-bold text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${activeTab === 'WFO'
                                    ? 'bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800'
                                    : 'bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800'}`}
                            >
                                <Play className="w-5 h-5 mr-2" />
                                {dataStatus !== 'READY'
                                    ? 'Load Data First'
                                    : activeTab === 'WFO'
                                        ? 'Start Walk-Forward Analysis'
                                        : 'Start Manual Optuna Study'}
                            </button>
                        </div>
                    </Card>

                    {/* Right: Contextual explanation */}
                    <div className="flex flex-col justify-center p-6 bg-slate-950/50 rounded-xl border border-slate-800">
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
                        {activeTab === 'WFO' ? 'Processing rolling WFO windows...' : 'Running Optuna trials...'}
                    </h3>
                    <p className="text-slate-400 text-sm mt-1">
                        {activeTab === 'WFO' ? 'Train → Test across all windows' : 'Maximizing objective across 30 trials'}
                    </p>
                </Card>
            )}



            {/* GRID RESULTS */}
            {optResults && activeTab === 'GRID' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            {/* Change 8B: "Step 1 of 2" label when Phase 2 is enabled */}
                            <h3 className="text-xl font-bold text-slate-200">
                                {enableRiskSearch ? 'Step 1 of 2 — ' : ''}Top Configurations Found
                            </h3>
                            <p className="text-xs text-amber-400 flex items-center mt-1">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                In-sample results — verify with Auto-Tune or Walk-Forward before trading
                            </p>
                        </div>
                        <Button variant="secondary" onClick={() => { setOptResults(null); setSelectedParams(null); }}>Reset</Button>
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
                                {optResults?.grid?.slice(0, 10).map((res, idx) => (
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
                                        <td className="p-4 text-right flex space-x-2 justify-end">
                                            {enableRiskSearch && (
                                                <Button size="sm" variant={selectedParams === res.paramSet ? 'secondary' : 'ghost'} onClick={() => setSelectedParams(res.paramSet)} className="opacity-0 group-hover:opacity-100 transition-opacity" icon={<CheckCircle2 className="w-4 h-4" />}>{selectedParams === res.paramSet ? 'Selected' : 'Choose'}</Button>
                                            )}
                                            <Button size="sm" onClick={() => applyParamsAndRun(res.paramSet)} className="opacity-0 group-hover:opacity-100 transition-opacity" icon={<ArrowRight className="w-4 h-4" />}>Apply</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Card>

                    {/* Change 8C+D: section for sequential risk optimisation with improved UX */}
                    {enableRiskSearch && optResults && activeTab === 'GRID' && (
                        <div className="mt-4 px-4 py-3 rounded bg-slate-800 border border-slate-700">
                            {!selectedParams ? (
                                <p className="text-sm text-slate-300">
                                    <strong className="text-indigo-400">Step 2 of 2</strong> — Pick the best RSI config above and click <strong>Choose</strong>, then <strong>Run SL/TP Search</strong> to find the optimal stop-loss and take-profit for those fixed parameters.
                                </p>
                            ) : (
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Step 2 of 2 — RSI params locked:</p>
                                        <span className="text-sm text-slate-200 font-mono">
                                            {Object.entries(selectedParams).map(([k,v])=>`${k}: ${v}`).join(', ')}
                                        </span>
                                    </div>
                                    {/* Change 6: guard "Run SL/TP search" button too */}
                                    <Button size="sm" disabled={dataStatus !== 'READY'} onClick={async () => {
                                        setRunning(true);
                                        const fixedRanges = Object.fromEntries(
                                            Object.entries(selectedParams!).map(([k,v]) => [k, { min: v, max: v, step: 1 }])
                                        );
                                        const riskRangesObj = riskParams.reduce((acc, p) => {
                                            acc[p.name] = { min: p.min, max: p.max, step: p.step };
                                            return acc;
                                        }, {} as any);
                                        try {
                                            // Change 3: no SL/TP in configPayload here either
                                            const res = await runOptimization(symbol || 'NIFTY 50', strategyId || '1', fixedRanges, {
                                                n_trials: 30,
                                                scoring_metric: optunaMetric,
                                                startDate,
                                                endDate,
                                                timeframe,
                                                config: buildConfigPayload(),
                                                riskRanges: riskRangesObj,
                                                // Change 4: pass split ratio for Phase 2 run too
                                                phase2SplitRatio: enableDataSplit ? splitRatio / 100 : 0.0,
                                            });
                                            // Change 8D: merge results — keep Phase 1 grid visible, add Phase 2 data
                                            setOptResults(prev => ({
                                                ...(prev ?? {}),
                                                ...res,
                                                wfo: [],
                                                period: undefined,
                                            }));
                                        } catch (e) {
                                            alert("Risk optimisation failed: " + e);
                                        }
                                        setRunning(false);
                                    }}>
                                        Run SL/TP Search
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {optResults?.riskGrid && optResults.riskGrid.length > 0 && (
                        <div className="space-y-4 mt-6">
                            {/* Change 8B: "Step 2 of 2" label for risk results */}
                            <div>
                                <h4 className="text-lg font-semibold text-slate-200">Step 2 of 2 — Risk Parameter Results</h4>
                                {optResults.splitRatio && (
                                    <p className="text-xs text-indigo-400 mt-1 flex items-center">
                                        <Split className="w-3 h-3 mr-1" />
                                        Trained on last {Math.round((1 - optResults.splitRatio) * 100)}% of data
                                        (split {Math.round(optResults.splitRatio * 100)}/{Math.round((1 - optResults.splitRatio) * 100)})
                                    </p>
                                )}
                            </div>
                            <Card className="p-0 overflow-hidden">
                                <table className="w-full text-left text-sm text-slate-400">
                                    <thead className="bg-slate-950 text-slate-200">
                                        <tr>
                                            <th className="p-4 rounded-tl-lg">Rank</th>
                                            <th className="p-4">Risk Set</th>
                                            <th className="p-4">Score ({optunaMetric})</th>
                                            <th className="p-4">Win Rate</th>
                                            <th className="p-4">Drawdown</th>
                                            <th className="p-4">Trades</th>
                                            <th className="p-4 text-right rounded-tr-lg">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {optResults.riskGrid.slice(0, 10).map((res, idx) => (
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
                                                    <Button size="sm" onClick={() => {
                                                        // when applying risk params we want to merge with the best
                                                        // primary parameters previously selected
                                                        const combined = {
                                                            ...(optResults.combinedParams ?? {}),
                                                            ...res.paramSet
                                                        };
                                                        applyParamsAndRun(combined);
                                                    }} className="opacity-0 group-hover:opacity-100 transition-opacity" icon={<ArrowRight className="w-4 h-4" />}>Apply</Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Optimization;
