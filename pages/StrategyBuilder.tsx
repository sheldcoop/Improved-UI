import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Filter, Code, BookOpen, Cpu, MessageSquare, Zap, Activity, AlertCircle } from 'lucide-react';
import { AssetClass, Timeframe, Strategy, RuleGroup, Logic, IndicatorType, Operator, PositionSizeMode, RankingMethod, StrategyPreset } from '../types';
import { saveStrategy, runBacktest, fetchSavedStrategies, deleteStrategy, previewStrategy, generateStrategy, fetchStrategies, validateMarketData } from '../services/api';
import type { DataHealthReport } from '../services/marketService';
import { useNavigate } from 'react-router-dom';
import { GroupRenderer } from '../components/strategy/GroupRenderer';
import { StrategyTopBar } from '../components/strategy/StrategyTopBar';
import { StrategyConfigPanel } from '../components/strategy/StrategyConfigPanel';
import { StrategyGuide } from '../components/strategy/StrategyGuide';

// --- INITIAL STATE ---
const INITIAL_ENTRY_GROUP: RuleGroup = {
    id: 'root_entry', type: 'GROUP', logic: Logic.AND,
    conditions: [{ id: 'init_1', indicator: IndicatorType.RSI, period: 14, operator: Operator.LESS_THAN, compareType: 'STATIC', value: 30 }]
};

const INITIAL_EXIT_GROUP: RuleGroup = {
    id: 'root_exit', type: 'GROUP', logic: Logic.AND, conditions: []
};

const makeInitialStrategy = (): Strategy => ({
    id: 'new',
    name: 'Untitled Strategy',
    description: '',
    assetClass: AssetClass.EQUITY,
    timeframe: Timeframe.D1,
    mode: 'VISUAL',
    entryLogic: INITIAL_ENTRY_GROUP,
    exitLogic: INITIAL_EXIT_GROUP,
    pythonCode: "def signal_logic(df):\n    # Write custom logic here\n    # Returns: entries (bool series), exits (bool series)\n    sma = vbt.MA.run(df['close'], 20)\n    entries = df['close'] > sma.ma\n    exits = df['close'] < sma.ma\n    return entries, exits",
    stopLossPct: 2.0,
    takeProfitPct: 5.0,
    trailingStopPct: 0.0,
    useTrailingStop: false,
    slippage: 0.05,
    commission: 20,
    rankingMethod: RankingMethod.NONE,
    rankingTopN: 5,
    startTime: '09:15',
    endTime: '15:30',
    created: new Date().toISOString()
});

interface PreviewState {
    loading: boolean;
    entry_count: number;
    exit_count: number;
    entry_dates: string[];
    exit_dates: string[];
    prices: number[];
    dates: string[];
    error: string | null;
    warnings: string[];
    empty_exit: boolean;
    logic_summary: string;
}

type ActiveTab = 'VISUAL' | 'CODE' | 'GUIDE';

