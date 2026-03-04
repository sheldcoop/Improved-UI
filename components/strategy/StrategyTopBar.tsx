import React from 'react';
import { DateRangePicker } from '../DateRangePicker';

const COMMON_SYMBOLS = [
    'NIFTY 50', 'BANKNIFTY', 'SENSEX',
    'RELIANCE', 'HDFCBANK', 'INFY', 'TCS', 'ICICIBANK',
    'SBIN', 'MARUTI', 'DLF', 'DIXON', 'BAJAJELEC',
    'PNB', 'AMBUJACEM', 'HDFCNIF100',
];

const DATE_INPUT_CLASS = "bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 outline-none w-36 cursor-pointer focus:border-emerald-500 [color-scheme:dark]";

interface StrategyTopBarProps {
    symbol: string;
    onSymbolChange: (s: string) => void;
    startDate: string;
    onStartDateChange: (d: string) => void;
    endDate: string;
    onEndDateChange: (d: string) => void;
    previewPrices: number[];
    previewDates: string[];
    previewEntryDates: string[];
    previewExitDates: string[];
    previewEntryCount: number;
    previewExitCount: number;
    previewLoading: boolean;
}

export const StrategyTopBar: React.FC<StrategyTopBarProps> = ({
    symbol, onSymbolChange,
    startDate, onStartDateChange,
    endDate, onEndDateChange,
    previewPrices, previewDates, previewEntryDates, previewExitDates,
    previewEntryCount, previewExitCount, previewLoading,
}) => {
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-end gap-4">
            {/* Symbol */}
            <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Symbol</label>
                <input
                    list="symbol-suggestions"
                    value={symbol}
                    onChange={e => onSymbolChange(e.target.value.toUpperCase())}
                    placeholder="e.g. NIFTY 50"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-emerald-500 placeholder-slate-600"
                />
                <datalist id="symbol-suggestions">
                    {COMMON_SYMBOLS.map(s => <option key={s} value={s} />)}
                </datalist>
            </div>

            <div className="flex-1 min-w-[300px]">
                <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    setStartDate={onStartDateChange}
                    setEndDate={onEndDateChange}
                />
            </div>

            {/* Divider */}
            <div className="hidden lg:block h-8 w-px bg-slate-700 self-end mb-1" />

            {/* Live Signal Minibar */}
            <div className="flex items-end gap-2 flex-1 min-w-[200px]">
                <div className="flex-1 h-9 bg-slate-950 rounded border border-slate-800 overflow-hidden relative">
                    {previewPrices.length > 0 ? (
                        <svg width="100%" height="100%" viewBox="0 0 300 36" preserveAspectRatio="none">
                            {(() => {
                                const ps = previewPrices;
                                const mn = Math.min(...ps), mx = Math.max(...ps);
                                const rng = Math.max(mx - mn, 1);
                                const toX = (i: number) => ps.length > 1 ? (i / (ps.length - 1)) * 300 : 150;
                                const toY = (p: number) => 36 - ((p - mn) / rng) * 32 - 2;
                                const d = ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ');
                                return (
                                    <>
                                        <path d={d} fill="none" stroke="#10b981" strokeWidth="1.5" />
                                        {previewDates.map((dt, i) => {
                                            if (previewEntryDates.includes(dt)) {
                                                const x = toX(i), y = toY(ps[i]);
                                                return <polygon key={`e${i}`} points={`${x},${y - 5} ${x - 3},${y} ${x + 3},${y}`} fill="#10b981" />;
                                            }
                                            if (previewExitDates.includes(dt)) {
                                                const x = toX(i), y = toY(ps[i]);
                                                return <polygon key={`x${i}`} points={`${x},${y + 5} ${x - 3},${y} ${x + 3},${y}`} fill="#ef4444" />;
                                            }
                                            return null;
                                        })}
                                    </>
                                );
                            })()}
                        </svg>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] text-slate-700">
                                {previewLoading ? 'Computing...' : 'Signal Preview'}
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex gap-3 shrink-0">
                    <div className="text-center">
                        <div className="text-sm font-bold text-emerald-400">{previewEntryCount}</div>
                        <div className="text-[9px] text-slate-600">Buys</div>
                    </div>
                    <div className="text-center">
                        <div className="text-sm font-bold text-red-400">{previewExitCount}</div>
                        <div className="text-[9px] text-slate-600">Sells</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
