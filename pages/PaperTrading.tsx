import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { RefreshCw, Play, FastForward, Activity, Monitor, AlertCircle, CheckCircle } from 'lucide-react';
import { Strategy, StrategyPreset, Timeframe } from '../types';
import {
    getPaperMonitors,
    startPaperMonitor,
    stopPaperMonitor,
    getPaperPositions,
    closePaperPosition,
    getPaperHistory,
    runPaperReplay
} from '../services/paperService';
import { fetchSavedStrategies, fetchStrategies } from '../services/api';
import { searchInstruments } from '../services/marketService';

import { MonitorSetup } from '../components/paper/MonitorSetup';
import { MonitorList } from '../components/paper/MonitorList';
import { PositionsTable, PaperPosition } from '../components/paper/PositionsTable';
import { TradeHistory } from '../components/paper/TradeHistory';
import { ReplayPanel } from '../components/paper/ReplayPanel';
import { ReplayChart, ReplayChartPoint } from '../components/paper/ReplayChart';
import MarketDataSelector from '../components/MarketDataSelector';

const PaperTrading: React.FC = () => {
    const [mode, setMode] = useState<'LIVE' | 'REPLAY'>('LIVE');
    const [monitors, setMonitors] = useState<any[]>([]);
    const [positions, setPositions] = useState<PaperPosition[]>([]);
    const [history, setHistory] = useState<any[]>([]);

    const [presets, setPresets] = useState<StrategyPreset[]>([]);
    const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);

    const [loading, setLoading] = useState(false);
    const [stoppingId, setStoppingId] = useState<string | null>(null);
    const [closingId, setClosingId] = useState<string | null>(null);

    // Inline error/success states (no alert() popups)
    const [error, setError] = useState<string | null>(null);
    const [stopError, setStopError] = useState<string | null>(null);
    const [closeError, setCloseError] = useState<string | null>(null);
    const [replayFinished, setReplayFinished] = useState(false);
    const [replaySummary, setReplaySummary] = useState<{
        totalTrades: number;
        winTrades: number;
        winRate: number;
        netPnl: number;
        netPnlPct: number;
        maxDrawdown: number;
        finalEquity: number;
        startingEquity: number;
    } | null>(null);

    // Global Market Data Selection (for Live Mkt & Replay)
    const [segment, setSegment] = useState('NSE_EQ');
    const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
    const [selectedInstrument, setSelectedInstrument] = useState<any>(null);
    const [globalSymbol, setGlobalSymbol] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [globalTimeframe, setGlobalTimeframe] = useState<Timeframe>(Timeframe.M15);

    // Replay State
    const [replayActivePresetId, setReplayActivePresetId] = useState<string>('');
    const [replaySelectedStrategyId, setReplaySelectedStrategyId] = useState<string | null>(null);
    const [replayShowSaved, setReplayShowSaved] = useState(false);
    const [replaySlPct, setReplaySlPct] = useState<number | ''>('');
    const [replayTslPct, setReplayTslPct] = useState<number | ''>('');
    const [replayTpPct, setReplayTpPct] = useState<number | ''>('');
    const [replayStart, setReplayStart] = useState('');
    const [replayEnd, setReplayEnd] = useState('');
    const [replaySpeed, setReplaySpeed] = useState(1);
    const [isReplaying, setIsReplaying] = useState(false);
    const [replayEvents, setReplayEvents] = useState<any[]>([]);

    // Replay chart state
    const [replayChartData, setReplayChartData] = useState<ReplayChartPoint[]>([]);
    const [replayTotalBars, setReplayTotalBars] = useState(0);
    const [replayCurrentBar, setReplayCurrentBar] = useState(0);

    const replayIndexRef = useRef<number>(0);
    const replayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (symbolSearchQuery.length >= 2) {
            const delayDebounceFn = setTimeout(() => {
                const doSearch = async () => {
                    setIsSearching(true);
                    try {
                        const results = await searchInstruments(symbolSearchQuery, segment);
                        setSearchResults(results);
                    } catch (err) {
                        console.error('Symbol search failed:', err);
                    } finally {
                        setIsSearching(false);
                    }
                };
                doSearch();
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

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [mRes, pRes, hRes] = await Promise.all([
                getPaperMonitors(),
                getPaperPositions(),
                getPaperHistory(),
            ]);
            setMonitors(mRes);
            setPositions(pRes);
            setHistory(hRes);
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
        }, 15000);
    };

    const stopPolling = () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
    };

    // strategyId, slPct, tpPct are now passed directly from MonitorSetup
    const handleStartLiveMonitor = async (strategyId: string, slPct: number | null, tpPct: number | null, tslPct: number | null) => {
        setError(null);
        if (!globalSymbol) {
            throw new Error('Please search and select a symbol from Market Data.');
        }

        const monitorData = {
            symbol: globalSymbol,
            strategyId,
            config: {},
            timeframe: globalTimeframe,
            slPct,
            tpPct,
            tslPct,
        };

        await startPaperMonitor(monitorData);
        // Reset symbol after successful creation
        setGlobalSymbol('');
        setSymbolSearchQuery('');
        setSelectedInstrument(null);
        // Refresh data silently — don't let loadData failure mask successful creation
        loadData().catch(console.error);
    };

    const handleStopMonitor = async (id: string) => {
        setStopError(null);
        try {
            setStoppingId(id);
            await stopPaperMonitor(id);
            await loadData();
        } catch (e: any) {
            setStopError(e.message || 'Failed to stop monitor');
        } finally {
            setStoppingId(null);
        }
    };

    const handleClosePosition = async (id: string) => {
        setCloseError(null);
        try {
            setClosingId(id);
            await closePaperPosition(id);
            await loadData();
        } catch (e: any) {
            setCloseError(e.message || 'Failed to close position');
        } finally {
            setClosingId(null);
        }
    };

    const handleReplayToggle = async () => {
        if (isReplaying) {
            setIsReplaying(false);
            if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
            return;
        }

        if (!replayEvents.length) {
            // Use whichever strategy ID is set (saved takes priority, falls back to preset)
            const finalStrategyId = replaySelectedStrategyId || replayActivePresetId;

            if (!globalSymbol || !finalStrategyId) {
                setError("Please select a Symbol from Market Data and a Strategy before Replaying.");
                return;
            }
            if (!replayStart || !replayEnd) {
                setError("Please select From Date and To Date.");
                return;
            }
            setLoading(true);
            setReplayFinished(false);
            try {
                const res = await runPaperReplay({
                    symbol: globalSymbol,
                    strategyId: finalStrategyId,
                    timeframe: globalTimeframe,
                    fromDate: replayStart,
                    toDate: replayEnd,
                    slPct: replaySlPct || undefined,
                    tpPct: replayTpPct || undefined,
                    tslPct: replayTslPct || undefined
                });
                setReplayEvents(res.events || []);
                setReplaySummary(res.summary || null);
                replayIndexRef.current = 0;
                setPositions([]);
                setHistory([]);
                setReplayChartData([]);
                setReplayTotalBars((res.events || []).length);
                setReplayCurrentBar(0);
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
                setReplayFinished(true);
                return;
            }

            const ev = replayEvents[idx];
            if (ev.type === 'TICK') {
                setPositions(prev => prev.map(p => {
                    const isShort = p.side === 'SHORT';
                    const pnl = isShort
                        ? (p.avg_price - ev.ltp) * p.qty
                        : (ev.ltp - p.avg_price) * p.qty;
                    const pnl_pct = isShort
                        ? (p.avg_price / ev.ltp - 1) * 100
                        : (ev.ltp / p.avg_price - 1) * 100;
                    return { ...p, ltp: ev.ltp, pnl, pnl_pct };
                }));
            } else if (ev.type === 'POSITION_OPENED') {
                setPositions([ev.position]);
            } else if (ev.type === 'TRADE_CLOSED') {
                setPositions([]);
                setHistory(prev => [ev.trade, ...prev]);
            }

            // Accumulate chart point for every event
            const chartPoint: ReplayChartPoint = { time: ev.timestamp, price: ev.ltp };
            if (ev.type === 'POSITION_OPENED') chartPoint.event = 'entry';
            if (ev.type === 'TRADE_CLOSED') chartPoint.event = 'exit';
            setReplayChartData(prev => [...prev, chartPoint]);
            setReplayCurrentBar(idx + 1);

            replayIndexRef.current++;
        }, tickInterval);

        return () => clearInterval(replayIntervalRef.current!);
    }, [isReplaying, replayEvents, replaySpeed]);

    const handleReplayReset = () => {
        setIsReplaying(false);
        if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
        setReplayEvents([]);
        setReplayFinished(false);
        setReplaySummary(null);
        replayIndexRef.current = 0;
        setPositions([]);
        setHistory([]);
        setReplayStart('');
        setReplayEnd('');
        setReplayChartData([]);
        setReplayTotalBars(0);
        setReplayCurrentBar(0);
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
                    <Button icon={loading ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />} onClick={loadData}>
                        Refresh
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/20 text-red-500 border border-red-800 p-3 rounded text-sm font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {stopError && (
                <div className="bg-red-900/20 text-red-500 border border-red-800 p-3 rounded text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {stopError}
                </div>
            )}

            {closeError && (
                <div className="bg-red-900/20 text-red-500 border border-red-800 p-3 rounded text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {closeError}
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
                            tslPct={replayTslPct}
                            onTslPctChange={setReplayTslPct}
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
                            progress={replayTotalBars > 0 ? { current: replayCurrentBar, total: replayTotalBars } : undefined}
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
                    {mode === 'REPLAY' && (
                        <ReplayChart
                            data={replayChartData}
                            currentBar={replayCurrentBar}
                            totalBars={replayTotalBars}
                            symbol={globalSymbol}
                        />
                    )}

                    {replayFinished && replaySummary && (
                        <div className="bg-purple-900/20 border border-purple-800 rounded p-4 space-y-3">
                            <div className="flex items-center gap-2 text-purple-300 text-sm font-semibold">
                                <CheckCircle className="w-4 h-4 text-purple-400" />
                                Replay complete — {replaySummary.totalTrades} trade{replaySummary.totalTrades !== 1 ? 's' : ''} simulated
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-slate-900 rounded p-2 text-center">
                                    <div className="text-[10px] text-slate-500 uppercase mb-0.5">Win Rate</div>
                                    <div className={`text-sm font-bold font-mono ${replaySummary.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {replaySummary.winRate.toFixed(1)}%
                                    </div>
                                    <div className="text-[10px] text-slate-600">{replaySummary.winTrades}W / {replaySummary.totalTrades - replaySummary.winTrades}L</div>
                                </div>
                                <div className="bg-slate-900 rounded p-2 text-center">
                                    <div className="text-[10px] text-slate-500 uppercase mb-0.5">Net P&amp;L</div>
                                    <div className={`text-sm font-bold font-mono ${replaySummary.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {replaySummary.netPnl >= 0 ? '+' : ''}₹{replaySummary.netPnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </div>
                                    <div className={`text-[10px] ${replaySummary.netPnlPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {replaySummary.netPnlPct >= 0 ? '+' : ''}{replaySummary.netPnlPct.toFixed(2)}%
                                    </div>
                                </div>
                                <div className="bg-slate-900 rounded p-2 text-center">
                                    <div className="text-[10px] text-slate-500 uppercase mb-0.5">Max Drawdown</div>
                                    <div className="text-sm font-bold font-mono text-amber-400">
                                        {replaySummary.maxDrawdown.toFixed(2)}%
                                    </div>
                                </div>
                                <div className="bg-slate-900 rounded p-2 text-center">
                                    <div className="text-[10px] text-slate-500 uppercase mb-0.5">Final Equity</div>
                                    <div className={`text-sm font-bold font-mono ${replaySummary.finalEquity >= replaySummary.startingEquity ? 'text-emerald-400' : 'text-red-400'}`}>
                                        ₹{replaySummary.finalEquity.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
