
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { PlayCircle, Filter, Code, Cpu, MessageSquare, Zap, Activity, Save, Trash2, ChevronDown, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';
import {
    AssetClass, Timeframe, IndicatorType, Operator, Strategy, Logic,
    RuleGroup, Condition, PositionSizeMode, RankingMethod
} from '../types';
import { saveStrategy, runBacktest, fetchSavedStrategies, deleteStrategy, previewStrategy, generateStrategy } from '../services/api';
import { fetchStrategies } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { StrategyPreset } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { GroupRenderer } from '../components/strategy/GroupRenderer';

// --- PRESET LOGIC MAP ---
// Maps preset IDs to their visual rule trees so selecting a preset populates the builder.
const PRESET_LOGIC: Record<string, { mode: 'VISUAL' | 'CODE'; entryLogic?: RuleGroup; exitLogic?: RuleGroup; pythonCode?: string }> = {
    "1": {
        mode: 'VISUAL',
        entryLogic: {
            id: 'preset1_entry', type: 'GROUP', logic: Logic.AND,
            conditions: [{ id: 'p1e1', indicator: IndicatorType.RSI, period: 14, operator: Operator.CROSSES_BELOW, compareType: 'STATIC', value: 30 }]
        },
        exitLogic: {
            id: 'preset1_exit', type: 'GROUP', logic: Logic.AND,
            conditions: [{ id: 'p1x1', indicator: IndicatorType.RSI, period: 14, operator: Operator.CROSSES_ABOVE, compareType: 'STATIC', value: 70 }]
        },
    },
    "2": {
        mode: 'CODE',
        pythonCode: `def signal_logic(df):
    # Bollinger Bands Mean Reversion
    # vbt, pd, np, ta are available. config is a dict of preset params.
    period = int(config.get("period", 20))
    std_dev = float(config.get("std_dev", 2.0))
    bb = vbt.BBANDS.run(df["close"], window=period, alpha=std_dev)
    entries = df["close"].vbt.crossed_below(bb.lower)
    exits = df["close"].vbt.crossed_above(bb.middle)
    return entries, exits`,
    },
    "3": {
        mode: 'CODE',
        pythonCode: `def signal_logic(df):
    # MACD Crossover
    # vbt, pd, np, ta are available. config is a dict of preset params.
    fast = int(config.get("fast", 12))
    slow = int(config.get("slow", 26))
    signal_w = int(config.get("signal", 9))
    macd = vbt.MACD.run(df["close"], fast_window=fast, slow_window=slow, signal_window=signal_w)
    entries = macd.macd.vbt.crossed_above(macd.signal)
    exits = macd.macd.vbt.crossed_below(macd.signal)
    return entries, exits`,
    },
    "4": {
        mode: 'VISUAL',
        entryLogic: {
            id: 'preset4_entry', type: 'GROUP', logic: Logic.AND,
            conditions: [{ id: 'p4e1', indicator: IndicatorType.EMA, period: 20, operator: Operator.CROSSES_ABOVE, compareType: 'INDICATOR', rightIndicator: IndicatorType.EMA, rightPeriod: 50, value: 0 }]
        },
        exitLogic: {
            id: 'preset4_exit', type: 'GROUP', logic: Logic.AND,
            conditions: [{ id: 'p4x1', indicator: IndicatorType.EMA, period: 20, operator: Operator.CROSSES_BELOW, compareType: 'INDICATOR', rightIndicator: IndicatorType.EMA, rightPeriod: 50, value: 0 }]
        },
    },
    "5": {
        mode: 'CODE',
        pythonCode: `def signal_logic(df):
    # Supertrend (ATR-based trailing stop)
    # vbt, pd, np, ta are available. config is a dict of preset params.
    period = int(config.get("period", 10))
    mult = float(config.get("multiplier", 3.0))
    atr = vbt.ATR.run(df["high"], df["low"], df["close"], window=period).atr
    mid = df["close"].ewm(span=period, adjust=False).mean()
    upper = mid + mult * atr
    lower = mid - mult * atr
    entries = df["close"].vbt.crossed_above(lower)
    exits = df["close"].vbt.crossed_below(upper)
    return entries, exits`,
    },
    "6": {
        mode: 'CODE',
        pythonCode: `def signal_logic(df):
    # Stochastic RSI
    # vbt, pd, np, ta are available. config is a dict of preset params.
    rsi_period = int(config.get("rsi_period", 14))
    k = int(config.get("k_period", 3))
    d = int(config.get("d_period", 3))
    rsi = ta.momentum.rsi(df["close"], window=rsi_period)
    stoch_k = rsi.rolling(k).mean()
    stoch_d = stoch_k.rolling(d).mean()
    entries = ((stoch_k > stoch_d) & (stoch_k.shift(1) <= stoch_d.shift(1)) & (stoch_k < 80)).fillna(False)
    exits = ((stoch_k < stoch_d) & (stoch_k.shift(1) >= stoch_d.shift(1)) & (stoch_k > 20)).fillna(False)
    return entries, exits`,
    },
    "7": {
        mode: 'CODE',
        pythonCode: `def signal_logic(df):
    # ATR Channel Breakout
    # vbt, pd, np, ta are available. config is a dict of preset params.
    period = int(config.get("period", 14))
    mult = float(config.get("multiplier", 2.0))
    atr = vbt.ATR.run(df["high"], df["low"], df["close"], window=period).atr
    upper_band = df["high"].rolling(period).max() + mult * atr
    lower_band = df["low"].rolling(period).min() - mult * atr
    entries = df["close"].vbt.crossed_above(upper_band.shift(1))
    exits = df["close"].vbt.crossed_below(lower_band.shift(1))
    return entries, exits`,
    },
};

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
}

