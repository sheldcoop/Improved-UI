import React from 'react';

export interface RiskConfigPanelProps {
    slPct: number;
    onSlChange: (v: number) => void;
    tslPct: number;
    onTslChange: (v: number) => void;
    tpPct: number;
    onTpChange: (v: number) => void;
    disabled?: boolean;
}

/**
 * Always-visible SL / TSL / TP number inputs.
 * Value of 0 means disabled.
 * TSL > 0 overrides fixed SL distance and activates trailing mode.
 */
export const RiskConfigPanel: React.FC<RiskConfigPanelProps> = ({
    slPct, onSlChange,
    tslPct, onTslChange,
    tpPct, onTpChange,
    disabled = false
}) => {
    const inputCls = 'w-full bg-slate-950 border border-slate-700/60 rounded pr-2 text-right py-1.5 text-sm font-mono text-slate-200 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

    // Add logic to auto-activate SL if TSL is entered but SL is 0
    const handleTslChange = (val: number) => {
        onTslChange(val);
        if (val > 0 && slPct === 0) {
            onSlChange(val); // By default, kickstart SL to match TSL if it was off
        }
    };

    return (
        <div className="pt-3 border-t border-slate-800">
            <label className="text-xs font-medium text-slate-400 block mb-2">Risk Controls <span className="text-slate-600 font-normal">(0 = off)</span></label>
            <div className="grid grid-cols-3 gap-3">
                <div className="group relative">
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Stop Loss</label>
                    <div className="relative flex items-center">
                        <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={slPct || ''}
                            onChange={e => onSlChange(parseFloat(e.target.value) || 0)}
                            className={inputCls}
                            placeholder="0.0"
                            disabled={disabled}
                        />
                        <span className="absolute left-3 text-xs text-slate-500">%</span>
                    </div>
                </div>
                <div className="group relative">
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Trail Stop</label>
                    <div className="relative flex items-center">
                        <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={tslPct || ''}
                            onChange={e => handleTslChange(parseFloat(e.target.value) || 0)}
                            className={inputCls}
                            placeholder="0.0"
                            disabled={disabled}
                        />
                        <span className="absolute left-3 text-xs text-slate-500">%</span>
                    </div>
                </div>
                <div className="group relative">
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Take Profit</label>
                    <div className="relative flex items-center">
                        <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={tpPct || ''}
                            onChange={e => onTpChange(parseFloat(e.target.value) || 0)}
                            className={inputCls}
                            placeholder="0.0"
                            disabled={disabled}
                        />
                        <span className="absolute left-3 text-xs text-slate-500">%</span>
                    </div>
                </div>
            </div>
            {tslPct > 0 && slPct > 0 && (
                <p className="text-[10px] text-indigo-400/80 mt-1.5 flex items-center">
                    <span className="w-1 h-1 bg-indigo-500 rounded-full mr-1.5 animate-pulse"></span>
                    Trail Stop overrides fixed SL execution
                </p>
            )}
        </div>
    );
};
