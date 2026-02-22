import React from 'react';
import { ArrowRight, Calendar, Info } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface RiskResultRow {
    paramSet: Record<string, number>;
    score: number;
    winRate?: number;
    drawdown?: number;
    trades?: number;
}

interface Phase2ResultsTableProps {
    riskGrid: RiskResultRow[];
    optunaMetric: string;
    splitRatio?: number;
    combinedParams?: Record<string, number>;
    onApply: (combined: Record<string, number>) => void;
    // Date range metadata from backend
    phase2StartDate?: string;
    phase2Bars?: number;
    dataEndDate?: string;
    dataStartDate?: string;
    totalBars?: number;
}

/**
 * Phase 2 risk parameter results table with data-range banner.
 */
const Phase2ResultsTable: React.FC<Phase2ResultsTableProps> = ({
    riskGrid, optunaMetric, splitRatio, combinedParams, onApply,
    phase2StartDate, phase2Bars, dataEndDate, dataStartDate, totalBars,
}) => {
    const splitActive = splitRatio != null && splitRatio > 0 && phase2StartDate;

    return (
        <div className="space-y-4 mt-6">
            <div>
                <h4 className="text-lg font-semibold text-slate-200">Step 2 of 2 — Risk Parameter Results</h4>
            </div>

            {/* Data range banner */}
            {splitActive ? (
                <div className="flex items-start gap-2 bg-emerald-900/20 border border-emerald-700/40 rounded-lg px-4 py-2.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-emerald-300">
                        <span className="font-semibold">Phase 2 trained on:</span>{' '}
                        {phase2StartDate} → {dataEndDate}{' '}
                        <span className="text-emerald-400/70">
                            ({phase2Bars?.toLocaleString()} bars, {Math.round((1 - (splitRatio ?? 0)) * 100)}% of total — no overlap with Phase 1)
                        </span>
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-2.5">
                    <Info className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-300">
                        <span className="font-semibold">Phase 2 trained on full dataset:</span>{' '}
                        {dataStartDate} → {dataEndDate}{' '}
                        <span className="text-amber-400/70">({totalBars?.toLocaleString()} bars, same data as Phase 1)</span>
                    </div>
                </div>
            )}

            <Card className="p-0 overflow-hidden">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950 text-slate-200">
                        <tr>
                            <th className="p-4 rounded-tl-lg">Rank</th>
                            <th className="p-4">Risk Set</th>
                            <th className="p-4">Score ({optunaMetric})</th>
                            <th className="p-4">Win Rate</th>
                            <th className="p-4">Drawdown</th>
                            <th className="p-4">Trades</th>
                            <th className="p-4 text-right rounded-tr-lg">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {riskGrid.slice(0, 10).map((res, idx) => (
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
                                <td className="p-4 text-right">
                                    <Button
                                        size="sm"
                                        onClick={() => onApply({ ...(combinedParams ?? {}), ...res.paramSet })}
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
        </div>
    );
};

export default Phase2ResultsTable;