const StrategyBuilder: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'VISUAL' | 'CODE'>('VISUAL');
    const [presets, setPresets] = useState<StrategyPreset[]>([]);
    const [activePresetId, setActivePresetId] = useState<string>('');
    const [symbol, setSymbol] = useState<string>('NIFTY 50');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

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
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Preview state
    const [preview, setPreview] = useState<PreviewState>({
        loading: false, entry_count: 0, exit_count: 0,
        entry_dates: [], exit_dates: [], prices: [], dates: [], error: null
    });
    const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --- INIT ---
    useEffect(() => {
        fetchStrategies().then(setPresets).catch(console.error);
        fetchSavedStrategies().then(setSavedStrategies).catch(console.error);
    }, []);

    // --- DEBOUNCED PREVIEW ---
    const triggerPreview = useCallback((strat: Strategy, sym: string) => {
        if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = setTimeout(async () => {
            setPreview(p => ({ ...p, loading: true, error: null }));
            try {
                const result = await previewStrategy(strat, sym);
                setPreview({
                    loading: false,
                    entry_count: result.entry_count,
                    exit_count: result.exit_count,
                    entry_dates: result.entry_dates,
                    exit_dates: result.exit_dates,
                    prices: result.prices,
                    dates: result.dates,
                    error: null,
                });
            } catch (e: any) {
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
        const logic = PRESET_LOGIC[presetId];
        if (!preset) return;

        const defaultParams: Record<string, any> = {};
        preset.params.forEach(p => { defaultParams[p.name] = p.default; });

        if (logic) {
            setStrategy(prev => ({
                ...prev,
                id: preset.id,
                name: preset.name,
                description: preset.description,
                mode: logic.mode,
                params: defaultParams,
                ...(logic.entryLogic ? { entryLogic: logic.entryLogic } : {}),
                ...(logic.exitLogic ? { exitLogic: logic.exitLogic } : {}),
                ...(logic.pythonCode ? { pythonCode: logic.pythonCode } : {}),
            }));
            setActiveTab(logic.mode);
        } else {
            setStrategy(prev => ({
                ...prev,
                id: preset.id,
                name: preset.name,
                description: preset.description,
                mode: 'CODE',
                params: defaultParams,
            }));
            setActiveTab('CODE');
        }
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
            alert('Delete failed: ' + (e?.message || e));
        } finally {
            setDeletingId(null);
        }
    };

    // --- RUN ---
    const handleRun = async () => {
        setRunning(true);
        try {
            const result = await runBacktest(strategy.id !== 'new' ? strategy.id : null, symbol, {
                ...strategy,
                capital: strategy.positionSizeValue,
                strategyName: strategy.name,
                symbol,
                ...(startDate ? { startDate } : {}),
                ...(endDate   ? { endDate }   : {}),
            });
            navigate('/results', { state: { result } });
        } catch (e: any) {
            alert('Error: ' + (e?.message || e));
        } finally {
            setRunning(false);
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

    // --- LOGIC SUMMARY ---
    const generateSummary = useMemo(() => {
        if (strategy.mode === 'CODE') return "Custom Python Logic Strategy";
        const describeGroup = (group: RuleGroup): string => {
            if (!group.conditions.length) return "No conditions";
            return group.conditions.map(c => {
                if ('type' in c && c.type === 'GROUP') return `(${describeGroup(c as RuleGroup)})`;
                const cond = c as Condition;
                const right = cond.compareType === 'STATIC' ? cond.value : `${cond.rightIndicator}(${cond.rightPeriod})`;
                const tf = cond.timeframe ? `[${cond.timeframe}]` : '';
                return `${cond.indicator}${tf}(${cond.period}) ${cond.operator} ${right}`;
            }).join(` ${group.logic} `);
        };
        return `Entry when ${describeGroup(strategy.entryLogic)}. Exit when ${describeGroup(strategy.exitLogic)}.`;
    }, [strategy]);

    // --- PREVIEW CHART ---
    const renderPreviewChart = () => {
        const { prices, dates, entry_dates, exit_dates } = preview;
        if (!prices.length) return null;

        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const range = maxP - minP || 1;
        const W = 300, H = 120;

        const toX = (i: number) => (i / (prices.length - 1)) * W;
        const toY = (p: number) => H - ((p - minP) / range) * H;

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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full min-h-0">

            {/* LEFT: Config Panel (3 Cols) */}
            <div className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-2 min-h-0">
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
                                            <button onClick={() => handleDeleteSaved(s.id)} disabled={deletingId === s.id} className="ml-2 text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {deletingId === s.id ? <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                            </button>
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

                <div className="mt-auto space-y-2">
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

            {/* MIDDLE: Builder Area (6 Cols) */}
            <div className="lg:col-span-6 flex flex-col gap-4 overflow-hidden min-h-0">
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
                <div className="flex-1 overflow-y-auto pr-2 space-y-6">
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
                        <div className="h-full flex flex-col">
                            <div className="bg-slate-950 border border-slate-800 rounded-t-lg p-2 flex items-center justify-between text-xs text-slate-500">
                                <span>strategy.py</span>
                                <span className="text-emerald-500">Python 3.10 Runtime</span>
                            </div>
                            <textarea
                                value={strategy.pythonCode}
                                onChange={e => setStrategy({ ...strategy, pythonCode: e.target.value })}
                                className="flex-1 bg-[#0d1117] text-slate-300 font-mono text-sm p-4 outline-none resize-none border border-slate-800 border-t-0 rounded-b-lg leading-relaxed"
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
                        <p className="text-sm text-slate-300 leading-snug">{generateSummary}</p>
                    </div>
                </div>
            </div>

            {/* RIGHT: Preview + Symbol (3 Cols) */}
            <div className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto min-h-0">
                <Card title="Live Signal Preview" className="h-[300px] flex flex-col">
                    <div className="flex-1 flex flex-col bg-slate-950 m-[-1rem] mt-0 rounded-b-xl relative overflow-hidden">
                        {/* Chart area */}
                        <div className="flex-1 relative">
                            {preview.loading ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="flex flex-col items-center space-y-2">
                                        <RefreshCw className="w-5 h-5 text-slate-500 animate-spin" />
                                        <span className="text-xs text-slate-600">Computing signals...</span>
                                    </div>
                                </div>
                            ) : preview.error ? (
                                <div className="absolute inset-0 flex items-center justify-center px-4">
                                    <div className="text-center">
                                        <AlertCircle className="w-5 h-5 text-slate-600 mx-auto mb-1" />
                                        <span className="text-xs text-slate-600">Preview unavailable</span>
                                    </div>
                                </div>
                            ) : preview.prices.length > 0 ? (
                                <div className="absolute inset-0 p-2">
                                    {renderPreviewChart()}
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xs text-slate-600">No data</span>
                                </div>
                            )}
                        </div>
                        {/* Stats bar */}
                        <div className="border-t border-slate-800 p-3 flex items-center justify-between">
                            <div className="text-center">
                                <div className="text-xl font-bold text-slate-200">{preview.entry_count + preview.exit_count}</div>
                                <div className="text-[10px] text-slate-500">Signals (last 100 bars)</div>
                            </div>
                            <div className="flex space-x-2">
                                <Badge variant="success">{preview.entry_count} Buys</Badge>
                                <Badge variant="danger">{preview.exit_count} Sells</Badge>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card title="Symbol & Universe">
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Symbol</label>
                            <input
                                list="symbol-suggestions"
                                value={symbol}
                                onChange={e => setSymbol(e.target.value.toUpperCase())}
                                placeholder="e.g. RELIANCE, TCS, NIFTY 50"
                                className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200 outline-none placeholder-slate-600"
                            />
                            <datalist id="symbol-suggestions">
                                {COMMON_SYMBOLS.map(s => <option key={s} value={s} />)}
                            </datalist>
                        </div>

                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Backtest Period</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-600 block mb-0.5">From</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={e => setStartDate(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-1.5 text-slate-200 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-600 block mb-0.5">To</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={e => setEndDate(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-1.5 text-slate-200 outline-none"
                                    />
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-600 mt-1">Leave blank to use all available data</p>
                        </div>

                        <div className="border-t border-slate-800 pt-3">
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2">Screening Logic</div>
                            <select
                                value={strategy.rankingMethod || RankingMethod.NONE}
                                onChange={e => setStrategy({ ...strategy, rankingMethod: e.target.value as RankingMethod })}
                                className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200 outline-none"
                            >
                                {Object.values(RankingMethod).map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <div className="mt-2 flex items-center space-x-2">
                                <label className="text-xs text-slate-500">Select Top</label>
                                <input
                                    type="number"
                                    value={strategy.rankingTopN || 5}
                                    onChange={e => setStrategy({ ...strategy, rankingTopN: parseInt(e.target.value) })}
                                    className="w-12 bg-slate-950 border border-slate-700 rounded text-xs px-2 py-1 text-slate-200 text-center"
                                />
                                <span className="text-xs text-slate-500">Assets</span>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

        </div>
    );
};

export default StrategyBuilder;
