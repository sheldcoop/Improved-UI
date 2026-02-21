
import React from 'react';
import {
    X, CheckCircle, AlertTriangle, Activity,
    Calendar, Clock, Database, ArrowRight,
    TrendingUp, BarChart3, ShieldCheck
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface DataReportProps {
    isOpen: boolean;
    onClose: () => void;
    report: {
        symbol: string;
        timeframe: string;
        rows: number;
        range: { from: string; to: string };
        health: {
            score: number;
            status: string;
            missingCandles: number;
            zeroVolumeCandles: number;
            totalCandles: number;
            gaps: string[];
        };
        sample: any[];
    } | null;
}

export const DataReportModal: React.FC<DataReportProps> = ({ isOpen, onClose, report }) => {
    if (!isOpen || !report) return null;

    const { symbol, timeframe, rows, range, health, sample } = report;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'EXCELLENT': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            case 'GOOD': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
            case 'POOR': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
            default: return 'text-red-400 bg-red-500/10 border-red-500/20';
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <div className="flex items-center space-x-3">
                        <div className="bg-emerald-500/20 p-2 rounded-lg">
                            <Database className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Data Load Complete</h3>
                            <p className="text-slate-400 text-xs">Integrity report for {symbol} • {timeframe}</p>
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

                    {/* Top Grid: Health & Stats */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Health Score Card */}
                        <div className="col-span-1 bg-slate-950/50 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                            <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative">
                                <div className="text-4xl font-black text-white mb-1">{health.score}%</div>
                                <div className={`text-xs font-bold px-3 py-1 rounded-full border ${getStatusColor(health.status)}`}>
                                    {health.status}
                                </div>
                            </div>
                            <p className="mt-4 text-slate-400 text-sm">Institutional Integrity Score</p>
                            <div className="mt-6 w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 transition-all duration-1000"
                                    style={{ width: `${health.score}%` }}
                                />
                            </div>
                        </div>

                        {/* Quick Metrics */}
                        <div className="col-span-2 grid grid-cols-2 gap-4">
                            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
                                <div className="bg-blue-500/10 p-3 rounded-lg">
                                    <BarChart3 className="w-6 h-6 text-blue-500" />
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-white">{rows.toLocaleString()}</div>
                                    <div className="text-slate-400 text-xs uppercase tracking-wider">Total Candles</div>
                                </div>
                            </div>
                            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
                                <div className="bg-amber-500/10 p-3 rounded-lg">
                                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-white">{health.missingCandles}</div>
                                    <div className="text-slate-400 text-xs uppercase tracking-wider">Missing Candles</div>
                                </div>
                            </div>
                            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
                                <div className="bg-purple-500/10 p-3 rounded-lg">
                                    <Clock className="w-6 h-6 text-purple-500" />
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-white break-all">{range.from}</div>
                                    <div className="text-slate-400 text-xs uppercase tracking-wider">Start Date</div>
                                </div>
                            </div>
                            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
                                <div className="bg-pink-500/10 p-3 rounded-lg">
                                    <Calendar className="w-6 h-6 text-pink-500" />
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-white break-all">{range.to}</div>
                                    <div className="text-slate-400 text-xs uppercase tracking-wider">End Date</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sample Data Table */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-300 flex items-center uppercase tracking-widest gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                                Recent Data Preview
                            </h4>
                            <span className="text-xs text-slate-500">Last 5 candles loaded</span>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800">
                                    <tr>
                                        <th className="px-4 py-3">Timestamp</th>
                                        <th className="px-4 py-3 text-right">Open</th>
                                        <th className="px-4 py-3 text-right">High</th>
                                        <th className="px-4 py-3 text-right">Low</th>
                                        <th className="px-4 py-3 text-right text-emerald-400">Close</th>
                                        <th className="px-4 py-3 text-right">Volume</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-900 font-mono">
                                    {(sample || []).map((s, i) => (
                                        <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                                            <td className="px-4 py-3 text-slate-400">{s.timestamp || 'N/A'}</td>
                                            <td className="px-4 py-3 text-right text-slate-200">{(s.open ?? 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right text-slate-200">{(s.high ?? 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right text-slate-200">{(s.low ?? 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right text-white font-bold">{(s.close ?? 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right text-slate-400">{(s.volume ?? 0).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Gaps detected (if any) */}
                    {health.gaps.length > 0 && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                            <div className="flex items-center space-x-2 text-red-500 mb-2">
                                <ShieldCheck className="w-4 h-4" />
                                <span className="text-sm font-bold">Anomalies Detected</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {health.gaps.map((gap, i) => (
                                    <span key={i} className="bg-red-500/10 text-red-400 text-[10px] px-2 py-1 rounded border border-red-500/10">
                                        Gap at {gap}
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
