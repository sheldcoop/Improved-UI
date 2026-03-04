import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Archive, Play, Trash2, Calendar, Target, Activity, Clock } from 'lucide-react';

interface SavedRun {
    id: string;
    run_type: 'BACKTEST' | 'REPLAY';
    symbol: string;
    strategy_id: string;
    created_at: string;
    summary: {
        strategyName: string;
        timeframe: string;
        totalTrades: number;
        winRate?: number;
        netPnl: number;
        netPnlPct?: number;
        maxDrawdown?: number;
        [key: string]: any;
    };
}

const Vault: React.FC = () => {
    const [runs, setRuns] = useState<SavedRun[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchRuns = async () => {
        try {
            const res = await fetch('/api/paper/runs');
            const data = await res.json();
            setRuns(data);
        } catch (err) {
            console.error('Failed to fetch runs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRuns();
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this specific run?')) return;
        try {
            await fetch(`/api/paper/runs/${id}`, { method: 'DELETE' });
            setRuns(r => r.filter(x => x.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 flex-1 overflow-y-auto w-full">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent flex items-center">
                        <Archive className="w-8 h-8 mr-3 text-emerald-500" />
                        Saved Runs Vault
                    </h1>
                    <p className="text-slate-400 mt-2">Historical Backtests and Replay Simulations persisted natively.</p>
                </div>
                <button onClick={fetchRuns} className="px-4 py-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 hover:text-white transition shadow-sm border border-slate-700">
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="text-slate-400">Loading vault records...</div>
                ) : runs.length === 0 ? (
                    <div className="text-slate-500 p-8 border border-dashed border-slate-800 rounded-lg col-span-full text-center">
                        No saved runs found. Try running a Backtest or Replay simulation first!
                    </div>
                ) : (
                    runs.map(run => {
                        const isProfit = run.summary?.netPnl >= 0;
                        return (
                            <Card key={run.id} className="p-6 relative overflow-hidden group border border-slate-800/60 hover:border-emerald-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-900/10">
                                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleDelete(run.id)} className="p-2 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition" title="Delete Run">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <div className="flex items-center space-x-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${run.run_type === 'BACKTEST' ? 'bg-blue-900/40 text-blue-400 border border-blue-800/50' : 'bg-purple-900/40 text-purple-400 border border-purple-800/50'}`}>
                                                {run.run_type}
                                            </span>
                                            <span className="text-xs text-slate-500">{new Date(run.created_at).toLocaleString()}</span>
                                        </div>
                                        <h3 className="text-xl font-bold mt-2 text-slate-100">{run.symbol}</h3>
                                        <div className="text-emerald-400 text-sm font-medium mt-0.5 line-clamp-1">{run.summary?.strategyName || `Strategy ${run.strategy_id}`}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mb-5">
                                    <div className="bg-slate-900/50 p-3 rounded border border-slate-800/50">
                                        <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider flex items-center mb-1">
                                            <Target className="w-3 h-3 mr-1" /> net p&l
                                        </div>
                                        <div className={`text-lg font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {isProfit ? '+' : ''}₹{Math.abs(run.summary?.netPnl || 0).toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 p-3 rounded border border-slate-800/50">
                                        <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider flex items-center mb-1">
                                            <Activity className="w-3 h-3 mr-1" /> win rate
                                        </div>
                                        <div className="text-lg font-bold text-slate-200">
                                            {(run.summary?.winRate || 0).toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 p-3 rounded border border-slate-800/50">
                                        <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider flex items-center mb-1">
                                            <Archive className="w-3 h-3 mr-1" /> trades
                                        </div>
                                        <div className="text-lg font-bold text-slate-200">
                                            {run.summary?.totalTrades || 0}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 p-3 rounded border border-slate-800/50">
                                        <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider flex items-center mb-1">
                                            <Clock className="w-3 h-3 mr-1" /> drawdown
                                        </div>
                                        <div className="text-lg font-bold text-red-400">
                                            -{(run.summary?.maxDrawdown || 0).toFixed(2)}%
                                        </div>
                                    </div>
                                </div>

                                <button
                                    className="w-full py-2.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded font-medium transition-all duration-300 flex items-center justify-center group-hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-emerald-500/30"
                                    onClick={() => alert('Viewing detailed runs will be a future implementation!')}
                                >
                                    <Play className="w-4 h-4 mr-2" /> Load Simulation
                                </button>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Vault;