const StrategyBuilder: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<ActiveTab>('VISUAL');
    const [presets, setPresets] = useState<StrategyPreset[]>([]);
    const [activePresetId, setActivePresetId] = useState<string>('');

    // Symbol & dates — persisted in localStorage
    const [symbol, setSymbol] = useState<string>(() => localStorage.getItem('sb_symbol') || 'NIFTY 50');
    const [startDate, setStartDate] = useState<string>(() => localStorage.getItem('sb_startDate') || '');
    const [endDate, setEndDate] = useState<string>(() => localStorage.getItem('sb_endDate') || '');

    // Saved strategies
    const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);
    const [showSaved, setShowSaved] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Strategy state
    const [strategy, setStrategy] = useState<Strategy>(makeInitialStrategy());
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | null>(null);
    const [checkingQuality, setCheckingQuality] = useState(false);
    const [dataQuality, setDataQuality] = useState<DataHealthReport | null>(null);
    const [pendingRun, setPendingRun] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Preview state
    const [preview, setPreview] = useState<PreviewState>({
        loading: false, entry_count: 0, exit_count: 0,
        entry_dates: [], exit_dates: [], prices: [], dates: [], error: null,
        warnings: [], empty_exit: false, logic_summary: '',
    });
    const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const previewAbortControllerRef = useRef<AbortController | null>(null);

    // --- INIT ---
    useEffect(() => {
        fetchStrategies().then(setPresets).catch(console.error);
        fetchSavedStrategies().then(setSavedStrategies).catch(console.error);
    }, []);

    // Persist symbol & dates
    useEffect(() => { localStorage.setItem('sb_symbol', symbol); }, [symbol]);
    useEffect(() => { localStorage.setItem('sb_startDate', startDate); }, [startDate]);
    useEffect(() => { localStorage.setItem('sb_endDate', endDate); }, [endDate]);

    // --- DEBOUNCED PREVIEW ---
    const triggerPreview = useCallback((strat: Strategy, sym: string, fromDate: string, toDate: string) => {
        if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = setTimeout(async () => {
            if (previewAbortControllerRef.current) previewAbortControllerRef.current.abort();
            previewAbortControllerRef.current = new AbortController();
            setPreview(p => ({ ...p, loading: true, error: null }));
            try {
                const result = await previewStrategy(strat, sym, fromDate || undefined, toDate || undefined, previewAbortControllerRef.current.signal);
                setPreview({
                    loading: false,
                    entry_count: result.entry_count,
                    exit_count: result.exit_count,
                    entry_dates: result.entry_dates,
                    exit_dates: result.exit_dates,
                    prices: result.prices,
                    dates: result.dates,
                    error: null,
                    warnings: result.warnings ?? [],
                    empty_exit: result.empty_exit ?? false,
                    logic_summary: result.logic_summary ?? '',
                });
            } catch (e: any) {
                if (e.name === 'AbortError') return;
                setPreview(p => ({ ...p, loading: false, error: e?.message || 'Preview failed' }));
            }
        }, strat.mode === 'CODE' ? 1500 : 500);
    }, []);

    useEffect(() => {
        triggerPreview(strategy, symbol, startDate, endDate);
        return () => { if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [strategy.entryLogic, strategy.exitLogic, strategy.mode, strategy.pythonCode, symbol, startDate, endDate]);

    // --- PRESET HANDLING ---
    const handlePresetChange = (presetId: string) => {
        setActivePresetId(presetId);
        if (!presetId) return;
        const preset = presets.find(p => p.id === presetId);
        if (!preset) return;
        const defaultParams: Record<string, any> = {};
        preset.params.forEach(p => { defaultParams[p.name] = p.default; });
        setStrategy(prev => ({
            ...prev,
            id: preset.id,
            name: preset.name,
            description: preset.description,
            mode: preset.mode || 'CODE',
            params: defaultParams,
            ...(preset.entryLogic ? { entryLogic: structuredClone(preset.entryLogic) } : {}),
            ...(preset.exitLogic ? { exitLogic: structuredClone(preset.exitLogic) } : {}),
            ...(preset.pythonCode ? { pythonCode: preset.pythonCode } : {}),
        }));
        setActiveTab(preset.mode || 'CODE');
    };

    // --- SAVE ---
    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            const saved = await saveStrategy(strategy);
            setStrategy(prev => ({ ...prev, id: saved.id }));
            const updated = await fetchSavedStrategies();
            setSavedStrategies(updated);
            setShowSaved(true);
        } catch (e: any) {
            setSaveError(e?.message || 'Failed to save strategy');
        } finally {
            setSaving(false);
        }
    };

    // --- LOAD SAVED ---
    const handleLoadSaved = (s: Strategy) => {
        if (!s.entryLogic || !s.exitLogic) {
            setSaveError('Cannot load strategy: missing entry or exit logic');
            return;
        }
        setStrategy(s);
        setActivePresetId('');
        setActiveTab(s.mode === 'CODE' ? 'CODE' : 'VISUAL');
    };

    // --- DELETE SAVED ---
    const handleDeleteSaved = async (id: string) => {
        if (!window.confirm('Delete this strategy? This cannot be undone.')) return;
        setSaveError(null);
        setDeletingId(id);
        try {
            await deleteStrategy(id);
            setSavedStrategies(prev => prev.filter(s => s.id !== id));
        } catch (e: any) {
            setSaveError('Delete failed: ' + (e?.message || e));
        } finally {
            setDeletingId(null);
        }
    };

    // --- CLONE ---
    const handleCloneStrategy = async (s: Strategy) => {
        setSaveError(null);
        try {
            const clone = { ...s, id: 'new', name: `${s.name} (Copy)` };
            const saved = await saveStrategy(clone);
            setSavedStrategies(prev => [...prev, saved]);
        } catch (e: any) {
            setSaveError('Clone failed: ' + (e?.message || e));
        }
    };

    // --- RUN (shared execution) ---
    const executeRun = async () => {
        setRunning(true);
        try {
            const isSaved = strategy.id !== 'new';
            const result = await runBacktest(isSaved ? strategy.id : null, symbol.trim(), {
                ...(isSaved ? {} : strategy),
                strategyName: strategy.name,
                symbol: symbol.trim(),
                timeframe: strategy.timeframe,
                mode: strategy.mode,
                stopLossPct: strategy.stopLossPct,
                takeProfitPct: strategy.takeProfitPct,
                useTrailingStop: strategy.useTrailingStop,
                slippage: strategy.slippage,
                commission: strategy.commission,
                ...(startDate ? { startDate } : {}),
                ...(endDate ? { endDate } : {}),
            });
            navigate('/results', { state: { result } });
        } catch (e: any) {
            setRunError('Backtest failed: ' + (e?.message || e));
        } finally {
            setRunning(false);
        }
    };

    // --- RUN — validates inputs, checks data quality, then runs ---
    const handleRun = async () => {
        setRunError(null);
        setDataQuality(null);
        setPendingRun(false);

        if (!symbol.trim()) {
            setRunError('Please enter a symbol before running the backtest.');
            return;
        }
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            setRunError('Start date must be before end date.');
            return;
        }
        if (activeTab === 'VISUAL' || strategy.mode === 'VISUAL') {
            if ((strategy.entryLogic?.conditions ?? []).length === 0) {
                setRunError('Your strategy has no Entry Conditions. Add at least one condition before running.');
                return;
            }
        } else if (activeTab === 'CODE' || strategy.mode === 'CODE') {
            const code = strategy.pythonCode?.trim() ?? '';
            if (!code) {
                setRunError('Python Code is empty. Write a signal_logic(df) function before running.');
                return;
            }
            if (!code.includes('signal_logic')) {
                setRunError('Your code must define a signal_logic(df) function that returns (entries, exits).');
                return;
            }
            if (!code.includes('return')) {
                setRunError('Your signal_logic function has no return statement. It must return (entries, exits).');
                return;
            }
        }

        // Data quality check before running
        setCheckingQuality(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const fromDate = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const toDate = endDate || today;
            const health = await validateMarketData(symbol.trim(), strategy.timeframe, fromDate, toDate);

            if ((health as any).status === 'CRITICAL') {
                setRunError(`No data available for ${symbol} (${strategy.timeframe}). Please fetch data in Data Manager first.`);
                return;
            }
            if (health.status === 'ANOMALIES_DETECTED') {
                setDataQuality(health);
                setPendingRun(true);
                return; // Wait for user to confirm
            }
        } catch (healthErr) {
            // Health check itself failed — warn the user rather than silently proceeding.
            // This prevents running a backtest on potentially corrupt/unavailable data.
            console.warn('Health check failed:', healthErr);
            setRunError('Data quality check could not be completed. Please verify your data in Data Manager before running, or try again.');
            setCheckingQuality(false);
            return;
        } finally {
            setCheckingQuality(false);
        }

        await executeRun();
    };

    // --- RUN ANYWAY (user confirmed despite anomalies) ---
    const handleRunAnyway = async () => {
        setDataQuality(null);
        setPendingRun(false);
        await executeRun();
    };

    // --- AI GENERATE ---
    const handleAiGenerate = async () => {
        if (!aiPrompt.trim()) return;
        setIsAiLoading(true);
        setAiError(null);
        try {
            const result = await generateStrategy(aiPrompt);
            setStrategy(prev => ({
                ...prev,
                name: result.name || 'AI Strategy',
                mode: 'VISUAL',
                entryLogic: result.entryLogic,
                exitLogic: result.exitLogic,
            }));
            setActiveTab('VISUAL');
            setAiPrompt('');
            setActivePresetId('');
        } catch (e: any) {
            setAiError(e?.message || 'Generation failed');
        } finally {
            setIsAiLoading(false);
        }
    };

    const displaySummary = preview.logic_summary || (preview.loading ? 'Calculating...' : 'Run a preview to see the logic summary.');

    return (
        <>
            {/* Top bar: symbol, dates, live signal preview */}
            <StrategyTopBar
                symbol={symbol}
                onSymbolChange={setSymbol}
                startDate={startDate}
                onStartDateChange={setStartDate}
                endDate={endDate}
                onEndDateChange={setEndDate}
                previewPrices={preview.prices}
                previewDates={preview.dates}
                previewEntryDates={preview.entry_dates}
                previewExitDates={preview.exit_dates}
                previewEntryCount={preview.entry_count}
                previewExitCount={preview.exit_count}
                previewLoading={preview.loading}
            />

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* LEFT: Config panel */}
                <div className="lg:col-span-3">
                    <StrategyConfigPanel
                        strategy={strategy}
                        onStrategyChange={setStrategy}
                        presets={presets}
                        activePresetId={activePresetId}
                        onPresetChange={handlePresetChange}
                        savedStrategies={savedStrategies}
                        showSaved={showSaved}
                        onToggleSaved={() => setShowSaved(s => !s)}
                        onLoadSaved={handleLoadSaved}
                        onDeleteSaved={handleDeleteSaved}
                        onCloneStrategy={handleCloneStrategy}
                        deletingId={deletingId}
                        saveError={saveError}
                        runError={runError}
                        saving={saving}
                        running={running}
                        checkingQuality={checkingQuality}
                        dataQuality={dataQuality}
                        onSave={handleSave}
                        onRun={handleRun}
                        onRunAnyway={handleRunAnyway}
                        onDismissQuality={() => { setDataQuality(null); setPendingRun(false); }}
                    />
                </div>

                {/* RIGHT: Builder area */}
                <div className="lg:col-span-9 flex flex-col gap-4">
                    {/* AI Prompt Bar */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <div className="p-1 flex items-center">
                            <div className="p-2 text-purple-400"><Cpu className="w-5 h-5" /></div>
                            <input
                                type="text"
                                placeholder="Ask AI: 'Create a strategy buying RSI dip below 30 in an uptrend (SMA 200)'"
                                value={aiPrompt}
                                onChange={e => { setAiPrompt(e.target.value); setAiError(null); }}
                                className="flex-1 bg-transparent border-none text-sm text-slate-200 focus:ring-0 placeholder:text-slate-600 outline-none"
                                onKeyDown={e => e.key === 'Enter' && handleAiGenerate()}
                            />
                            <button
                                onClick={handleAiGenerate}
                                disabled={isAiLoading || !aiPrompt.trim()}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded m-1 transition-colors disabled:opacity-50"
                            >
                                {isAiLoading ? 'Thinking...' : 'Generate'}
                            </button>
                        </div>
                        {aiError && (
                            <div className="flex items-center space-x-2 text-xs text-red-400 px-4 pb-2">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>{aiError}</span>
                            </div>
                        )}
                    </div>

                    {/* Mode / tab switcher */}
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 w-fit">
                        <button
                            onClick={() => { setActiveTab('VISUAL'); setStrategy(s => ({ ...s, mode: 'VISUAL' })); }}
                            className={`flex items-center px-3 py-1.5 text-xs font-medium rounded ${activeTab === 'VISUAL' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                        >
                            <Filter className="w-3 h-3 mr-2" /> Visual Builder
                        </button>
                        <button
                            onClick={() => { setActiveTab('CODE'); setStrategy(s => ({ ...s, mode: 'CODE' })); }}
                            className={`flex items-center px-3 py-1.5 text-xs font-medium rounded ${activeTab === 'CODE' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                        >
                            <Code className="w-3 h-3 mr-2" /> Python Code
                        </button>
                        <button
                            onClick={() => setActiveTab('GUIDE')}
                            className={`flex items-center px-3 py-1.5 text-xs font-medium rounded ${activeTab === 'GUIDE' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                        >
                            <BookOpen className="w-3 h-3 mr-2" /> How to Use
                        </button>
                    </div>

                    {/* Editor canvas */}
                    <div className="pr-2 space-y-6 relative">
                        {isAiLoading && (
                            <div className="absolute inset-0 z-10 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center rounded-lg border border-purple-500/30">
                                <div className="flex flex-col items-center space-y-3">
                                    <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
                                    <div className="text-sm font-bold text-purple-400">AI is generating logic...</div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'GUIDE' && <StrategyGuide />}

                        {activeTab === 'VISUAL' && (
                            <>
                                <div className="space-y-2">
                                    <div className="flex items-center text-emerald-400 font-bold text-sm">
                                        <Zap className="w-4 h-4 mr-2" /> ENTRY CONDITIONS
                                    </div>
                                    <GroupRenderer
                                        group={strategy.entryLogic}
                                        onChange={g => setStrategy(s => ({ ...s, entryLogic: g }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center text-red-400 font-bold text-sm">
                                        <Activity className="w-4 h-4 mr-2" /> EXIT CONDITIONS
                                    </div>
                                    <GroupRenderer
                                        group={strategy.exitLogic}
                                        onChange={g => setStrategy(s => ({ ...s, exitLogic: g }))}
                                    />
                                </div>
                            </>
                        )}

                        {activeTab === 'CODE' && (
                            <div className="flex flex-col">
                                <div className="bg-slate-950 border border-slate-800 rounded-t-lg p-2 flex items-center justify-between text-xs text-slate-500">
                                    <span>strategy.py</span>
                                    <span className="text-emerald-500">Python 3.10 Runtime</span>
                                </div>
                                <textarea
                                    value={strategy.pythonCode}
                                    onChange={e => setStrategy(s => ({ ...s, pythonCode: e.target.value }))}
                                    className="bg-[#0d1117] text-slate-300 font-mono text-sm p-4 outline-none resize-y border border-slate-800 border-t-0 rounded-b-lg leading-relaxed min-h-[400px]"
                                    spellCheck={false}
                                />
                            </div>
                        )}
                    </div>

                    {/* Logic summary (only for VISUAL / CODE tabs) */}
                    {activeTab !== 'GUIDE' && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-start space-x-3">
                            <MessageSquare className="w-5 h-5 text-slate-500 mt-0.5" />
                            <div>
                                <div className="text-xs font-bold text-slate-500 uppercase">Logic Summary</div>
                                <p className="text-sm text-slate-300 leading-snug">{displaySummary}</p>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </>
    );
};

export default StrategyBuilder;
