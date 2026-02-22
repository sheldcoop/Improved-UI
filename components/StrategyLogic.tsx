import React from 'react';
import { Layers, Sliders, AlertTriangle, Split } from 'lucide-react';
import { Strategy } from '../types';
import StrategyParamInputs from './backtest/StrategyParamInputs';
import RiskControls from './backtest/RiskControls';

/** Compute the calendar date at a given % point between start and end. */
function computeSplitDate(start: string, end: string, ratioPercent: number): string {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return new Date(s + (e - s) * (ratioPercent / 100)).toISOString().split('T')[0];
}

// Short descriptions shown under the strategy dropdown
const STRATEGY_DESCRIPTIONS: Record<string, string> = {
    '1': 'Generates buy/sell signals when RSI crosses oversold or overbought thresholds. Works best in ranging markets.',
    '3': 'Enters long when the fast MA crosses above the slow MA. Works best in trending markets.',
};

interface StrategyLogicProps {
    strategyId: string;
    setStrategyId: (id: string) => void;
    customStrategies: Strategy[];
    params: Record<string, any>;
    setParams: (params: Record<string, any>) => void;
    stopLossEnabled: boolean;
    setStopLossEnabled: (enabled: boolean) => void;
    stopLossPct: number;
    setStopLossPct: (pct: number) => void;
    useTrailingStop: boolean;
    setUseTrailingStop: (enabled: boolean) => void;
    takeProfitEnabled: boolean;
    setTakeProfitEnabled: (enabled: boolean) => void;
    takeProfitPct: number;
    setTakeProfitPct: (pct: number) => void;
    dataStatus: string;
    navigate: (path: string) => void;
    /** Date range from context — used for live split boundary preview */
    startDate: string;
    endDate: string;
    /** Optimization data split state */
    enableDataSplit: boolean;
    setEnableDataSplit: (v: boolean) => void;
    splitRatio: number;
    setSplitRatio: (v: number) => void;
}

