import React from 'react';
import { AlertTriangle, CheckCircle2, Calendar, Info } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface ResultRow {
    paramSet: Record<string, number>;
    score: number;
    winRate?: number;
    drawdown?: number;
    trades?: number;
}

interface Phase1ResultsTableProps {
    results: ResultRow[];
    optunaMetric: string;
    hasPhase2Results?: boolean;
    selectedParams: Record<string, number> | null;
    setSelectedParams: (params: Record<string, number>) => void;
    phase2Running: boolean;
    onReset: () => void;
    // Data range metadata from backend
    dataStartDate?: string;
    dataEndDate?: string;
    totalBars?: number;
    phase1EndDate?: string;
    phase1Bars?: number;
    splitRatio?: number;
}

/**
 * Phase 1 results table + data range banner.
 * Clicking a row auto-triggers Phase 2 via setSelectedParams (which calls handleSelectPhase1).
 */
const Phase1ResultsTable: React.FC<Phase1ResultsTableProps> = ({
    results, optunaMetric, hasPhase2Results,
    selectedParams, setSelectedParams,
    phase2Running,
    onReset,
    dataStartDate, dataEndDate, totalBars,
    phase1EndDate, phase1Bars, splitRatio,
}) => {
    const splitActive = splitRatio != null && splitRatio > 0 && phase1EndDate;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-slate-200">
                        {hasPhase2Results
                            ? 'Phase 1 — Strategy Params (reference)'
                            : 'Step 1 of 2 — Top Configurations Found'}
                    </h3>
                    <p className="text-xs text-amber-400 flex items-center mt-1">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {hasPhase2Results
                            ? 'These params are locked — scroll down to Phase 2 for the final result'
                            : 'In-sample results — click a row to run Phase 2 (SL/TP/TSL search)'}
                    </p>
                </div>
                <Button variant="secondary" onClick={onReset}>Reset</Button>
            </div>

            {/* Data range banner */}
            {dataStartDate && (
                splitActive ? (
                    /* Split was active — Phase 1 trained on a subset */
                    <div className="flex items-start gap-2 bg-indigo-900/20 border border-indigo-700/40 rounded-lg px-4 py-2.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                        <div className="text-xs text-indigo-300">
                            <span className="font-semibold">Phase 1 trained on:</span>{' '}
                            {dataStartDate} → {phase1EndDate}{' '}
                            <span className="text-indigo-400/70">
                                ({phase1Bars?.toLocaleString()} bars, {Math.round((splitRatio ?? 0) * 100)}% of total)
                            </span>
                        </div>
                    </div>
                ) : (
                    /* No split — both phases on full dataset */
                    <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-2.5">
                        <Info className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                        <div className="text-xs text-amber-300">
                            <span className="font-semibold">Phase 1 trained on full dataset:</span>{' '}
                            {dataStartDate} → {dataEndDate}{' '}
                            <span className="text-amber-400/70">({totalBars?.toLocaleString()} bars)</span>
                            <span className="text-amber-400/80 ml-1">
                                — Phase 2 will also use the full dataset. Enable "Split data between phases" on the Backtest page to prevent overlap.
                            </span>
                        </div>
                    </div>
                )
            )}

            <Card className="p-0 overflow-hidden">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950 text-slate-200">
                        <tr>
                            <th className="p-4 rounded-tl-lg">Rank</th>
                            <th className="p-4">Parameter Set</th>
                            <th className="p-4">Score ({optunaMetric})</th>
                            <th className="p-4">Win Rate</th>
                            <th className="p-4">Drawdown</th>
                            <th className="p-4">Trades</th>
                            <th className="p-4 text-right rounded-tr-lg">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {results.slice(0, 10).map((res, idx) => {
                            const isSelected = selectedParams !== null &&
                                JSON.stringify(selectedParams) === JSON.stringify(res.paramSet);
                            return (
                            <tr
                                key={idx}
                                onClick={() => setSelectedParams(res.paramSet)}
                                className={`cursor-pointer hover:bg-slate-800/50 group transition-colors ${isSelected ? 'bg-indigo-900/20 border-l-2 border-indigo-500' : ''}`}
                            >
                                <td className="p-4 font-bold text-emerald-500">#{idx + 1}</td>
                                <td className="p-4 font-mono text-xs text-slate-300">
                                    <div className="flex gap-2 flex-wrap">
                                        {Object.entries(res.paramSet).map(([k, v]) => (
                                            <span key={k} className="bg-slate-950 border border-slate-700 px-2 py-0.5 rounded">
                                                {k}: <span className="text-indigo-400">{v as React.ReactNode}</span>
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-4 text-slate-100 font-medium">{res.score.toFixed(4)}</td>
                                <td className="p-4">{res.winRate?.toFixed(1)}%</td>
                                <td className="p-4"><span className="text-red-400">-{res.drawdown?.toFixed(2)}%</span></td>
                                <td className="p-4">{res.trades}</td>
                                <td className="p-4 text-right">
                                    {isSelected && phase2Running ? (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-indigo-400">
                                            <span className="w-3.5 h-3.5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                                            Running Phase 2...
                                        </span>
                                    ) : isSelected ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-indigo-400 font-medium">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Selected
                                        </span>
                                    ) : (
                                        <span className="text-xs text-slate-600 group-hover:text-slate-400 transition-colors">
                                            Click to run Phase 2
                                        </span>
                                    )}
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </Card>

            {/* Hint for the user when no row is selected yet */}
            {!selectedParams && (
                <div className="px-4 py-3 rounded bg-slate-800/60 border border-slate-700 text-sm text-slate-400">
                    <strong className="text-indigo-400">Step 2 of 2</strong> — Click any row above to run Phase 2 (SL / TP / TSL search) locked to that RSI configuration.
                </div>
            )}
        </div>
    );
};

export default Phase1ResultsTable;
