import React from 'react';
import { StopCircle, Activity, Globe, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card } from '../ui/Card';
import { Strategy, StrategyPreset } from '../../types';

interface Monitor {
    id: string;
    symbol: string;
    strategy_id: string;
    config: any;
    timeframe: string;
    sl_pct: number | null;
    tp_pct: number | null;
    status: 'STARTING' | 'WATCHING' | 'ERROR' | 'STOPPED';
    created_at: string;
}

interface MonitorListProps {
    monitors: Monitor[];
    presets: StrategyPreset[];
    savedStrategies: Strategy[];
    onStopMonitor: (id: string) => Promise<void>;
    loadingId: string | null;
}

export const MonitorList: React.FC<MonitorListProps> = ({
    monitors,
    presets,
    savedStrategies,
    onStopMonitor,
    loadingId
}) => {
    const getStrategyName = (id: string) => {
        const p = presets.find(p => p.id === id);
        if (p) return p.name;
        const s = savedStrategies.find(s => s.id === id);
        if (s) return s.name;
        return 'Unknown Strategy';
    };

    const StatusIcon = ({ status }: { status: string }) => {
        switch (status) {
            case 'WATCHING': return <Activity className="w-4 h-4 text-emerald-400" />;
            case 'STARTING': return <Clock className="w-4 h-4 text-amber-400" />;
            case 'ERROR': return <AlertTriangle className="w-4 h-4 text-red-400" />;
            default: return <StopCircle className="w-4 h-4 text-slate-500" />;
        }
    };

    return (
        <Card title="Active Monitors" className="p-0 overflow-hidden" action={
            <div className="text-xs text-slate-500 bg-slate-900 border border-slate-800 px-2 py-1 rounded">
                <span className={monitors.length >= 3 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                    {monitors.length}
                </span> / 3 Active
            </div>
        }>
            {monitors.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center text-slate-500">
                    <Globe className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">No active monitors.</p>
                    <p className="text-xs mt-1">Start a monitor to watch for live signals.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                            <tr>
                                <th className="px-4 py-3 font-medium">Symbol</th>
                                <th className="px-4 py-3 font-medium">Timeframe</th>
                                <th className="px-4 py-3 font-medium">Strategy</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {monitors.map(m => (
                                <tr key={m.id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-4 py-3 font-bold text-slate-200">
                                        {m.symbol}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400">
                                        {m.timeframe}
                                    </td>
                                    <td className="px-4 py-3 text-slate-300">
                                        {getStrategyName(m.strategy_id)}
                                        {(m.sl_pct !== null || m.tp_pct !== null) && (
                                            <span className="ml-2 text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                                Custom SL/TP
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center space-x-2">
                                            <StatusIcon status={m.status} />
                                            <span className="text-xs font-bold text-slate-300">
                                                {m.status}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => onStopMonitor(m.id)}
                                            disabled={loadingId === m.id}
                                            className="px-3 py-1 bg-red-900/40 hover:bg-red-800/60 text-red-400 text-xs font-bold rounded border border-red-800/50 transition-colors disabled:opacity-50 inline-flex items-center"
                                        >
                                            {loadingId === m.id ? (
                                                <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin mr-1" />
                                            ) : (
                                                <StopCircle className="w-3 h-3 mr-1" />
                                            )}
                                            Stop
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};
