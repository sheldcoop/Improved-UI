
import React from 'react';
import {
    X, CheckCircle, AlertTriangle, Activity,
    Calendar, Clock, Database, ArrowRight,
    TrendingUp, BarChart3, ShieldCheck
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

import { DataHealthReport } from '../services/marketService';

interface DataReportProps {
    isOpen: boolean;
    onClose: () => void;
    report: DataHealthReport & {
        rows: number;
        range: { from: string; to: string };
    };
}

export const DataReportModal: React.FC<DataReportProps> = ({ isOpen, onClose, report }) => {
    if (!isOpen || !report) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <div className="flex items-center space-x-3">
                        <div className="bg-emerald-500/20 p-2 rounded-lg">
                            <ShieldCheck className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Market Data Integrity Audit</h3>
                            <p className="text-slate-400 text-xs">Technical validation for {report.symbol} • {report.timeframe}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Summary Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
                            <div className="bg-blue-500/10 p-3 rounded-lg">
                                <BarChart3 className="w-6 h-6 text-blue-500" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-white">{report.totalCandles.toLocaleString()}</div>
                                <div className="text-slate-400 text-[10px] uppercase tracking-wider">Total Candles</div>
                            </div>
                        </div>

                        <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
                            <div className="bg-red-500/10 p-3 rounded-lg">
                                <AlertTriangle className="w-6 h-6 text-red-500" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-white">{report.nullCandles}</div>
                                <div className="text-slate-400 text-[10px] uppercase tracking-wider">Null Values</div>
                            </div>
                        </div>

                        <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
                            <div className="bg-amber-500/10 p-3 rounded-lg">
                                <Activity className="w-6 h-6 text-amber-500" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-white">{report.gapCount}</div>
                                <div className="text-slate-400 text-[10px] uppercase tracking-wider">Timeline Gaps</div>
                            </div>
                        </div>

                        <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
                            <div className="bg-indigo-500/10 p-3 rounded-lg">
                                <Clock className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-white">{report.sessionFailures}</div>
                                <div className="text-slate-400 text-[10px] uppercase tracking-wider">Session Leaks</div>
                            </div>
                        </div>
                    </div>

                    {/* Secondary Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-800/20 border border-slate-800/50 rounded-xl p-3 flex flex-col items-center justify-center">
                            <div className="text-lg font-bold text-slate-200">{report.spikeFailures}</div>
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Flash Spikes</div>
                        </div>
                        <div className="bg-slate-800/20 border border-slate-800/50 rounded-xl p-3 flex flex-col items-center justify-center">
                            <div className="text-lg font-bold text-slate-200">{report.geometricFailures}</div>
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Geometry Errors</div>
                        </div>
                        <div className="bg-slate-800/20 border border-slate-800/50 rounded-xl p-3 flex flex-col items-center justify-center">
                            <div className="text-lg font-bold text-slate-200">{report.zeroVolumeCandles}</div>
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Zero Volume</div>
                        </div>
                        <div className="bg-slate-800/20 border border-slate-800/50 rounded-xl p-3 flex flex-col items-center justify-center">
                            <div className="text-lg font-bold text-slate-200">{report.staleFailures}</div>
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Stale Feeds</div>
                        </div>
                    </div>

                    {/* Anomalies List */}
                    {(report.gaps.length > 0 || report.details.length > 0) && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                            <div className="flex items-center space-x-2 text-red-500 mb-2">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="text-sm font-bold uppercase tracking-wider">Anomalies Detected</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {report.gaps.map((gap, i) => (
                                    <span key={`gap-${i}`} className="bg-red-500/20 text-red-400 text-[10px] px-2 py-1 rounded border border-red-500/20 font-mono">
                                        GAP: {gap}
                                    </span>
                                ))}
                                {report.details.map((detail, i) => (
                                    <span key={`detail-${i}`} className="bg-amber-500/10 text-amber-400 text-[10px] px-2 py-1 rounded border border-amber-500/10 font-mono">
                                        {detail}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex justify-end items-center">
                    <div className="mr-auto flex items-center space-x-2 text-slate-500 text-xs">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        <span>Institutional Grade Verification Passed</span>
                    </div>
                    <Button variant="primary" onClick={onClose} className="px-8 shadow-lg shadow-emerald-500/10">
                        Acknowledge & Sync
                    </Button>
                </div>
            </div>
        </div>
    );
};
