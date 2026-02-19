import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, RefreshCw, Trash2, Bug, Wifi, Server, Activity, AlertTriangle, Database, Sliders, Split, CheckCircle, Info, PlayCircle, Layers } from 'lucide-react';
import { CONFIG } from '../config';

// Define Custom Event for Network logging
export const logNetworkEvent = (event: any) => {
    const customEvent = new CustomEvent('debug:network', { detail: event });
    window.dispatchEvent(customEvent);
};

// Define Custom Event for Alerts
export const logAlert = (alerts: any[]) => {
    const customEvent = new CustomEvent('debug:alerts', { detail: alerts });
    window.dispatchEvent(customEvent);
};

// --- PHASE 2 INSPECTOR EVENTS ---
export const logActiveRun = (run: any) => {
    const customEvent = new CustomEvent('debug:active-run', { detail: run });
    window.dispatchEvent(customEvent);
};

export const logDataHealth = (report: any) => {
    const customEvent = new CustomEvent('debug:data-health', { detail: report });
    window.dispatchEvent(customEvent);
};

export const logWFOBreakdown = (results: any[]) => {
    const customEvent = new CustomEvent('debug:wfo-breakdown', { detail: results });
    window.dispatchEvent(customEvent);
};

export const logOptunaResults = (trials: any[]) => {
    const customEvent = new CustomEvent('debug:optuna-results', { detail: trials });
    window.dispatchEvent(customEvent);
};

interface LogEntry {
    ts: string;
    level: string;
    msg: string;
    module: string;
    meta?: any;
}

interface AlertEntry {
    type: 'warning' | 'success' | 'info' | 'error';
    msg: string;
    timestamp: string;
}

interface NetworkEntry {
    id: string;
    method: string;
    url: string;
    status?: number;
    duration?: string;
    timestamp: string;
    type: 'req' | 'res' | 'err';
}

