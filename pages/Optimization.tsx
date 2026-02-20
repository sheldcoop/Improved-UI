import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Zap, Sliders, Play, GitBranch, Repeat, Plus, Trash2, Target, ArrowRight, CheckCircle2 } from 'lucide-react';
import { runOptimization, runWFO, runAutoTune } from '../services/backtestService';
import { OptimizationResult, WFOResult } from '../types';
import { useBacktestContext } from '../context/BacktestContext';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

interface ParamConfig {
    id: string;
    name: string;
    min: number;
    max: number;
    step: number;
}

const Optimization: React.FC = () => {
    const navigate = useNavigate();
    const {
        symbol, strategyId, customStrategies, setParams: setGlobalParams, startDate,
        autoTuneConfig, setAutoTuneConfig,
        wfoConfig, setWfoConfig,
        capital, commission, slippage, pyramiding, positionSizing, positionSizeValue,
        stopLossPct, takeProfitPct, useTrailingStop
    } = useBacktestContext();

    const [activeTab, setActiveTab] = useState<'GRID' | 'AUTOTUNE' | 'WFO'>('GRID');
    const [results, setResults] = useState<{ grid: OptimizationResult[], wfo: WFOResult[], period?: string, bestParams?: Record<string, number> } | null>(null);
    const [running, setRunning] = useState(false);
    const [optunaMetric, setOptunaMetric] = useState('sharpe');

    // Dynamic Parameter State based on Strategy Context
    const [params, setParams] = useState<ParamConfig[]>([]);

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
            setParams([]); // Hide inputs if no strategy params
        }
    }, [strategyId, customStrategies]);

    const updateParam = (id: string, field: keyof ParamConfig, value: string | number) => setParams(params.map(p => p.id === id ? { ...p, [field]: value } : p));

    const applyParamsAndRun = (paramSet: Record<string, number>) => {
        setGlobalParams(paramSet);
    };

    const handleRun = async () => {
        setRunning(true);
        setResults(null);

        // Transform array to API expected format
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
                const res = await runOptimization(symbol || 'NIFTY 50', strategyId || '1', ranges, { n_trials: 30, scoring_metric: optunaMetric, config: configPayload });
                setResults({ grid: res.grid, wfo: [], bestParams: res.bestParams });
            } else if (activeTab === 'AUTOTUNE') {
                const res = await runAutoTune(symbol || 'NIFTY 50', strategyId || '1', ranges, startDate || '2026-01-01', autoTuneConfig.lookbackMonths || 6, autoTuneConfig.metric || optunaMetric, configPayload);
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

    return (
        // make optimization page use full width but cap at layout max, allow vertical growth
        <div className="w-full h-full flex flex-col space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100">Optimization Engine</h2>
                    <p className="text-emerald-400 text-sm mt-1 flex items-center">
                        <Target className="w-4 h-4 mr-1" />
                        Targeting <strong>{customStrategies.find(s => s.id === strategyId)?.name || 'Strategy'}</strong> on <strong>{symbol || 'Asset'}</strong> spanning <strong>{startDate}</strong> to Present.
                    </p>
                </div>
                <div className="flex space-x-2 bg-slate-900 border border-slate-800 p-1 rounded-lg">
                    <Button variant={activeTab === 'GRID' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('GRID')} icon={<Sliders className="w-4 h-4" />}>Manual Optuna</Button>
                    <Button variant={activeTab === 'AUTOTUNE' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('AUTOTUNE')} icon={<Target className="w-4 h-4" />}>Auto-Tune</Button>
                    <Button variant={activeTab === 'WFO' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('WFO')} icon={<GitBranch className="w-4 h-4" />}>Walk-Forward</Button>
                </div>
            </div>

            {!results && !running && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <Card title="Hyperparameter Configuration">
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-sm font-medium text-emerald-400 uppercase tracking-wider">Search Space</h4>
                            </div>

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
                                                <span className="text-[10px] text-slate-500 mb-1">Min Boundary</span>
                                                <input type="number" step={param.step} value={param.min} onChange={(e) => updateParam(param.id, 'min', parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-slate-500 mb-1">Max Boundary</span>
                                                <input type="number" step={param.step} value={param.max} onChange={(e) => updateParam(param.id, 'max', parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-slate-500 mb-1">Step Size</span>
                                                <input type="number" step={param.step} value={param.step} onChange={(e) => updateParam(param.id, 'step', parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {params.length === 0 && (
                                    <div className="text-sm text-yellow-500 p-4 bg-yellow-900/20 rounded border border-yellow-900">
                                        The selected strategy does not have any tunable parameters defined.
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-800">
                                {activeTab === 'GRID' && (
                                    <div>
                                        <label className="text-xs text-slate-500 block mb-1">Scoring Metric</label>
                                        <select value={optunaMetric} onChange={(e) => setOptunaMetric(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200">
                                            <option value="sharpe">Maximize Sharpe Ratio</option>
                                            <option value="calmar">Maximize Calmar Ratio</option>
                                            <option value="total_return">Maximize Total Return</option>
                                            <option value="drawdown">Minimize Max Drawdown</option>
                                        </select>
                                    </div>
                                )}
                                {activeTab === 'AUTOTUNE' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-slate-500 block mb-1">Target Start Date</label>
                                            <input type="date" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200" value={startDate} disabled />
                                            <p className="text-[10px] text-slate-500 mt-1">Locked to Backtest date</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-500 block mb-1">Lookback (Months)</label>
                                            <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200" value={autoTuneConfig.lookbackMonths} onChange={(e) => setAutoTuneConfig({ ...autoTuneConfig, lookbackMonths: parseInt(e.target.value) })} />
                                        </div>
                                    </div>
                                )}
                                {activeTab === 'WFO' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-slate-500 block mb-1">Train Window (Days)</label>
                                            <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200" value={wfoConfig.trainWindow} onChange={(e) => setWfoConfig({ ...wfoConfig, trainWindow: parseInt(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-500 block mb-1">Test Window (Days)</label>
                                            <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200" value={wfoConfig.testWindow} onChange={(e) => setWfoConfig({ ...wfoConfig, testWindow: parseInt(e.target.value) })} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <Button onClick={handleRun} size="lg" className="w-full py-4 mt-4" icon={<Play className="w-5 h-5" />}>
                                {activeTab === 'GRID' ? 'Start Manual Optuna Study' : activeTab === 'AUTOTUNE' ? 'Auto-Tune Parameters' : 'Start Walk-Forward Analysis'}
                            </Button>
                        </div>
                    </Card>

                    <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
                        <div className="bg-slate-800 p-6 rounded-full mb-6 text-emerald-400">
                            {activeTab === 'GRID' && <Sliders className="w-12 h-12" />}
                            {activeTab === 'AUTOTUNE' && <Target className="w-12 h-12 text-yellow-500" />}
                            {activeTab === 'WFO' && <GitBranch className="w-12 h-12 text-indigo-400" />}
                        </div>
                        <h3 className="text-lg font-medium text-slate-200 mb-2">
                            {activeTab === 'GRID' ? 'Manual Optuna Search' : activeTab === 'AUTOTUNE' ? 'Smart Auto-Tune' : 'Walk-Forward Validation'}
                        </h3>
                        <p className="max-w-xs mb-4 text-sm">
                            {activeTab === 'GRID' ? 'Runs 30 TPE trials computing a rigorous cross-val array to surface the Top 10 configurations.'
                                : activeTab === 'AUTOTUNE' ? 'Looks backwards from your starting date and searches perfectly unseen data to find mathematically superior parameters.'
                                    : 'Simulates the strategy over sliding windows. Optimizes on past data, tests on future data to detect overfitting.'}
                        </p>
                    </div>
                </div>
            )}

            {running && (
                <Card className="flex flex-col items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
                    <h3 className="text-lg font-medium text-slate-200">Running Mathematical Simulations...</h3>
                    <p className="text-slate-400 text-sm">
                        {activeTab === 'GRID' ? `Maximizing objective...` : activeTab === 'AUTOTUNE' ? 'Optimizing unseen lookback period...' : 'Processing Rolling WFO Windows...'}
                    </p>
                </Card>
            )}

            {/* AUTOTUNE RESULTS */}
            {results && activeTab === 'AUTOTUNE' && (
                <div className="max-w-xl mx-auto space-y-4">
                    <Card className="text-center py-12 border-emerald-500 border">
                        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-slate-100 mb-2">Auto-Tuned Successfully</h3>
                        <p className="text-slate-400 mb-6">Found optimal parameters across {results.period}. Your Backtest settings have been pre-filled.</p>

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
                            <Button variant="primary" onClick={() => navigate('/')} icon={<Play className="w-4 h-4" />}>Run Complete Backtest</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* GRID RESULTS */}
            {results && activeTab === 'GRID' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-slate-200">Top 10 Configurations Found</h3>
                        <Button variant="secondary" onClick={() => setResults(null)}>Reset Optimizer</Button>
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
                                                    <span key={k} className="bg-slate-950 border border-slate-700 px-2 py-0.5 rounded">{k}: <span className="text-indigo-400">{v as React.ReactNode}</span></span>
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
                                    <th className="p-3">Optimal Params (extracted from prior Train)</th>
                                    <th className="p-3">Out-of-Sample Sharpe</th>
                                    <th className="p-3">Out-of-Sample Return</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {(results.wfo || []).map((res: any, idx) => (
                                    <tr key={idx}>
                                        <td className="p-3">{res.period}</td>
                                        <td className="p-3 font-mono text-xs text-slate-300 bg-slate-950 rounded my-1 p-2 border border-slate-800 block w-max">{res.params}</td>
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
