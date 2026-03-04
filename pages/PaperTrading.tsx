import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { RefreshCw, Play, FastForward, Activity, Monitor } from 'lucide-react';
import { Strategy, StrategyPreset, Timeframe } from '../types';
import {
    getPaperMonitors,
    startPaperMonitor,
    stopPaperMonitor,
    getPaperPositions,
    closePaperPosition,
    getPaperHistory,
    getPaperSettings,
    updatePaperSettings,
    runPaperReplay
} from '../services/paperService';
import { fetchSavedStrategies, fetchStrategies } from '../services/api';

import { MonitorSetup } from '../components/paper/MonitorSetup';
import { MonitorList } from '../components/paper/MonitorList';
import { PositionsTable, PaperPosition } from '../components/paper/PositionsTable';
import { TradeHistory } from '../components/paper/TradeHistory';
import { ReplayPanel } from '../components/paper/ReplayPanel';
import MarketDataSelector from '../components/MarketDataSelector';

const PaperTrading: React.FC = () => {
    const [mode, setMode] = useState<'LIVE' | 'REPLAY'>('LIVE');
    const [monitors, setMonitors] = useState<any[]>([]);
    const [positions, setPositions] = useState<PaperPosition[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [settings, setSettings] = useState<{ capitalPct: number; virtualCapital: number }>({ capitalPct: 10, virtualCapital: 100000 });
    const [capitalInput, setCapitalInput] = useState('10');

    const [presets, setPresets] = useState<StrategyPreset[]>([]);
    const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);

    const [loading, setLoading] = useState(false);
    const [stoppingId, setStoppingId] = useState<string | null>(null);
    const [closingId, setClosingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Global Market Data Selection (for Live Mkt & Replay)
    const [segment, setSegment] = useState('NSE_EQ');
    const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
    const [selectedInstrument, setSelectedInstrument] = useState<any>(null);
    const [globalSymbol, setGlobalSymbol] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [globalTimeframe, setGlobalTimeframe] = useState<Timeframe>(Timeframe.M15);

    // Live Mkt Strategy Picker
    const [liveActivePresetId, setLiveActivePresetId] = useState<string>('');
    const [liveSelectedStrategyId, setLiveSelectedStrategyId] = useState<string | null>(null);
    const [liveShowSaved, setLiveShowSaved] = useState(false);

    // Live Mkt Sl/TP
    const [liveSlPct, setLiveSlPct] = useState<number | ''>('');
    const [liveTpPct, setLiveTpPct] = useState<number | ''>('');

    // Replay State
    // Strategy Picker logic for Replay
    const [replayActivePresetId, setReplayActivePresetId] = useState<string>('');
    const [replaySelectedStrategyId, setReplaySelectedStrategyId] = useState<string | null>(null);
    const [replayShowSaved, setReplayShowSaved] = useState(false);

    // Sl / Tp
    const [replaySlPct, setReplaySlPct] = useState<number | ''>('');
    const [replayTpPct, setReplayTpPct] = useState<number | ''>('');

    const [replayStart, setReplayStart] = useState('');
    const [replayEnd, setReplayEnd] = useState('');
    const [replaySpeed, setReplaySpeed] = useState(1);
    const [isReplaying, setIsReplaying] = useState(false);
    const [replayEvents, setReplayEvents] = useState<any[]>([]);

    const replayIndexRef = useRef<number>(0);
    const replayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (symbolSearchQuery.length >= 2) {
            const delayDebounceFn = setTimeout(() => {
                const searchMarketData = async () => {
                    setIsSearching(true);
                    try {
                        const token = localStorage.getItem('token');
                        const res = await fetch(`http://localhost:5001/api/v1/market/instruments?q=${symbolSearchQuery}&segment=${segment}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (!res.ok) throw new Error('Search failed');
                        const data = await res.json();
                        setSearchResults(data);
                    } catch (err) {
                        console.error('Symbol search failed:', err);
                    } finally {
                        setIsSearching(false);
                    }
                };
                searchMarketData();
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        } else {
            setSearchResults([]);
        }
    }, [symbolSearchQuery, segment]);

    useEffect(() => {
        loadData();
        fetchStrategies().then(setPresets).catch(console.error);
        fetchSavedStrategies().then(setSavedStrategies).catch(console.error);

        return () => stopPolling();
    }, []);

    useEffect(() => {
        if (mode === 'LIVE') {
            loadData();
            startPolling();
        } else {
            stopPolling();
            handleReplayReset();
        }
    }, [mode]);

    useEffect(() => {
        setCapitalInput(settings.capitalPct.toString());
    }, [settings.capitalPct]);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [mRes, pRes, hRes, sRes] = await Promise.all([
                getPaperMonitors(),
                getPaperPositions(),
                getPaperHistory(),
                getPaperSettings()
            ]);
            setMonitors(mRes);
            setPositions(pRes);
            setHistory(hRes);
            setSettings({
                capitalPct: sRes.capitalPct || 10,
                virtualCapital: sRes.virtualCapital || 100000
            });
        } catch (e: any) {
            setError(e.message || 'Failed to load paper trading data');
        } finally {
            setLoading(false);
        }
    };

    const startPolling = () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(async () => {
            try {
                const [mRes, pRes] = await Promise.all([getPaperMonitors(), getPaperPositions()]);
                setMonitors(mRes);
                setPositions(pRes);
            } catch (e) {
                console.error("Polling error:", e);
            }
        }, 15000); // 15s poll
    };

    const stopPolling = () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
    };

    const handleStartLiveMonitor = async () => {
        setError(null);
        if (!globalSymbol) {
            setError('Please search and select a symbol from Market Data.');
            return;
        }
        if (!liveSelectedStrategyId) {
            setError('Please select a strategy or preset.');
            return;
        }

        const monitorData = {
            symbol: globalSymbol,
            strategyId: liveSelectedStrategyId,
            config: {},
            timeframe: globalTimeframe,
            slPct: liveSlPct === '' ? null : Number(liveSlPct),
            tpPct: liveTpPct === '' ? null : Number(liveTpPct),
        };

        try {
            await startPaperMonitor(monitorData);
            await loadData();
            // Reset
            setGlobalSymbol('');
            setSymbolSearchQuery('');
            setSelectedInstrument(null);
        } catch (e: any) {
            setError(e.message || 'Failed to start monitor');
        }
    };

    const handleStopMonitor = async (id: string) => {
        try {
            setStoppingId(id);
            await stopPaperMonitor(id);
            await loadData();
        } catch (e: any) {
            alert(e.message || 'Failed to stop monitor');
        } finally {
            setStoppingId(null);
        }
    };

    const handleClosePosition = async (id: string) => {
        try {
            setClosingId(id);
            await closePaperPosition(id);
            await loadData(); // Reload positions and history
        } catch (e: any) {
            alert(e.message || 'Failed to close position');
        } finally {
            setClosingId(null);
        }
    };

    const handleSaveSettings = async () => {
        try {
            const pct = parseFloat(capitalInput);
            if (isNaN(pct) || pct <= 0 || pct > 100) throw new Error('Invalid percentage');
            await updatePaperSettings({ capitalPct: pct });
            setSettings(s => ({ ...s, capitalPct: pct }));
            alert('Settings saved');
        } catch (e: any) {
            alert(e.message || 'Failed to save settings');
        }
    };

    const handleReplayToggle = async () => {
        if (isReplaying) {
            setIsReplaying(false);
            if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
            return;
        }

        if (!replayEvents.length) {
            if (!globalSymbol || !replayActivePresetId && !replaySelectedStrategyId) {
                setError("Please select a Symbol from Market Data and Strategy before Replaying.");
                return;
            }
            if (!replayStart || !replayEnd) {
                setError("Please select From Date and To Date.");
                return;
            }
            setLoading(true);
            try {
                // Find actual Strategy ID (Preset or Saved)
                const finalStrategyId = replayShowSaved ? replaySelectedStrategyId : replayActivePresetId;

                const res = await runPaperReplay({
                    symbol: globalSymbol,
                    strategyId: finalStrategyId,
                    timeframe: globalTimeframe,
                    fromDate: replayStart,
                    toDate: replayEnd,
                    slPct: replaySlPct || undefined,
                    tpPct: replayTpPct || undefined
                });
                setReplayEvents(res.events || []);
                replayIndexRef.current = 0;
                setPositions([]);
                setHistory([]);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch replay data');
                setLoading(false);
                return;
            }
            setLoading(false);
        }
        setIsReplaying(true);
    };

    useEffect(() => {
        if (!isReplaying || !replayEvents.length) return;

        const tickInterval = Math.max(10, 1000 / replaySpeed);
        replayIntervalRef.current = setInterval(() => {
            const idx = replayIndexRef.current;
            if (idx >= replayEvents.length) {
                setIsReplaying(false);
                clearInterval(replayIntervalRef.current!);
                alert("Replay Finished!");
                return;
            }

            const ev = replayEvents[idx];
            if (ev.type === 'TICK') {
                setPositions(prev => prev.map(p => ({
                    ...p,
                    ltp: ev.ltp,
                    pnl: (ev.ltp - p.avg_price) * p.qty,
                    pnl_pct: (ev.ltp / p.avg_price - 1) * 100
                })));
            } else if (ev.type === 'POSITION_OPENED') {
                setPositions([ev.position]);
            } else if (ev.type === 'TRADE_CLOSED') {
                setPositions([]);
                setHistory(prev => [ev.trade, ...prev]);
            }

            replayIndexRef.current++;
        }, tickInterval);

        return () => clearInterval(replayIntervalRef.current!);
    }, [isReplaying, replayEvents, replaySpeed]);

    const handleReplayReset = () => {
        setIsReplaying(false);
        if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
        setReplayEvents([]);
        replayIndexRef.current = 0;
        setPositions([]);
        setHistory([]);
        setReplayStart('');
        setReplayEnd('');
    };

    return (
        <div className="space-y-6">
            {/* HEADER & TOGGLE */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        Paper Trading
                        <div className="flex bg-slate-900 overflow-hidden font-normal text-xs rounded border border-slate-800">
                            <button
                                onClick={() => setMode('LIVE')}
                                className={`py-1.5 px-3 flex items-center transition-colors ${mode === 'LIVE' ? 'bg-emerald-600 font-bold text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                <Activity className="w-3.5 h-3.5 mr-1" /> Live Mkt
                            </button>
                            <button
                                onClick={() => setMode('REPLAY')}
                                className={`py-1.5 px-3 flex items-center transition-colors ${mode === 'REPLAY' ? 'bg-purple-600 font-bold text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                <FastForward className="w-3.5 h-3.5 mr-1" /> Replay
                            </button>
                        </div>
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">
                        {mode === 'LIVE' ? 'Execute strategies against live real-time market data in paper mode.' : 'Simulate live trading by replaying historical time-series data.'}
                    </p>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="text-right">
                        <div className="text-xs text-slate-500 uppercase flex items-center">
                            Capital per Trade
                            <input
                                type="number"
                                min="1" max="100"
                                value={capitalInput}
                                onChange={e => setCapitalInput(e.target.value)}
                                onBlur={handleSaveSettings}
                                className="w-12 ml-2 bg-slate-950 border border-slate-700 rounded text-xs px-1 py-0.5 text-center text-slate-200 hide-arrows"
                            />
                            <span className="ml-1">%</span>
                        </div>
                        <div className="text-emerald-400 font-mono font-bold mt-1 text-sm text-right">
                            Cap: ₹{settings.virtualCapital.toLocaleString()}
                        </div>
                    </div>
                    <Button icon={loading ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />} onClick={loadData}>
                        Refresh
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/20 text-red-500 border border-red-800 p-3 rounded text-sm font-bold flex items-center">
                    Failed: {error}
                </div>
            )}

            {/* CORE LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* LEFT COLUMN: Setup */}
                <div className="lg:col-span-4 space-y-6">
                    <MarketDataSelector
                        segment={segment}
                        setSegment={setSegment}
                        symbolSearchQuery={symbolSearchQuery}
                        setSymbolSearchQuery={setSymbolSearchQuery}
                        selectedInstrument={selectedInstrument}
                        setSelectedInstrument={setSelectedInstrument}
                        symbol={globalSymbol}
                        setSymbol={setGlobalSymbol}
                        searchResults={searchResults}
                        setSearchResults={setSearchResults}
                        isSearching={isSearching}
                        timeframe={globalTimeframe}
                        setTimeframe={(tf) => setGlobalTimeframe(tf as Timeframe)}
                    />

                    {mode === 'LIVE' ? (
                        <MonitorSetup
                            presets={presets}
                            savedStrategies={savedStrategies}
                            activeMonitorsCount={monitors.length}
                            onStartMonitor={handleStartLiveMonitor}
                            globalSymbol={globalSymbol}
                        />
                    ) : (
                        <ReplayPanel
                            presets={presets}
                            savedStrategies={savedStrategies}
                            activePresetId={replayActivePresetId}
                            onPresetChange={(id) => { setReplayActivePresetId(id); setReplaySelectedStrategyId(null); }}
                            selectedStrategyId={replaySelectedStrategyId}
                            onLoadSaved={(s) => { setReplaySelectedStrategyId(s.id); setReplayActivePresetId(''); }}
                            showSaved={replayShowSaved}
                            onToggleSaved={() => setReplayShowSaved(!replayShowSaved)}
                            slPct={replaySlPct}
                            onSlPctChange={setReplaySlPct}
                            tpPct={replayTpPct}
                            onTpPctChange={setReplayTpPct}
                            startDate={replayStart}
                            onStartDateChange={setReplayStart}
                            endDate={replayEnd}
                            onEndDateChange={setReplayEnd}
                            speed={replaySpeed}
                            onSpeedChange={setReplaySpeed}
                            isPlaying={isReplaying}
                            onTogglePlay={handleReplayToggle}
                            onReset={handleReplayReset}
                        />
                    )}

                    {mode === 'LIVE' && (
                        <MonitorList
                            monitors={monitors}
                            presets={presets}
                            savedStrategies={savedStrategies}
                            onStopMonitor={handleStopMonitor}
                            loadingId={stoppingId}
                        />
                    )}
                </div>

                {/* RIGHT COLUMN: Positions & History */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    <PositionsTable
                        positions={positions}
                        onClosePosition={handleClosePosition}
                        closingId={closingId}
                    />

                    <TradeHistory history={history} />
                </div>

            </div>
        </div>
    );
};

export default PaperTrading;
