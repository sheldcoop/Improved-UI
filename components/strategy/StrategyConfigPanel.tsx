import React from 'react';
import { Save, Trash2, ChevronDown, ChevronRight, RefreshCw, PlayCircle, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { Strategy, AssetClass, Timeframe, PositionSizeMode, StrategyPreset } from '../../types';
import type { DataHealthReport } from '../../services/marketService';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface StrategyConfigPanelProps {
    strategy: Strategy;
    onStrategyChange: (s: Strategy) => void;
    presets: StrategyPreset[];
    activePresetId: string;
    onPresetChange: (id: string) => void;
    savedStrategies: Strategy[];
    showSaved: boolean;
    onToggleSaved: () => void;
    onLoadSaved: (s: Strategy) => void;
    onDeleteSaved: (id: string) => void;
    onCloneStrategy: (s: Strategy) => void;
    deletingId: string | null;
    saveError: string | null;
    runError: string | null;
    saving: boolean;
    running: boolean;
    checkingQuality: boolean;
    dataQuality: DataHealthReport | null;
    onSave: () => void;
    onRun: () => void;
    onRunAnyway: () => void;
    onDismissQuality: () => void;
}

export const StrategyConfigPanel: React.FC<StrategyConfigPanelProps> = ({
    strategy, onStrategyChange,
    presets, activePresetId, onPresetChange,
    savedStrategies, showSaved, onToggleSaved,
    onLoadSaved, onDeleteSaved, onCloneStrategy, deletingId,
    saveError, runError, saving, running,
    checkingQuality, dataQuality, onSave, onRun, onRunAnyway, onDismissQuality,
}) => {
    const update = (partial: Partial<Strategy>) => onStrategyChange({ ...strategy, ...partial });

    return (
        <div className="flex flex-col gap-4">
            {/* Card 1: Strategy Settings */}
            <Card className="p-4 space-y-3">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">Strategy Name</label>
                    <input
                        type="text"
                        value={strategy.name}
                        onChange={e => update({ name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 outline-none"
                    />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Asset Class</label>
                        <select
                            value={strategy.assetClass}
                            onChange={e => update({ assetClass: e.target.value as AssetClass })}
                            className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200"
                        >
                            {Object.values(AssetClass).map(a => <option key={a}>{a}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Timeframe</label>
                        <select
                            value={strategy.timeframe}
                            onChange={e => update({ timeframe: e.target.value as Timeframe })}
                            className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200"
                        >
                            {Object.values(Timeframe).map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="text-xs text-slate-500 block mb-1">Strategy Preset</label>
                    <select
                        value={activePresetId}
                        onChange={e => onPresetChange(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200"
                    >
                        <option value="">Custom Strategy (Builder)</option>
                        {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div>
                    <button
                        onClick={onToggleSaved}
                        className="flex items-center justify-between w-full text-xs font-bold text-slate-400 uppercase hover:text-slate-200"
                    >
                        <span>My Strategies {savedStrategies.length > 0 && `(${savedStrategies.length})`}</span>
                        {showSaved ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    {showSaved && (
                        <div className="space-y-1 mt-2 max-h-40 overflow-y-auto">
                            {savedStrategies.length === 0 ? (
                                <div className="text-xs text-slate-600 py-2 text-center">No saved strategies yet</div>
                            ) : (
                                savedStrategies.map(s => (
                                    <div key={s.id} className="flex items-center justify-between p-2 bg-slate-950 rounded border border-slate-800 group">
                                        <button
                                            onClick={() => onLoadSaved(s)}
                                            className="text-xs text-slate-300 hover:text-emerald-400 truncate flex-1 text-left"
                                            title={s.name}
                                        >
                                            {s.name}
                                        </button>
                                        <div className="flex items-center ml-2 space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => onCloneStrategy(s)} title="Clone strategy" className="text-slate-700 hover:text-purple-400">
                                                <RefreshCw className="w-3 h-3" />
                                            </button>
                                            <button onClick={() => onDeleteSaved(s.id)} disabled={deletingId === s.id} className="text-slate-700 hover:text-red-400">
                                                {deletingId === s.id
                                                    ? <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                                                    : <Trash2 className="w-3 h-3" />}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </Card>

            {/* Card 2: Risk Management */}
            <Card title="Risk Management" className="p-0">
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">
                                {strategy.useTrailingStop ? 'Trail Distance %' : 'Stop Loss %'}
                            </label>
                            <input
                                type="number"
                                min="0"
                                value={strategy.stopLossPct}
                                onChange={e => update({ stopLossPct: parseFloat(e.target.value) })}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Take Profit %</label>
                            <input
                                type="number"
                                min="0"
                                value={strategy.takeProfitPct}
                                onChange={e => update({ takeProfitPct: parseFloat(e.target.value) })}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                            />
                        </div>
                    </div>
                    <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={strategy.useTrailingStop}
                            onChange={e => update({ useTrailingStop: e.target.checked })}
                            className="rounded bg-slate-800 border-slate-600"
                        />
                        <span>Trailing Stop Loss</span>
                    </label>
                </div>
            </Card>

            {/* Card 3: Execution */}
            <Card title="Execution" className="p-0">
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Position Sizing</label>
                        <select
                            value={strategy.positionSizing}
                            onChange={e => update({ positionSizing: e.target.value as PositionSizeMode })}
                            className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-1 text-slate-200 mb-1"
                        >
                            {Object.values(PositionSizeMode).map(m => <option key={m}>{m}</option>)}
                        </select>
                        <input
                            type="number"
                            value={strategy.positionSizeValue}
                            onChange={e => update({ positionSizeValue: parseFloat(e.target.value) })}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-500 block mb-1">Slippage %</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={strategy.slippage}
                                onChange={e => update({ slippage: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 block mb-1">Commission ₹</label>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={strategy.commission}
                                onChange={e => update({ commission: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-500 block mb-1">Start Time</label>
                            <input
                                type="time"
                                value={strategy.startTime}
                                onChange={e => update({ startTime: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 block mb-1">End Time</label>
                            <input
                                type="time"
                                value={strategy.endTime}
                                onChange={e => update({ endTime: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Pyramiding (Max Entries)</label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={strategy.pyramiding}
                            onChange={e => update({ pyramiding: parseInt(e.target.value) })}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                        />
                    </div>
                </div>
            </Card>

            {/* Errors */}
            {saveError && (
                <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{saveError}</span>
                </div>
            )}
            {runError && (
                <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{runError}</span>
                </div>
            )}

            {/* Data quality panel — shown when anomalies detected before run */}
            {dataQuality && (
                <div className="border border-amber-800 bg-amber-900/20 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-xs font-bold text-amber-400">Data Quality Issues</span>
                        <span className="ml-auto text-[10px] text-slate-500">{dataQuality.totalCandles} candles</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                        {dataQuality.gapCount > 0 && (
                            <div className="text-slate-400">Gaps <span className="text-amber-300 font-medium">{dataQuality.gapCount}</span></div>
                        )}
                        {dataQuality.nullCandles > 0 && (
                            <div className="text-slate-400">Nulls <span className="text-amber-300 font-medium">{dataQuality.nullCandles}</span></div>
                        )}
                        {dataQuality.zeroVolumeCandles > 0 && (
                            <div className="text-slate-400">Zero vol <span className="text-amber-300 font-medium">{dataQuality.zeroVolumeCandles}</span></div>
                        )}
                        {dataQuality.geometricFailures > 0 && (
                            <div className="text-slate-400">Geometry <span className="text-red-400 font-medium">{dataQuality.geometricFailures}</span></div>
                        )}
                        {dataQuality.spikeFailures > 0 && (
                            <div className="text-slate-400">Spikes <span className="text-amber-300 font-medium">{dataQuality.spikeFailures}</span></div>
                        )}
                        {dataQuality.staleFailures > 0 && (
                            <div className="text-slate-400">Flatlines <span className="text-amber-300 font-medium">{dataQuality.staleFailures}</span></div>
                        )}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        Results may be unreliable. Consider re-fetching in Data Manager.
                    </p>
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={onRunAnyway}
                            className="flex-1 text-xs py-1.5 bg-amber-800/60 hover:bg-amber-700/60 text-amber-200 rounded border border-amber-700 font-medium"
                        >
                            Run Anyway
                        </button>
                        <button
                            onClick={onDismissQuality}
                            className="flex-1 text-xs py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-700"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
                <Button
                    variant="secondary"
                    onClick={onSave}
                    disabled={saving}
                    className="w-full"
                    icon={saving
                        ? <div className="w-3 h-3 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                        : <Save className="w-4 h-4" />}
                >
                    {saving ? 'Saving...' : 'Save Strategy'}
                </Button>
                <Button
                    onClick={onRun}
                    disabled={running || checkingQuality || !!dataQuality}
                    className="w-full py-3 shadow-emerald-900/40"
                    icon={running || checkingQuality
                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <PlayCircle className="w-5 h-5" />}
                >
                    {running ? 'Simulating...' : checkingQuality ? 'Checking data...' : 'Run Strategy'}
                </Button>
            </div>
        </div>
    );
};
