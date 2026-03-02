
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { PlayCircle, Filter, Code, Cpu, MessageSquare, Zap, Activity, Save, Trash2, ChevronDown, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';
import { AssetClass, Timeframe, Strategy, RuleGroup, Condition, Logic, IndicatorType, Operator, PositionSizeMode, RankingMethod, StrategyPreset } from '../types';
import { saveStrategy, runBacktest, fetchSavedStrategies, deleteStrategy, previewStrategy, generateStrategy, fetchStrategies } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { GroupRenderer } from '../components/strategy/GroupRenderer';


// --- COMMON SYMBOLS (suggestions only — user can type any NSE symbol) ---
const COMMON_SYMBOLS = [
    'NIFTY 50', 'BANKNIFTY', 'SENSEX',
    'RELIANCE', 'HDFCBANK', 'INFY', 'TCS', 'ICICIBANK',
    'SBIN', 'MARUTI', 'DLF', 'DIXON', 'BAJAJELEC',
    'PNB', 'AMBUJACEM', 'HDFCNIF100',
];

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
    useTrailingStop: false,
    pyramiding: 1,
    positionSizing: PositionSizeMode.FIXED_CAPITAL,
    positionSizeValue: 100000,
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

const StrategyBuilder: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'VISUAL' | 'CODE'>('VISUAL');
    const [presets, setPresets] = useState<StrategyPreset[]>([]);
    const [activePresetId, setActivePresetId] = useState<string>('');

    // Single-symbol input — persisted in localStorage
    const [symbol, setSymbol] = useState<string>(
        () => localStorage.getItem('sb_symbol') || 'NIFTY 50'
    );

    const [startDate, setStartDate] = useState<string>(() => localStorage.getItem('sb_startDate') || '');
    const [endDate, setEndDate] = useState<string>(() => localStorage.getItem('sb_endDate') || '');

    // Saved strategies panel
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

    // Persist symbol and dates to localStorage on change
    useEffect(() => { localStorage.setItem('sb_symbol', symbol); }, [symbol]);
    useEffect(() => { localStorage.setItem('sb_startDate', startDate); }, [startDate]);
    useEffect(() => { localStorage.setItem('sb_endDate', endDate); }, [endDate]);

    // Date display helpers: ISO (YYYY-MM-DD) ↔ dd/mm/yyyy display
    const toDisplay = (iso: string): string => {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    };

    // --- DEBOUNCED PREVIEW ---
    const triggerPreview = useCallback((strat: Strategy, sym: string) => {
        if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = setTimeout(async () => {
            if (previewAbortControllerRef.current) {
                previewAbortControllerRef.current.abort();
            }
            previewAbortControllerRef.current = new AbortController();

            setPreview(p => ({ ...p, loading: true, error: null }));
            try {
                const result = await previewStrategy(strat, sym, previewAbortControllerRef.current.signal);
                setPreview({
                    loading: false,
                    entry_count: result.entry_count,
                    exit_count: result.exit_count,
                    entry_dates: result.entry_dates,
                    exit_dates: result.exit_dates,
                    prices: result.prices,
                    dates: result.dates,
                    error: null,
                    warnings: (result as any).warnings ?? [],
                    empty_exit: (result as any).empty_exit ?? false,
                    logic_summary: (result as any).logic_summary ?? '',
                });
            } catch (e: any) {
                if (e.name === 'AbortError') return; // Ignore cancellations
                setPreview(p => ({ ...p, loading: false, error: e?.message || 'Preview failed' }));
            }
        }, 500);
    }, []);

    useEffect(() => {
        triggerPreview(strategy, symbol);
        return () => { if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current); };
        // triggerPreview is stable (useCallback with no deps) — intentionally omitted
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [strategy.entryLogic, strategy.exitLogic, strategy.mode, strategy.pythonCode, symbol]);

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
            ...(preset.entryLogic ? { entryLogic: Object.assign({}, preset.entryLogic) } : {}),
            ...(preset.exitLogic ? { exitLogic: Object.assign({}, preset.exitLogic) } : {}),
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
        // Guard against malformed saved strategies missing logic trees
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

    // --- RUN ---
    const handleRun = async () => {
        setRunError(null);

        if (!symbol.trim()) {
            setRunError('Please enter a symbol before running the backtest.');
            return;
        }
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            setRunError('Start date must be before end date.');
            return;
        }

        // Validate strategy has actual logic before sending
        if (activeTab === 'VISUAL' || strategy.mode === 'VISUAL') {
            const entryConditions = strategy.entryLogic?.conditions ?? [];
            if (entryConditions.length === 0) {
                setRunError('Your strategy has no Entry Conditions. Add at least one condition in the Visual Builder before running.');
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
        }

        setRunning(true);
        try {
            const result = await runBacktest(strategy.id !== 'new' ? strategy.id : null, symbol.trim(), {
                ...strategy,
                capital: strategy.positionSizeValue,
                strategyName: strategy.name,
                symbol: symbol.trim(),
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

    // --- CLONE SAVED STRATEGY ---
    const handleCloneStrategy = async (s: Strategy) => {
        try {
            const clone = { ...s, id: 'new', name: `${s.name} (Copy)` };
            const saved = await saveStrategy(clone);
            setSavedStrategies(prev => [...prev, saved]);
        } catch (e: any) {
            setSaveError('Clone failed: ' + (e?.message || e));
        }
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

    // Logic summary is provided by the backend in preview.logic_summary
    // (generated from the same tree that was actually evaluated — always accurate).
    const displaySummary = preview.logic_summary || (preview.loading ? 'Calculating...' : 'Run a preview to see the logic summary.');

    // --- PREVIEW CHART ---
    const renderPreviewChart = () => {
        const { prices, dates, entry_dates, exit_dates } = preview;
        if (!prices.length) return null;

        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const range = Math.max(maxP - minP, minP * 0.05) || 1; // Minimum 5% padding
        const plotMin = minP - range * 0.1;
        const plotRange = range * 1.2;
        const W = 300, H = 120;

        const toX = (i: number) => (i / (prices.length - 1)) * W;
        const toY = (p: number) => H - ((p - plotMin) / plotRange) * H;

        const pathD = prices.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ');

        const entrySet = new Set(entry_dates);
        const exitSet = new Set(exit_dates);

        return (
            <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <path d={pathD} fill="none" stroke="#10b981" strokeWidth="1.5" />
                {dates.map((d, i) => {
                    if (entrySet.has(d)) {
                        const x = toX(i), y = toY(prices[i]);
                        return <polygon key={`e${i}`} points={`${x},${y - 8} ${x - 5},${y} ${x + 5},${y}`} fill="#10b981" opacity="0.9" />;
                    }
                    if (exitSet.has(d)) {
                        const x = toX(i), y = toY(prices[i]);
                        return <polygon key={`x${i}`} points={`${x},${y + 8} ${x - 5},${y} ${x + 5},${y}`} fill="#ef4444" opacity="0.9" />;
                    }
                    return null;
                })}
            </svg>
        );
    };

    return (
        <>
            {/* ── TOP BAR: Symbol & Dates ────────────────────────────────────── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-end gap-4">
                {/* Single-symbol input */}
                <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Symbol</label>
                    <input
                        list="symbol-suggestions"
                        value={symbol}
                        onChange={e => setSymbol(e.target.value.toUpperCase())}
                        placeholder="e.g. NIFTY 50"
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-emerald-500 placeholder-slate-600"
                    />
                    <datalist id="symbol-suggestions">
                        {COMMON_SYMBOLS.map(s => <option key={s} value={s} />)}
                    </datalist>
                </div>
                {/* From date */}
                <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">From</label>
                    <div className="relative">
                        <input
                            type="text"
                            readOnly
                            value={toDisplay(startDate)}
                            placeholder="dd/mm/yyyy"
                            className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 outline-none w-36 placeholder-slate-600 cursor-pointer"
                        />
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            style={{ colorScheme: 'light' }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full"
                        />
                    </div>
                </div>
                {/* To date */}
                <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">To</label>
                    <div className="relative">
                        <input
                            type="text"
                            readOnly
                            value={toDisplay(endDate)}
                            placeholder="dd/mm/yyyy"
                            className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 outline-none w-36 placeholder-slate-600 cursor-pointer"
                        />
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            style={{ colorScheme: 'light' }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full"
                        />
                    </div>
                </div>

                {/* Divider */}
                <div className="hidden lg:block h-8 w-px bg-slate-700 self-end mb-1" />

                {/* Compact Live Signal Preview */}
                <div className="flex items-end gap-2 flex-1 min-w-[200px]">
                    <div className="flex-1 h-9 bg-slate-950 rounded border border-slate-800 overflow-hidden relative">
                        {preview.prices.length > 0 ? (
                            <svg width="100%" height="100%" viewBox="0 0 300 36" preserveAspectRatio="none">
                                {(() => {
                                    const ps = preview.prices;
                                    const mn = Math.min(...ps), mx = Math.max(...ps);
                                    const rng = Math.max(mx - mn, 1);
                                    const toX = (i: number) => (i / (ps.length - 1)) * 300;
                                    const toY = (p: number) => 36 - ((p - mn) / rng) * 32 - 2;
                                    const d = ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ');
                                    return (
                                        <>
                                            <path d={d} fill="none" stroke="#10b981" strokeWidth="1.5" />
                                            {preview.dates.map((dt, i) => {
                                                if (preview.entry_dates.includes(dt)) {
                                                    const x = toX(i), y = toY(ps[i]);
                                                    return <polygon key={`e${i}`} points={`${x},${y - 5} ${x - 3},${y} ${x + 3},${y}`} fill="#10b981" />;
                                                }
                                                if (preview.exit_dates.includes(dt)) {
                                                    const x = toX(i), y = toY(ps[i]);
                                                    return <polygon key={`x${i}`} points={`${x},${y + 5} ${x - 3},${y} ${x + 3},${y}`} fill="#ef4444" />;
                                                }
                                                return null;
                                            })}
                                        </>
                                    );
                                })()}
                            </svg>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[10px] text-slate-700">{preview.loading ? 'Computing...' : 'Signal Preview'}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3 shrink-0">
                        <div className="text-center">
                            <div className="text-sm font-bold text-emerald-400">{preview.entry_count}</div>
                            <div className="text-[9px] text-slate-600">Buys</div>
                        </div>
                        <div className="text-center">
                            <div className="text-sm font-bold text-red-400">{preview.exit_count}</div>
                            <div className="text-[9px] text-slate-600">Sells</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── MAIN GRID ───────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* LEFT: Config Panel (3 Cols) */}
                <div className="lg:col-span-3 flex flex-col gap-4">
                    {/* Card 1: Strategy Settings */}
                    <Card className="p-4 space-y-3">
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Strategy Name</label>
                            <input
                                type="text"
                                value={strategy.name}
                                onChange={e => setStrategy({ ...strategy, name: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 outline-none"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Asset Class</label>
                                <select value={strategy.assetClass} onChange={e => setStrategy({ ...strategy, assetClass: e.target.value as any })} className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200">
                                    {Object.values(AssetClass).map(a => <option key={a}>{a}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Timeframe</label>
                                <select value={strategy.timeframe} onChange={e => setStrategy({ ...strategy, timeframe: e.target.value as any })} className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200">
                                    {Object.values(Timeframe).map(t => <option key={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Strategy Preset</label>
                            <select
                                value={activePresetId}
                                onChange={e => handlePresetChange(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200"
                            >
                                <option value="">Custom Strategy (Builder)</option>
                                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <button
                                onClick={() => setShowSaved(s => !s)}
                                className="flex items-center justify-between w-full text-xs font-bold text-slate-400 uppercase hover:text-slate-200"
                            >
                                <span>My Strategies {savedStrategies.length > 0 && `(${savedStrategies.length})`}</span>
                                {showSaved ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                            {showSaved && (
                                <div className="space-y-1 mt-2 max-h-40 overflow-y-auto">
                                    {savedStrategies.length === 0 ? (
                                        <div className="text-xs text-slate-600 py-2 text-center">No saved strategies yet</div>
                                    ) : (
                                        savedStrategies.map(s => (
                                            <div key={s.id} className="flex items-center justify-between p-2 bg-slate-950 rounded border border-slate-800 group">
                                                <button onClick={() => handleLoadSaved(s)} className="text-xs text-slate-300 hover:text-emerald-400 truncate flex-1 text-left" title={s.name}>{s.name}</button>
                                                <div className="flex items-center ml-2 space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleCloneStrategy(s)} title="Clone strategy" className="text-slate-700 hover:text-purple-400">
                                                        <RefreshCw className="w-3 h-3" />
                                                    </button>
                                                    <button onClick={() => handleDeleteSaved(s.id)} disabled={deletingId === s.id} className="text-slate-700 hover:text-red-400">
                                                        {deletingId === s.id ? <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Card 2: Risk Management */}
                    <Card title="Risk Management" className="p-0">
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">Stop Loss %</label>
                                    <input type="number" min="0" value={strategy.stopLossPct} onChange={e => setStrategy({ ...strategy, stopLossPct: parseFloat(e.target.value) })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">Take Profit %</label>
                                    <input type="number" min="0" value={strategy.takeProfitPct} onChange={e => setStrategy({ ...strategy, takeProfitPct: parseFloat(e.target.value) })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                                </div>
                            </div>
                            <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer">
                                <input type="checkbox" checked={strategy.useTrailingStop} onChange={e => setStrategy({ ...strategy, useTrailingStop: e.target.checked })} className="rounded bg-slate-800 border-slate-600" />
                                <span>Trailing Stop Loss</span>
                            </label>
                        </div>
                    </Card>

                    {/* Card 3: Execution */}
                    <Card title="Execution" className="p-0">
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">Position Sizing</label>
                                <select value={strategy.positionSizing} onChange={e => setStrategy({ ...strategy, positionSizing: e.target.value as any })} className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-1 text-slate-200 mb-1">
                                    {Object.values(PositionSizeMode).map(m => <option key={m}>{m}</option>)}
                                </select>
                                <input type="number" value={strategy.positionSizeValue} onChange={e => setStrategy({ ...strategy, positionSizeValue: parseFloat(e.target.value) })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">Slippage %</label>
                                    <input type="number" min="0" step="0.01" value={strategy.slippage} onChange={e => setStrategy({ ...strategy, slippage: parseFloat(e.target.value) || 0 })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">Commission ₹</label>
                                    <input type="number" min="0" step="1" value={strategy.commission} onChange={e => setStrategy({ ...strategy, commission: parseFloat(e.target.value) || 0 })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">Start Time</label>
                                    <input type="time" value={strategy.startTime} onChange={e => setStrategy({ ...strategy, startTime: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">End Time</label>
                                    <input type="time" value={strategy.endTime} onChange={e => setStrategy({ ...strategy, endTime: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">Pyramiding (Max Entries)</label>
                                <input type="number" min="1" max="10" value={strategy.pyramiding} onChange={e => setStrategy({ ...strategy, pyramiding: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                            </div>
                        </div>
                    </Card>

                    {/* Save error */}
                    {saveError && (
                        <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>{saveError}</span>
                        </div>
                    )}

                    {/* Run error */}
                    {runError && (
                        <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>{runError}</span>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Button
                            variant="secondary"
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full"
                            icon={saving ? <div className="w-3 h-3 border-2 border-slate-400 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                        >
                            {saving ? 'Saving...' : 'Save Strategy'}
                        </Button>
                        <Button
                            onClick={handleRun}
                            disabled={running}
                            className="w-full py-3 shadow-emerald-900/40"
                            icon={running ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <PlayCircle className="w-5 h-5" />}
                        >
                            {running ? 'Simulating...' : 'Run Strategy'}
                        </Button>
                    </div>
                </div>

                {/* MIDDLE: Builder Area (9 Cols) */}
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

                    {/* Mode Switcher */}
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 w-fit">
                        <button
                            onClick={() => { setActiveTab('VISUAL'); setStrategy({ ...strategy, mode: 'VISUAL' }); }}
                            className={`flex items-center px-3 py-1.5 text-xs font-medium rounded ${activeTab === 'VISUAL' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                        >
                            <Filter className="w-3 h-3 mr-2" /> Visual Builder
                        </button>
                        <button
                            onClick={() => { setActiveTab('CODE'); setStrategy({ ...strategy, mode: 'CODE' }); }}
                            className={`flex items-center px-3 py-1.5 text-xs font-medium rounded ${activeTab === 'CODE' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                        >
                            <Code className="w-3 h-3 mr-2" /> Python Code
                        </button>
                    </div>

                    {/* MAIN EDITOR CANVAS */}
                    <div className="pr-2 space-y-6 relative">
                        {isAiLoading && (
                            <div className="absolute inset-0 z-10 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center rounded-lg border border-purple-500/30">
                                <div className="flex flex-col items-center space-y-3">
                                    <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
                                    <div className="text-sm font-bold text-purple-400 shadow-md">AI is generating logic...</div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'VISUAL' ? (
                            <>
                                <div className="space-y-2">
                                    <div className="flex items-center text-emerald-400 font-bold text-sm">
                                        <Zap className="w-4 h-4 mr-2" /> ENTRY CONDITIONS
                                    </div>
                                    <GroupRenderer group={strategy.entryLogic} onChange={g => setStrategy({ ...strategy, entryLogic: g })} />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center text-red-400 font-bold text-sm">
                                        <Activity className="w-4 h-4 mr-2" /> EXIT CONDITIONS
                                    </div>
                                    <GroupRenderer group={strategy.exitLogic} onChange={g => setStrategy({ ...strategy, exitLogic: g })} />
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col">
                                <div className="bg-slate-950 border border-slate-800 rounded-t-lg p-2 flex items-center justify-between text-xs text-slate-500">
                                    <span>strategy.py</span>
                                    <span className="text-emerald-500">Python 3.10 Runtime</span>
                                </div>
                                <textarea
                                    value={strategy.pythonCode}
                                    onChange={e => setStrategy({ ...strategy, pythonCode: e.target.value })}
                                    className="bg-[#0d1117] text-slate-300 font-mono text-sm p-4 outline-none resize-y border border-slate-800 border-t-0 rounded-b-lg leading-relaxed min-h-[400px]"
                                    spellCheck={false}
                                />
                            </div>
                        )}
                    </div>

                    {/* Natural Language Summary */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-start space-x-3">
                        <MessageSquare className="w-5 h-5 text-slate-500 mt-0.5" />
                        <div>
                            <div className="text-xs font-bold text-slate-500 uppercase">Logic Summary</div>
                            <p className="text-sm text-slate-300 leading-snug">{displaySummary}</p>
                        </div>
                    </div>
                </div>

            </div>
        </>
    );
};

export default StrategyBuilder;