const DebugConsole: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'NETWORK' | 'SERVER' | 'ALERTS' | 'RUN' | 'DATA' | 'WFO' | 'OPTUNA'>('SERVER');
    const [serverLogs, setServerLogs] = useState<LogEntry[]>([]);
    const [networkLogs, setNetworkLogs] = useState<NetworkEntry[]>([]);
    const [alerts, setAlerts] = useState<AlertEntry[]>([]);

    // Phase 2 Inspector States
    const [activeRun, setActiveRun] = useState<any>(null);
    const [dataHealth, setDataHealth] = useState<any>(null);
    const [wfoBreakdown, setWfoBreakdown] = useState<any[]>([]);
    const [optunaTrials, setOptunaTrials] = useState<any[]>([]);

    const [autoScroll, setAutoScroll] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('connected');
    const [errorCount, setErrorCount] = useState(0);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // --- FRONTEND NETWORK LISTENER ---
    useEffect(() => {
        const handleNetworkEvent = (e: any) => {
            setNetworkLogs(prev => [e.detail, ...prev].slice(0, 100)); // Keep last 100
        };
        const handleAlertEvent = (e: any) => {
            const newAlerts = e.detail.map((a: any) => ({
                ...a,
                timestamp: new Date().toLocaleTimeString()
            }));
            setAlerts(prev => [...newAlerts, ...prev].slice(0, 50));
            // Auto switch to alerts if it's a new batch? Maybe not to avoid annoyance.
        };

        window.addEventListener('debug:network', handleNetworkEvent);
        window.addEventListener('debug:alerts', handleAlertEvent);

        // Phase 2 Listeners
        const handleActiveRun = (e: any) => {
            setActiveRun(e.detail);
            if (e.detail?.status === 'running') setActiveTab('RUN');
        };
        const handleDataHealth = (e: any) => setDataHealth(e.detail);
        const handleWFO = (e: any) => setWfoBreakdown(e.detail);
        const handleOptuna = (e: any) => setOptunaTrials(e.detail);

        window.addEventListener('debug:active-run', handleActiveRun);
        window.addEventListener('debug:data-health', handleDataHealth);
        window.addEventListener('debug:wfo-breakdown', handleWFO);
        window.addEventListener('debug:optuna-results', handleOptuna);

        return () => {
            window.removeEventListener('debug:network', handleNetworkEvent);
            window.removeEventListener('debug:alerts', handleAlertEvent);
            window.removeEventListener('debug:active-run', handleActiveRun);
            window.removeEventListener('debug:data-health', handleDataHealth);
            window.removeEventListener('debug:wfo-breakdown', handleWFO);
            window.removeEventListener('debug:optuna-results', handleOptuna);
        };
    }, []);

    // --- BACKEND LOG POLLER ---
    useEffect(() => {
        if (!isOpen || activeTab !== 'SERVER') return;

        if (errorCount > 3) {
            setConnectionStatus('disconnected');
            return;
        }

        const fetchLogs = async () => {
            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/debug/logs`);
                if (response.ok) {
                    const data = await response.json();
                    setServerLogs(data.reverse()); // Show newest first
                    setConnectionStatus('connected');
                    setErrorCount(0);
                } else {
                    setErrorCount(prev => prev + 1);
                }
            } catch (e) {
                setErrorCount(prev => prev + 1);
            }
        };

        fetchLogs();
        const interval = setInterval(fetchLogs, 2000);
        return () => clearInterval(interval);
    }, [isOpen, activeTab, errorCount]);

    const handleRetryConnection = () => {
        setErrorCount(0);
        setConnectionStatus('connected');
    };

    useEffect(() => {
        if (autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = 0;
        }
    }, [serverLogs, networkLogs, alerts, autoScroll]);

    const clearServerLogs = async () => {
        if (connectionStatus === 'connected') {
            try {
                await fetch(`${CONFIG.API_BASE_URL}/debug/clear`, { method: 'POST' });
            } catch (e) { }
        }
        setServerLogs([]);
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-4 right-4 border p-3 rounded-full shadow-lg shadow-black/50 hover:scale-105 transition-all z-50 group ${connectionStatus === 'connected' ? 'bg-slate-900 border-slate-700 text-emerald-400 hover:bg-slate-800' : 'bg-red-900/50 border-red-700 text-red-400 hover:bg-red-900'}`}
                title="Open God-Level Debugger"
            >
                <Bug className="w-6 h-6 animate-pulse" />
                {alerts.some(a => a.type === 'warning') && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[10px] flex items-center justify-center text-white font-bold italic">!</span>
                    </span>
                )}
            </button>
        );
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 h-[400px] bg-[#0c0c0c] border-t-2 border-emerald-500/50 shadow-2xl z-50 flex flex-col font-mono text-sm transition-transform duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center space-x-4">
                    <div className="flex items-center text-emerald-400 font-bold space-x-2">
                        <Terminal className="w-4 h-4" />
                        <span>GOD_MODE_TERMINAL_v1</span>
                    </div>
                    <div className="h-4 w-[1px] bg-slate-700"></div>
                    <div className="flex space-x-1">
                        <div className="flex bg-slate-800 rounded p-0.5 mr-2">
                            {[
                                { id: 'RUN', label: 'Run', icon: <Activity className="w-3 h-3" /> },
                                { id: 'DATA', label: 'Data', icon: <Database className="w-3 h-3" /> },
                                { id: 'ALERTS', label: 'Alerts', icon: <AlertTriangle className="w-3 h-3" /> }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`px-2 py-1 rounded text-[10px] flex items-center space-x-1 transition-colors ${activeTab === tab.id ? 'bg-emerald-600/30 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {tab.icon}
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex bg-slate-950 rounded p-0.5">
                            {[
                                { id: 'SERVER', label: 'Server', icon: <Server className="w-3 h-3" /> },
                                { id: 'NETWORK', label: 'Network', icon: <Wifi className="w-3 h-3" /> },
                                { id: 'WFO', label: 'WFO', icon: <Split className="w-3 h-3" /> },
                                { id: 'OPTUNA', label: 'Optuna', icon: <Sliders className="w-3 h-3" /> }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`px-2 py-1 rounded text-[10px] flex items-center space-x-1 transition-colors ${activeTab === tab.id ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'text-slate-600 hover:text-slate-400'}`}
                                >
                                    {tab.icon}
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    {connectionStatus === 'disconnected' && activeTab === 'SERVER' && (
                        <button onClick={handleRetryConnection} className="flex items-center space-x-1 text-xs text-red-400 hover:text-red-300 mr-2 bg-red-900/20 px-2 py-1 rounded border border-red-800">
                            <RefreshCw className="w-3 h-3" />
                            <span>Retry Connection</span>
                        </button>
                    )}
                    <label className="flex items-center space-x-2 text-xs text-slate-500 cursor-pointer">
                        <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="rounded border-slate-700 bg-slate-800" />
                        <span>Auto-Scroll</span>
                    </label>
                    <button onClick={activeTab === 'SERVER' ? clearServerLogs : activeTab === 'ALERTS' ? () => setAlerts([]) : () => setNetworkLogs([])} className="text-slate-500 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
                <div
                    ref={logContainerRef}
                    className="absolute inset-0 overflow-y-auto p-4 space-y-1 font-mono text-xs"
                    style={{ scrollBehavior: 'smooth' }}
                >
                    {activeTab === 'SERVER' && (
                        connectionStatus === 'disconnected' ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-4">
                                <AlertTriangle className="w-10 h-10 text-red-500/50" />
                                <div className="text-center">
                                    <p className="text-red-400 font-bold mb-1">Backend Connection Lost</p>
                                    <p className="text-xs">Using fallback mock data for application features.</p>
                                </div>
                                <button onClick={handleRetryConnection} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-xs">Try Reconnecting</button>
                            </div>
                        ) : serverLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
                                <Activity className="w-8 h-8 opacity-50" />
                                <p>Waiting for server activity...</p>
                            </div>
                        ) : (
                            serverLogs.filter(l => l.module !== '_internal').map((log, idx) => (
                                <div key={idx} className="flex space-x-2 hover:bg-white/5 p-0.5 rounded group transition-colors">
                                    <span className="text-slate-500 shrink-0">[{log.ts}]</span>
                                    <span className={`shrink-0 w-16 font-bold ${log.level === 'INFO' ? 'text-blue-400' :
                                        log.level === 'WARNING' ? 'text-yellow-400' :
                                            log.level === 'ERROR' ? 'text-red-500' : 'text-slate-300'
                                        }`}>
                                        {log.level}
                                    </span>
                                    <span className="text-slate-500 shrink-0 w-24 truncate">[{log.module}]</span>
                                    <span className="text-slate-300 break-all flex-1">
                                        {log.msg}
                                        {log.meta && Object.keys(log.meta).length > 0 && (
                                            <span className="text-slate-600 ml-2 text-[10px] hidden group-hover:inline italic">
                                                {JSON.stringify(log.meta)}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            ))
                        )
                    )}

                    {activeTab === 'NETWORK' && (
                        networkLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
                                <Wifi className="w-8 h-8 opacity-50" />
                                <p>No network activity detected yet.</p>
                            </div>
                        ) : (
                            networkLogs.map((log, idx) => (
                                <div key={idx} className="flex space-x-3 hover:bg-white/5 p-1 rounded border-b border-white/5">
                                    <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                                    <span className={`shrink-0 font-bold ${log.type === 'req' ? 'text-yellow-400' :
                                        log.type === 'err' ? 'text-red-500' : 'text-emerald-400'
                                        }`}>
                                        {log.type === 'req' ? '-> REQ' : log.type === 'err' ? '!! ERR' : '<- RES'}
                                    </span>
                                    <span className="text-slate-300 font-bold shrink-0">{log.method}</span>
                                    <span className="text-slate-400 shrink-0">{log.status ? `[${log.status}]` : '...'}</span>
                                    <span className="text-slate-300 truncate flex-1">{log.url}</span>
                                    {log.duration && <span className="text-slate-500 shrink-0">{log.duration}</span>}
                                </div>
                            ))
                        )
                    )}

                    {activeTab === 'ALERTS' && (
                        alerts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
                                <AlertTriangle className="w-8 h-8 opacity-50" />
                                <p>No strategy alerts detected.</p>
                                <p className="text-[10px]">Diagnostics run automatically after simulation.</p>
                            </div>
                        ) : (
                            alerts.map((alert, idx) => (
                                <div key={idx} className={`p-3 rounded border mb-2 flex items-start space-x-3 ${alert.type === 'warning' ? 'bg-yellow-900/10 border-yellow-700/30 text-yellow-200' :
                                    alert.type === 'success' ? 'bg-emerald-900/10 border-emerald-700/30 text-emerald-200' :
                                        alert.type === 'error' ? 'bg-red-900/10 border-red-700/30 text-red-200' : 'bg-blue-900/10 border-blue-700/30 text-blue-200'
                                    }`}>
                                    <div className="mt-0.5">
                                        {alert.type === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                                        {alert.type === 'success' && <Activity className="w-4 h-4 text-emerald-500" />}
                                        {alert.type === 'error' && <X className="w-4 h-4 text-red-500" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold flex justify-between">
                                            <span>{alert.type.toUpperCase()}</span>
                                            <span className="text-[10px] opacity-50">{alert.timestamp}</span>
                                        </div>
                                        <div className="text-xs mt-1 opacity-90">{alert.msg}</div>
                                    </div>
                                </div>
                            ))
                        )
                    )}

                    {activeTab === 'RUN' && (
                        !activeRun ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
                                <PlayCircle className="w-8 h-8 opacity-50" />
                                <p>No backtest or optimization active.</p>
                            </div>
                        ) : (
                            <div className="p-4 space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-emerald-400">
                                    <div className="flex items-center space-x-2">
                                        <Activity className="w-4 h-4" />
                                        <span className="font-bold">{activeRun.type} IN PROGRESS</span>
                                    </div>
                                    <span className="animate-pulse">● LIVE</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
                                        <label className="text-[10px] text-slate-500 block mb-1 uppercase font-bold tracking-wider">Strategy Context</label>
                                        <div className="text-xs text-slate-200">{activeRun.strategyName}</div>
                                        <div className="text-[10px] text-slate-600 mt-1">{activeRun.symbol} • {activeRun.timeframe}</div>
                                    </div>
                                    <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
                                        <label className="text-[10px] text-slate-500 block mb-1 uppercase font-bold tracking-wider">Date Range</label>
                                        <div className="text-xs text-slate-200 font-mono italic">{activeRun.startDate} → {activeRun.endDate}</div>
                                    </div>
                                </div>
                                <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
                                    <label className="text-[10px] text-slate-500 block mb-1 uppercase font-bold tracking-wider">Configuration Parameters</label>
                                    <div className="grid grid-cols-3 gap-2 mt-2">
                                        {Object.entries(activeRun.params || {}).map(([k, v]: [any, any]) => (
                                            <div key={k} className="flex justify-between bg-black/40 px-2 py-1 rounded text-[10px]">
                                                <span className="text-slate-500">{k}</span>
                                                <span className="text-emerald-400 font-mono">{JSON.stringify(v)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )
                    )}

                    {activeTab === 'DATA' && (
                        !dataHealth ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
                                <Database className="w-8 h-8 opacity-50" />
                                <p>Load data to view health diagnostics.</p>
                            </div>
                        ) : (
                            <div className="p-4 space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                    <div className="flex items-center space-x-2 text-blue-400">
                                        <Database className="w-4 h-4" />
                                        <span className="font-bold">DATA INTEGRITY REPORT</span>
                                    </div>
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${dataHealth.status === 'EXCELLENT' ? 'bg-emerald-900 text-emerald-400' : 'bg-yellow-900 text-yellow-400'}`}>
                                        {dataHealth.status}
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { label: 'Score', val: dataHealth.score + '%', icon: <Activity className="w-3 h-3" /> },
                                        { label: 'Candles', val: dataHealth.totalCandles, icon: <Layers className="w-3 h-3" /> },
                                        { label: 'Missing', val: dataHealth.missingCandles, icon: <AlertTriangle className="w-3 h-3 text-red-400" /> },
                                        { label: 'Zero Vol', val: dataHealth.zeroVolumeCandles, icon: <Activity className="w-3 h-3 text-yellow-500" /> }
                                    ].map(item => (
                                        <div key={item.label} className="bg-slate-900/50 p-2 rounded border border-slate-800 flex flex-col items-center">
                                            <div className="text-slate-600 mb-1">{item.icon}</div>
                                            <div className="text-[10px] text-slate-500 mb-0.5">{item.label}</div>
                                            <div className="text-xs font-mono font-bold text-slate-200">{item.val}</div>
                                        </div>
                                    ))}
                                </div>
                                {dataHealth.gaps && dataHealth.gaps.length > 0 && (
                                    <div className="bg-red-900/10 border border-red-900/30 p-3 rounded">
                                        <div className="text-[10px] text-red-400 font-bold mb-1">DATA GAPS DETECTED</div>
                                        <div className="text-[9px] text-slate-400 max-h-20 overflow-y-auto">
                                            {dataHealth.gaps.map((g: any, i: number) => <div key={i}>• Gap near {g}</div>)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    )}

                    {activeTab === 'WFO' && (
                        wfoBreakdown.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
                                <Split className="w-8 h-8 opacity-50" />
                                <p>Run Walk-Forward Optimization to view results.</p>
                            </div>
                        ) : (
                            <div className="p-4 overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[600px]">
                                    <thead>
                                        <tr className="border-b border-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                                            <th className="py-2 px-1">Period</th>
                                            <th className="py-2 px-1">Best Parameters</th>
                                            <th className="py-2 px-1 text-right">Trades</th>
                                            <th className="py-2 px-1 text-right">Return</th>
                                            <th className="py-2 px-1 text-right">Sharpe</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-[10px] text-slate-300">
                                        {wfoBreakdown.map((row, i) => (
                                            <tr key={i} className="border-b border-slate-900/50 hover:bg-slate-900/30 transition-colors">
                                                <td className="py-2 px-1 text-slate-400">{row.period.split(': ')[1]}</td>
                                                <td className="py-2 px-1 font-mono text-emerald-500/80">{row.params}</td>
                                                <td className="py-2 px-1 text-right">{row.trades}</td>
                                                <td className={`py-2 px-1 text-right font-bold ${row.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{row.returnPct}%</td>
                                                <td className="py-2 px-1 text-right">{row.sharpe}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}

                    {activeTab === 'OPTUNA' && (
                        optunaTrials.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
                                <Sliders className="w-8 h-8 opacity-50" />
                                <p>Run Optuna Auto-Tune to view trial rankings.</p>
                            </div>
                        ) : (
                            <div className="p-4 space-y-4">
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-1">Optimization Trials (Top 10 Ranked)</div>
                                <div className="space-y-1">
                                    {optunaTrials.slice(0, 10).map((trial, i) => (
                                        <div key={i} className="flex items-center space-x-3 bg-slate-900/50 p-2 rounded border border-slate-800 hover:border-emerald-500/50 transition-colors group">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${i === 0 ? 'bg-yellow-500 text-black' : i === 1 ? 'bg-slate-300 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                                {i + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[9px] font-mono text-emerald-400 truncate">{JSON.stringify(trial.paramSet)}</div>
                                            </div>
                                            <div className="flex space-x-4 shrink-0 font-mono text-[10px]">
                                                <div><span className="text-slate-600 mr-2">SHP</span><span className="text-slate-200">{trial.sharpe}</span></div>
                                                <div><span className="text-slate-600 mr-2">RET</span><span className={`font-bold ${trial.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{trial.returnPct}%</span></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default DebugConsole;