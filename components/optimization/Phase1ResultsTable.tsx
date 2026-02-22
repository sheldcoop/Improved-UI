import React from 'react';
import { AlertTriangle, CheckCircle2, ArrowRight, Calendar, Info } from 'lucide-react';
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
    enableRiskSearch: boolean;
    selectedParams: Record<string, number> | null;
    setSelectedParams: (params: Record<string, number> | null) => void;
    running: boolean;
    dataStatus: string;
    onApply: (paramSet: Record<string, number>) => void;
    onRunPhase2: (selectedParams: Record<string, number>) => void;
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
 * Phase 1 results table + data range banner + Phase 2 "Choose → Run" control.
 */
const Phase1ResultsTable: React.FC<Phase1ResultsTableProps> = ({
    results, optunaMetric, enableRiskSearch,
    selectedParams, setSelectedParams,
    running, dataStatus,
    onApply, onRunPhase2, onReset,
    dataStartDate, dataEndDate, totalBars,
    phase1EndDate, phase1Bars, splitRatio,
}) => {
    const dataReady = dataStatus === 'READY';
    const splitActive = splitRatio != null && splitRatio > 0 && phase1EndDate;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-slate-200">
                        {enableRiskSearch ? 'Step 1 of 2 — ' : ''}Top Configurations Found
                    </h3>
                    <p className="text-xs text-amber-400 flex items-center mt-1">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        In-sample results — verify with Walk-Forward before trading
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
                            {enableRiskSearch && (
                                <span className="text-amber-400/80 ml-1">
                                    — Phase 2 will also use the full dataset. Enable "Split data between phases" to prevent Phase 1/2 overlap.
                                </span>
                            )}
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
                        {results.slice(0, 10).map((res, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/50 group transition-colors">
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
                                <td className="p-4 text-right flex space-x-2 justify-end">
                                    {enableRiskSearch && (
                                        <Button
                                            size="sm"
                                            variant={selectedParams === res.paramSet ? 'secondary' : 'ghost'}
                                            onClick={() => setSelectedParams(res.paramSet)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                                            icon={<CheckCircle2 className="w-4 h-4" />}
                                        >
                                            {selectedParams === res.paramSet ? 'Selected' : 'Choose'}
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        onClick={() => onApply(res.paramSet)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                        icon={<ArrowRight className="w-4 h-4" />}
                                    >
                                        Apply
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            {/* Phase 2 control section */}
            {enableRiskSearch && (
                <div className="mt-4 px-4 py-3 rounded bg-slate-800 border border-slate-700">
                    {!selectedParams ? (
                        <p className="text-sm text-slate-300">
                            <strong className="text-indigo-400">Step 2 of 2</strong> — Pick the best config above and click{' '}
                            <strong>Choose</strong>, then <strong>Run SL/TP Search</strong> to find optimal stop-loss and take-profit.
                        </p>
                    ) : (
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Step 2 of 2 — RSI params locked:</p>
                                <span className="text-sm text-slate-200 font-mono">
                                    {Object.entries(selectedParams).map(([k, v]) => `${k}: ${v}`).join(', ')}
                                </span>
                            </div>
                            <Button
                                size="sm"
                                disabled={!dataReady || running}
                                onClick={() => onRunPhase2(selectedParams)}
                            >
                                Run SL/TP Search
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Phase1ResultsTable;
