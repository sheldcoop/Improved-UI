import React from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { Strategy, StrategyPreset } from '../../types';

interface StrategyPickerProps {
    presets: StrategyPreset[];
    activePresetId: string;
    onPresetChange: (id: string) => void;
    savedStrategies: Strategy[];
    showSaved: boolean;
    onToggleSaved: () => void;
    onLoadSaved: (s: Strategy) => void;
    onDeleteSaved?: (id: string) => void;
    onCloneStrategy?: (s: Strategy) => void;
    deletingId?: string | null;
}

export const StrategyPicker: React.FC<StrategyPickerProps> = ({
    presets,
    activePresetId,
    onPresetChange,
    savedStrategies,
    showSaved,
    onToggleSaved,
    onLoadSaved,
    onDeleteSaved,
    onCloneStrategy,
    deletingId
}) => {
    return (
        <div className="space-y-3">
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
                                        {onCloneStrategy && (
                                            <button onClick={() => onCloneStrategy(s)} title="Clone strategy" className="text-slate-700 hover:text-purple-400">
                                                <RefreshCw className="w-3 h-3" />
                                            </button>
                                        )}
                                        {onDeleteSaved && (
                                            <button onClick={() => onDeleteSaved(s.id)} disabled={deletingId === s.id} className="text-slate-700 hover:text-red-400">
                                                {deletingId === s.id
                                                    ? <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                                                    : <Trash2 className="w-3 h-3" />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
