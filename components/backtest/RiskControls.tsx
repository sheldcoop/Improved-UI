import React from 'react';

interface RiskControlsProps {
    stopLossEnabled: boolean;
    setStopLossEnabled: (v: boolean) => void;
    stopLossPct: number;
    setStopLossPct: (v: number) => void;
    trailingStopPct: number;
    setTrailingStopPct: (v: number) => void;
    takeProfitEnabled: boolean;
    setTakeProfitEnabled: (v: boolean) => void;
    takeProfitPct: number;
    setTakeProfitPct: (v: number) => void;
}

/**
 * Always-visible SL / TSL / TP number inputs — no checkboxes needed.
 * Value of 0 means disabled (same UX as Period/Lower/Upper params above).
 * TSL > 0 overrides fixed SL distance and activates trailing mode.
 */
const RiskControls: React.FC<RiskControlsProps> = ({
    stopLossPct, setStopLossPct,
    trailingStopPct, setTrailingStopPct,
    takeProfitPct, setTakeProfitPct,
    // kept in props signature for backward compat — no longer used for gating display
    setStopLossEnabled, setTakeProfitEnabled,
}) => {
    const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none';

    const handleSLChange = (val: number) => {
        setStopLossPct(val);
        setStopLossEnabled(val > 0);
    };
    const handleTPChange = (val: number) => {
        setTakeProfitPct(val);
        setTakeProfitEnabled(val > 0);
    };
    const handleTSLChange = (val: number) => {
        setTrailingStopPct(val);
        // TSL implies SL is active
        setStopLossEnabled(val > 0 || stopLossPct > 0);
    };

    return (
        <div className="pt-3 border-t border-slate-700/50">
            <label className="text-xs text-slate-500 block mb-2">Risk Controls <span className="text-slate-600">(0 = off)</span></label>
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">Stop Loss %</label>
                    <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={stopLossPct}
                        onChange={e => handleSLChange(parseFloat(e.target.value) || 0)}
                        className={inputCls}
                        placeholder="0"
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-500 block mb-1">Trail Stop %</label>
                    <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={trailingStopPct}
                        onChange={e => handleTSLChange(parseFloat(e.target.value) || 0)}
                        className={inputCls}
                        placeholder="0"
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-500 block mb-1">Take Profit %</label>
                    <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={takeProfitPct}
                        onChange={e => handleTPChange(parseFloat(e.target.value) || 0)}
                        className={inputCls}
                        placeholder="0"
                    />
                </div>
            </div>
            {trailingStopPct > 0 && stopLossPct > 0 && (
                <p className="text-[10px] text-indigo-400 mt-1">
                    Trail Stop overrides fixed SL distance
                </p>
            )}
        </div>
    );
};

export default RiskControls;
