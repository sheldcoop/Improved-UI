import React from 'react';
import { FastForward, Play, Pause, RotateCcw } from 'lucide-react';
import { Card } from '../ui/Card';
import { StrategyPicker } from '../shared/StrategyPicker';
import { DateRangePicker } from '../DateRangePicker';
import { RiskConfigPanel } from '../shared/RiskConfigPanel';
import { Strategy, StrategyPreset, Timeframe } from '../../types';

const COMMON_SYMBOLS = [
    'NIFTY 50', 'BANKNIFTY', 'SENSEX',
    'RELIANCE', 'HDFCBANK', 'INFY', 'TCS', 'ICICIBANK',
    'SBIN', 'MARUTI', 'DLF', 'DIXON', 'BAJAJELEC',
    'PNB', 'AMBUJACEM', 'HDFCNIF100',
];

interface ReplayPanelProps {
    presets: StrategyPreset[];
    savedStrategies: Strategy[];
    activePresetId: string;
    onPresetChange: (id: string) => void;
    selectedStrategyId: string | null;
    onLoadSaved: (s: Strategy) => void;
    showSaved: boolean;
    onToggleSaved: () => void;

    slPct: number | '';
    onSlPctChange: (val: number | '') => void;
    tslPct: number | '';
    onTslPctChange: (val: number | '') => void;
    tpPct: number | '';
    onTpPctChange: (val: number | '') => void;

    startDate: string;
    onStartDateChange: (date: string) => void;
    endDate: string;
    onEndDateChange: (date: string) => void;
    speed: number;
    onSpeedChange: (speed: number) => void;
    isPlaying: boolean;
    onTogglePlay: () => void;
    onReset: () => void;
    progress?: { current: number; total: number };
}

export const ReplayPanel: React.FC<ReplayPanelProps> = ({
    presets, savedStrategies,
    activePresetId, onPresetChange,
    onLoadSaved, showSaved, onToggleSaved,
    slPct, onSlPctChange,
    tslPct, onTslPctChange,
    tpPct, onTpPctChange,
    startDate, onStartDateChange,
    endDate, onEndDateChange,
    speed, onSpeedChange,
    isPlaying, onTogglePlay, onReset,
    progress,
}) => {
    return (
        <Card title="Historical Replay Control" className="p-4 space-y-4">
            <div className="pt-2 border-slate-800">
                <StrategyPicker
                    presets={presets}
                    activePresetId={activePresetId}
                    onPresetChange={onPresetChange}
                    savedStrategies={savedStrategies}
                    showSaved={showSaved}
                    onToggleSaved={onToggleSaved}
                    onLoadSaved={onLoadSaved}
                />
            </div>

            <RiskConfigPanel
                slPct={slPct === '' ? 0 : slPct}
                onSlChange={v => onSlPctChange(v === 0 ? '' : v)}
                tslPct={tslPct === '' ? 0 : tslPct}
                onTslChange={v => onTslPctChange(v === 0 ? '' : v)}
                tpPct={tpPct === '' ? 0 : tpPct}
                onTpChange={v => onTpPctChange(v === 0 ? '' : v)}
                disabled={isPlaying}
            />

            <div className="pt-2 border-t border-slate-800">
                <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    setStartDate={onStartDateChange}
                    setEndDate={onEndDateChange}
                    disabled={isPlaying}
                />
            </div>

            <div className="space-y-1">
                <label className="text-xs text-slate-500 flex justify-between">
                    <span>Replay Speed</span>
                    <span className="text-slate-300 font-bold">{speed}x</span>
                </label>
                <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={speed}
                    onChange={e => onSpeedChange(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600">
                    <span>1 sec = 1 candle</span>
                    <span>1s = 100 candles</span>
                </div>
            </div>

            <div className="flex space-x-2 pt-2 border-t border-slate-800">
                <button
                    onClick={onTogglePlay}
                    className={`flex-1 py-2 px-4 rounded text-sm font-bold flex items-center justify-center transition-colors ${isPlaying ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                >
                    {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                    {isPlaying ? 'Pause' : 'Play Replay'}
                </button>
                <button
                    onClick={onReset}
                    className="py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors"
                    title="Reset Replay"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
            </div>

            {progress && progress.total > 0 && (
                <div className="space-y-1">
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-purple-600 rounded-full transition-all"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                        <span>{isPlaying ? 'Replaying…' : progress.current > 0 ? 'Paused' : 'Ready'}</span>
                        <span className="font-mono text-slate-400">Bar {progress.current} / {progress.total}</span>
                    </div>
                </div>
            )}

            {!progress && (
                <p className="text-[10px] text-slate-500 leading-tight">
                    Configure your historical replay scenario above, then hit Play to simulate a live data feed stream through your strategy rule set.
                </p>
            )}
        </Card>
    );
};
