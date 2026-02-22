import React from 'react';

interface RiskControlsProps {
    stopLossEnabled: boolean;
    setStopLossEnabled: (v: boolean) => void;
    stopLossPct: number;
    setStopLossPct: (v: number) => void;
    useTrailingStop: boolean;
    setUseTrailingStop: (v: boolean) => void;
    takeProfitEnabled: boolean;
    setTakeProfitEnabled: (v: boolean) => void;
    takeProfitPct: number;
    setTakeProfitPct: (v: number) => void;
}

/**
 * Stop Loss (+ Trailing Stop) and Take Profit toggle controls.
 * Each shows a checkbox; checking reveals the value input.
 * TSL is nested inside the SL group — only visible when SL is enabled.
 */
const RiskControls: React.FC<RiskControlsProps> = ({
    stopLossEnabled, setStopLossEnabled, stopLossPct, setStopLossPct,
    useTrailingStop, setUseTrailingStop,
    takeProfitEnabled, setTakeProfitEnabled, takeProfitPct, setTakeProfitPct,
}) => {
    const checkboxCls = 'rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500';
    const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none';
    const labelCls = 'flex items-center space-x-2 text-xs text-slate-400 cursor-pointer';

    return (
        <div className="space-y-3 pt-3 border-t border-slate-700/50">
            {/* Stop Loss */}
            <div className={stopLossEnabled ? 'p-2 bg-slate-900/60 rounded-lg border border-slate-700/60 space-y-2' : 'space-y-2'}>
                <label className={labelCls}>
                    <input
                        type="checkbox"
                        checked={stopLossEnabled}
                        onChange={e => {
                            setStopLossEnabled(e.target.checked);
                            if (!e.target.checked) {
                                setStopLossPct(0);
                                setUseTrailingStop(false);
                            }
                        }}
                        className={checkboxCls}
                    />
                    <span>Stop Loss %</span>
                </label>
                {stopLossEnabled && (
                    <>
                        <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={stopLossPct || 2}
                            onChange={e => setStopLossPct(parseFloat(e.target.value))}
                            className={inputCls}
                        />
                        <label className={`${labelCls} pt-1 border-t border-slate-700/50`}>
                            <input
                                type="checkbox"
                                checked={useTrailingStop}
                                onChange={e => setUseTrailingStop(e.target.checked)}
                                className={checkboxCls}
                            />
                            <span>Trailing Stop</span>
                        </label>
                    </>
                )}
            </div>

            {/* Take Profit */}
            <div>
                <label className={`${labelCls} mb-1`}>
                    <input
                        type="checkbox"
                        checked={takeProfitEnabled}
                        onChange={e => {
                            setTakeProfitEnabled(e.target.checked);
                            if (!e.target.checked) setTakeProfitPct(0);
                        }}
                        className={checkboxCls}
                    />
                    <span>Take Profit %</span>
                </label>
                {takeProfitEnabled && (
                    <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={takeProfitPct || 2}
                        onChange={e => setTakeProfitPct(parseFloat(e.target.value))}
                        className={inputCls}
                    />
                )}
            </div>
        </div>
    );
};

export default RiskControls;
