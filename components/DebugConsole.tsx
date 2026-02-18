import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, RefreshCw, Trash2, Bug, Wifi, Server, Activity, AlertTriangle } from 'lucide-react';
import { CONFIG } from '../config';

// Define Custom Event for Network logging
export const logNetworkEvent = (event: any) => {
    const customEvent = new CustomEvent('debug:network', { detail: event });
    window.dispatchEvent(customEvent);
};

interface LogEntry {
    ts: string;
    level: string;
    msg: string;
    module: string;
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
    const [activeTab, setActiveTab] = useState<'NETWORK' | 'SERVER'>('SERVER');
    const [serverLogs, setServerLogs] = useState<LogEntry[]>([]);
    const [networkLogs, setNetworkLogs] = useState<NetworkEntry[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('connected');
    const [errorCount, setErrorCount] = useState(0);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // --- FRONTEND NETWORK LISTENER ---
    useEffect(() => {
        const handleNetworkEvent = (e: any) => {
            setNetworkLogs(prev => [e.detail, ...prev].slice(0, 100)); // Keep last 100
        };

        window.addEventListener('debug:network', handleNetworkEvent);
        return () => window.removeEventListener('debug:network', handleNetworkEvent);
    }, []);

    // --- BACKEND LOG POLLER ---
    useEffect(() => {
        if (!isOpen || activeTab !== 'SERVER') return;
        
        // Stop polling if we have too many errors (Backend likely offline)
        if (errorCount > 3) {
            setConnectionStatus('disconnected');
            return;
        }

        const fetchLogs = async () => {
            try {
                // Avoid logging this fetch itself to prevent infinite loop spam in console
                const response = await fetch(`${CONFIG.API_BASE_URL}/debug/logs`);
                if (response.ok) {
                    const data = await response.json();
                    setServerLogs(data.reverse()); // Show newest first
                    setConnectionStatus('connected');
                    setErrorCount(0); // Reset error count on success
                } else {
                    setErrorCount(prev => prev + 1);
                }
            } catch (e) {
                setErrorCount(prev => prev + 1);
            }
        };

        fetchLogs();
        const interval = setInterval(fetchLogs, 2000); // Poll every 2s
        return () => clearInterval(interval);
    }, [isOpen, activeTab, errorCount]);

    const handleRetryConnection = () => {
        setErrorCount(0);
        setConnectionStatus('connected');
    };

    // Auto Scroll Logic
    useEffect(() => {
        if (autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = 0;
        }
    }, [serverLogs, networkLogs, autoScroll]);

    const clearServerLogs = async () => {
        if (connectionStatus === 'connected') {
            try {
                await fetch(`${CONFIG.API_BASE_URL}/debug/clear`, { method: 'POST' });
            } catch (e) {
                 // ignore
            }
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
                <span className="absolute right-full mr-2 top-2 bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    Debug Console {connectionStatus === 'disconnected' && '(Offline)'}
                </span>
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
                        <button 
                            onClick={() => setActiveTab('SERVER')}
                            className={`px-3 py-1 rounded text-xs flex items-center space-x-2 ${activeTab === 'SERVER' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Server className="w-3 h-3" />
                            <span>Server Logs</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('NETWORK')}
                            className={`px-3 py-1 rounded text-xs flex items-center space-x-2 ${activeTab === 'NETWORK' ? 'bg-blue-900/50 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Wifi className="w-3 h-3" />
                            <span>Network Stream</span>
                        </button>
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
                    <button onClick={activeTab === 'SERVER' ? clearServerLogs : () => setNetworkLogs([])} className="text-slate-500 hover:text-red-400">
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
                    {activeTab === 'SERVER' ? (
                        connectionStatus === 'disconnected' ? (
                             <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-4">
                                <AlertTriangle className="w-10 h-10 text-red-500/50" />
                                <div className="text-center">
                                    <p className="text-red-400 font-bold mb-1">Backend Connection Lost</p>
                                    <p className="text-xs">Using fallback mock data for application features.</p>
                                </div>
                                <button onClick={handleRetryConnection} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-xs">
                                    Try Reconnecting
                                </button>
                            </div>
                        ) : serverLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
                                <Activity className="w-8 h-8 opacity-50" />
                                <p>Waiting for server activity...</p>
                            </div>
                        ) : (
                            serverLogs.map((log, idx) => (
                                <div key={idx} className="flex space-x-2 hover:bg-white/5 p-0.5 rounded">
                                    <span className="text-slate-500 shrink-0">[{log.ts}]</span>
                                    <span className={`shrink-0 w-16 font-bold ${
                                        log.level === 'INFO' ? 'text-blue-400' :
                                        log.level === 'WARNING' ? 'text-yellow-400' :
                                        log.level === 'ERROR' ? 'text-red-500' : 'text-slate-300'
                                    }`}>
                                        {log.level}
                                    </span>
                                    <span className="text-slate-500 shrink-0 w-24 truncate">[{log.module}]</span>
                                    <span className="text-slate-300 break-all">{log.msg}</span>
                                </div>
                            ))
                        )
                    ) : (
                        networkLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
                                <Wifi className="w-8 h-8 opacity-50" />
                                <p>No network activity detected yet.</p>
                            </div>
                        ) : (
                            networkLogs.map((log, idx) => (
                                <div key={idx} className="flex space-x-3 hover:bg-white/5 p-1 rounded border-b border-white/5">
                                    <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                                    <span className={`shrink-0 font-bold ${
                                        log.type === 'req' ? 'text-yellow-400' : 
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
                </div>
            </div>
        </div>
    );
};

export default DebugConsole;