import React from 'react';
import { Play, AlertTriangle } from 'lucide-react';
import { Card } from '../ui/Card';
import WorkflowToggle from './WorkflowToggle';
import ParamRangeRow, { ParamConfig } from './ParamRangeRow';
import RiskParamConfig from './RiskParamConfig';

interface SetupCardProps {
    activeTab: 'WFO' | 'GRID';
    setActiveTab: (tab: 'WFO' | 'GRID') => void;
    params: ParamConfig[];
    updateParam: (id: string, field: keyof ParamConfig, value: number) => void;
    enableRiskSearch: boolean;
    setEnableRiskSearch: (v: boolean) => void;
    riskParams: ParamConfig[];
    setRiskParams: (params: ParamConfig[]) => void;
    optunaMetric: string;
    setOptunaMetric: (v: string) => void;
    wfoConfig: { trainWindow: number; testWindow: number };
    setWfoConfig: (v: { trainWindow: number; testWindow: number }) => void;
    dataStatus: string;
    running: boolean;
    onRun: () => void;
}

/**
 * Left-side configuration card for the Optimization Setup step.
 * Contains: workflow toggle, param ranges, scoring metric, run button.
 * Data-split is now configured on the Backtest page (StrategyLogic component).
 */
const SetupCard: React.FC<SetupCardProps> = ({
    activeTab, setActiveTab,
    params, updateParam,
    enableRiskSearch, setEnableRiskSearch,
    riskParams, setRiskParams,
    optunaMetric, setOptunaMetric,
    wfoConfig, setWfoConfig,
    dataStatus, running, onRun,
}) => {
    const dataReady = dataStatus === 'READY';

    return (
        <Card title="Hyperparameter Search Space">
            <div className="space-y-5">
                {/* Workflow selector */}
                <div>
                    <label className="text-xs text-slate-500 block mb-2">Workflow</label>
                    <WorkflowToggle activeTab={activeTab} setActiveTab={setActiveTab} />
                </div>

                {/* Phase 1 param rows */}
                <div className="space-y-3">
                    {enableRiskSearch && (
                        <div className="flex items-center space-x-1 text-[10px] text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded px-2 py-1">
                            <span>🔒</span>
                            <span>Phase 1 parameters are fixed — Phase 2 will search SL/TP with these values locked.</span>
                        </div>
                    )}
                    {params.map(param => (
                        <ParamRangeRow
                            key={param.id}
                            param={param}
                            onUpdate={updateParam}
                            disabled={enableRiskSearch}
                        />
                    ))}
                    {params.length === 0 && (
                        <div className="text-sm text-yellow-500 p-4 bg-yellow-900/20 rounded border border-yellow-900">
                            No tunable parameters defined for this strategy.
                        </div>
                    )}

                    {/* Phase 2 enable toggle */}
                    <div className="mt-2">
                        <label className="inline-flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={enableRiskSearch}
                                onChange={() => setEnableRiskSearch(!enableRiskSearch)}
                                className="form-checkbox"
                            />
                            <span className="text-sm text-slate-300">Enable Phase 2: Optimize Stop-Loss / Take-Profit</span>
                        </label>
                    </div>

                    {enableRiskSearch && (
                        <RiskParamConfig
                            riskParams={riskParams}
                            setRiskParams={setRiskParams}
                        />
                    )}
                </div>

                {/* Tab-specific controls */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Scoring Metric</label>
                        <select
                            value={optunaMetric}
                            onChange={e => setOptunaMetric(e.target.value)}
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
                                <input
                                    type="number"
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:border-indigo-500 outline-none"
                                    value={wfoConfig.trainWindow}
                                    onChange={e => setWfoConfig({ ...wfoConfig, trainWindow: parseInt(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Test Window (Months)</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:border-indigo-500 outline-none"
                                    value={wfoConfig.testWindow}
                                    onChange={e => setWfoConfig({ ...wfoConfig, testWindow: parseInt(e.target.value) })}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Data guard */}
                {!dataReady && (
                    <div className="flex items-start space-x-2 text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700/40 rounded p-3">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>No data loaded. Go to Backtest → select symbol + date range → click "Load Market Data" first.</span>
                    </div>
                )}

                <button
                    onClick={onRun}
                    disabled={running || !dataReady}
                    className={`w-full py-4 mt-2 rounded-xl font-bold text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        activeTab === 'WFO'
                            ? 'bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800'
                            : 'bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800'
                    }`}
                >
                    <Play className="w-5 h-5 mr-2" />
                    {!dataReady
                        ? 'Load Data First'
                        : activeTab === 'WFO'
                            ? 'Start Walk-Forward Analysis'
                            : 'Start Manual Optuna Study'}
                </button>
            </div>
        </Card>
    );
};

export default SetupCard;
