import React, { useState } from 'react';
import { PlayCircle, AlertCircle } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { StrategyPreset, Strategy, Timeframe } from '../../types';
import { StrategyPicker } from '../shared/StrategyPicker';

const COMMON_SYMBOLS = [
    'NIFTY 50', 'BANKNIFTY', 'SENSEX',
    'RELIANCE', 'HDFCBANK', 'INFY', 'TCS', 'ICICIBANK',
    'SBIN', 'MARUTI', 'DLF', 'DIXON', 'BAJAJELEC',
    'PNB', 'AMBUJACEM', 'HDFCNIF100',
];

interface MonitorSetupProps {
    onStartMonitor: (strategyId: string, slPct: number | null, tpPct: number | null) => Promise<void>;
    presets: StrategyPreset[];
    savedStrategies: Strategy[];
    activeMonitorsCount: number;
    globalSymbol: string;
}

export const MonitorSetup: React.FC<MonitorSetupProps> = ({
    onStartMonitor,
    presets,
    savedStrategies,
    activeMonitorsCount,
    globalSymbol
}) => {
    const [activePresetId, setActivePresetId] = useState<string>('');
    const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
    const [showSaved, setShowSaved] = useState(false);

    // Sl/TP Overrides (optional)
    const [slPct, setSlPct] = useState<number | ''>('');
    const [tpPct, setTpPct] = useState<number | ''>('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePresetChange = (id: string) => {
        setActivePresetId(id);
        setSelectedStrategyId(id); // Usually preset ID and strategy ID map the same way
    };

    const handleLoadSaved = (s: Strategy) => {
        setActivePresetId('');
        setSelectedStrategyId(s.id);
    };

    const handleStart = async () => {
        setError(null);
        if (!selectedStrategyId) {
            setError('Please select a strategy or preset');
            return;
        }

        setLoading(true);
        try {
            await onStartMonitor(
                selectedStrategyId,
                slPct === '' ? null : Number(slPct),
                tpPct === '' ? null : Number(tpPct)
            );
        } catch (err: any) {
            setError(err?.message || 'Failed to start monitor');
        } finally {
            setLoading(false);
        }
    };

    const maxMonitors = activeMonitorsCount >= 3;

    return (
        <Card title="New Paper Monitor" className="p-4 space-y-4">
            {maxMonitors && (
                <div className="bg-amber-900/20 border border-amber-800 text-amber-500 rounded p-2 text-xs flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                    Maximum of 3 monitors reached. Stop one to start a new one.
                </div>
            )}

            <div className="pt-2 border-slate-800">
                <StrategyPicker
                    presets={presets}
                    activePresetId={activePresetId}
                    onPresetChange={handlePresetChange}
                    savedStrategies={savedStrategies}
                    showSaved={showSaved}
                    onToggleSaved={() => setShowSaved(!showSaved)}
                    onLoadSaved={handleLoadSaved}
                />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Stop Loss % (Override)</label>
                    <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={slPct}
                        onChange={e => setSlPct(e.target.value ? parseFloat(e.target.value) : '')}
                        disabled={maxMonitors}
                        placeholder="Strategy default"
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Take Profit % (Override)</label>
                    <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={tpPct}
                        onChange={e => setTpPct(e.target.value ? parseFloat(e.target.value) : '')}
                        disabled={maxMonitors}
                        placeholder="Strategy default"
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
                    />
                </div>
            </div>

            {error && (
                <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <Button
                onClick={handleStart}
                disabled={maxMonitors || loading || !selectedStrategyId || !globalSymbol}
                className="w-full py-3 shadow-emerald-900/40"
                icon={loading
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <PlayCircle className="w-4 h-4" />}
            >
                {loading ? 'Starting...' : 'Start Monitor'}
            </Button>
        </Card>
    );
};