const StrategyLogic: React.FC<StrategyLogicProps> = ({
    strategyId, setStrategyId,
    customStrategies,
    params, setParams,
    stopLossEnabled, setStopLossEnabled, stopLossPct, setStopLossPct,
    useTrailingStop, setUseTrailingStop,
    takeProfitEnabled, setTakeProfitEnabled, takeProfitPct, setTakeProfitPct,
    dataStatus, navigate,
    startDate, endDate,
    enableDataSplit, setEnableDataSplit, splitRatio, setSplitRatio,
}) => {
    const dataReady = dataStatus === 'READY';
    const description = STRATEGY_DESCRIPTIONS[strategyId]
        ?? customStrategies.find(s => s.id === strategyId)?.description
        ?? 'Custom strategy loaded from your Strategy Builder.';

    const cardCls = 'bg-slate-900/40 rounded-xl border border-slate-800 p-4 flex flex-col gap-4';

    // Live boundary date for split preview
    const boundaryDate = computeSplitDate(startDate, endDate, splitRatio);

    return (
        <div className="space-y-3">
            {/* Section header */}
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-400 flex items-center">
                    <Layers className="w-4 h-4 mr-2" /> Strategy Logic
                </label>
                {!dataReady && (
                    <div className="text-xs text-yellow-500 flex items-center bg-yellow-500/10 px-2 py-1 rounded">
                        <AlertTriangle className="w-3 h-3 mr-1" /> Pending Data
                    </div>
                )}
            </div>

            {/* Two-card layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* ── Left card: strategy selector + description + Tune button ── */}
                <div className={cardCls}>
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Strategy</label>
                        <select
                            value={strategyId}
                            onChange={e => setStrategyId(e.target.value)}
                            disabled={!dataReady}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <optgroup label="Preset Strategies">
                                <option value="3">Moving Average Crossover</option>
                                <option value="1">RSI Mean Reversion</option>
                            </optgroup>
                            {customStrategies.length > 0 && (
                                <optgroup label="My Custom Strategies">
                                    {customStrategies.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                    </div>

                    {/* Strategy description */}
                    <p className="text-xs text-slate-500 leading-relaxed flex-1">{description}</p>

                    {/* Tune Parameters button — always shown */}
                    <div className="mt-auto pt-2 border-t border-slate-800">
                        <p className="text-[11px] text-slate-500 mb-2">
                            Not sure what values to use? The optimizer can find them scientifically.
                        </p>
                        <button
                            onClick={() => navigate('/optimization')}
                            disabled={!dataReady}
                            className={`w-full flex items-center justify-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-xs font-bold px-4 py-2 rounded border border-indigo-600/30 transition-all ${!dataReady ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Sliders className="w-3.5 h-3.5" />
                            {dataReady ? 'Tune Parameters' : 'Load Data First'}
                        </button>
                    </div>
                </div>

                {/* ── Right card: strategy params + risk controls ── */}
                <div className={`${cardCls} ${!dataReady ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div>
                        <label className="text-xs text-slate-500 block mb-2">Parameters</label>
                        <StrategyParamInputs
                            strategyId={strategyId}
                            customStrategies={customStrategies}
                            params={params}
                            setParams={setParams}
                        />
                        {!customStrategies.find(s => s.id === strategyId)?.params?.length
                            && strategyId !== '1' && strategyId !== '3' && (
                            <p className="text-xs text-slate-600 italic">No configurable parameters.</p>
                        )}
                    </div>

                    <RiskControls
                        stopLossEnabled={stopLossEnabled}
                        setStopLossEnabled={setStopLossEnabled}
                        stopLossPct={stopLossPct}
                        setStopLossPct={setStopLossPct}
                        useTrailingStop={useTrailingStop}
                        setUseTrailingStop={setUseTrailingStop}
                        takeProfitEnabled={takeProfitEnabled}
                        setTakeProfitEnabled={setTakeProfitEnabled}
                        takeProfitPct={takeProfitPct}
                        setTakeProfitPct={setTakeProfitPct}
                    />
                </div>

            </div>

            {/* ── Third card: Optimization data split ── */}
            <div className={cardCls}>
                <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-300 flex items-center gap-2">
                        <Split className="w-3.5 h-3.5 text-indigo-400" />
                        Optimization Data Split
                    </label>
                    <button
                        onClick={() => setEnableDataSplit(!enableDataSplit)}
                        className={`w-10 h-5 rounded-full p-1 transition-colors ${enableDataSplit ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        aria-label="Toggle data split"
                    >
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${enableDataSplit ? 'translate-x-5' : ''}`} />
                    </button>
                </div>

                {enableDataSplit ? (
                    <div className="space-y-3">
                        <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-indigo-400 font-medium w-24 shrink-0">Phase 1 (params)</span>
                                <div className="flex-1 h-5 bg-indigo-600/20 border border-indigo-600/40 rounded flex items-center px-2 text-[10px] text-indigo-300 font-mono">
                                    {startDate} → {boundaryDate}
                                </div>
                                <span className="text-indigo-400 font-bold w-8 text-right">{splitRatio}%</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-emerald-400 font-medium w-24 shrink-0">Phase 2 (SL/TP)</span>
                                <div className="flex-1 h-5 bg-emerald-600/20 border border-emerald-600/40 rounded flex items-center px-2 text-[10px] text-emerald-300 font-mono">
                                    {boundaryDate} → {endDate}
                                </div>
                                <span className="text-emerald-400 font-bold w-8 text-right">{100 - splitRatio}%</span>
                            </div>
                        </div>
                        <input
                            type="range" min="50" max="90" step="5"
                            value={splitRatio}
                            onChange={e => setSplitRatio(parseInt(e.target.value))}
                            className="w-full accent-indigo-500"
                        />
                        <p className="text-[10px] text-slate-500 italic">
                            Drag to adjust. Strategy params found on Phase 1 data. SL/TP tuned on Phase 2 data. Reduces overfitting between phases.
                        </p>
                    </div>
                ) : (
                    <p className="text-[10px] text-slate-500 italic">
                        When disabled, both optimization phases train on the full date range. Enable to prevent Phase 1 results from leaking into Phase 2.
                    </p>
                )}
            </div>
        </div>
    );
};

export default StrategyLogic;
