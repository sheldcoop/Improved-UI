import React from 'react';

export interface ParamConfig {
    id: string;
    name: string;
    min: number;
    max: number;
    step: number;
}

interface ParamRangeRowProps {
    param: ParamConfig;
    onUpdate: (id: string, field: keyof ParamConfig, value: number) => void;
    disabled?: boolean;
    /** Custom display label — defaults to auto-formatted param.name */
    label?: string;
}

/**
 * Single parameter range row: Name | Min | Max | Step inputs.
 * Used for both Phase 1 strategy params and Phase 2 risk params.
 */
const ParamRangeRow: React.FC<ParamRangeRowProps> = ({ param, onUpdate, disabled = false, label }) => {
    const inputCls = `w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;
    const displayName = label ?? param.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    return (
        <div className={`grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded border transition-opacity ${disabled ? 'border-slate-800/50 opacity-40 pointer-events-none' : 'border-slate-800'}`}>
            <div className="col-span-4">
                <span className="text-sm font-medium text-slate-300 ml-2">{displayName}</span>
            </div>
            <div className="col-span-8 grid grid-cols-3 gap-3">
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 mb-1">Min</span>
                    <input
                        type="number"
                        step={param.step}
                        value={param.min}
                        disabled={disabled}
                        onChange={e => onUpdate(param.id, 'min', parseFloat(e.target.value))}
                        className={inputCls}
                    />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 mb-1">Max</span>
                    <input
                        type="number"
                        step={param.step}
                        value={param.max}
                        disabled={disabled}
                        onChange={e => onUpdate(param.id, 'max', parseFloat(e.target.value))}
                        className={inputCls}
                    />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 mb-1">Step</span>
                    <input
                        type="number"
                        step={param.step}
                        value={param.step}
                        disabled={disabled}
                        onChange={e => onUpdate(param.id, 'step', parseFloat(e.target.value))}
                        className={inputCls}
                    />
                </div>
            </div>
        </div>
    );
};

export default ParamRangeRow;
