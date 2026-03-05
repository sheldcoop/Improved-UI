import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import { runOptimization, runWFO } from '../services/optimizationService';
import { useBacktestContext } from '../context/BacktestContext';
import { formatDateDisplay } from '../utils/dateUtils';

// Wizard sub-components
import WizardSteps, { WizardStep } from '../components/optimization/WizardSteps';
import ErrorBanner from '../components/optimization/ErrorBanner';
import SetupCard from '../components/optimization/SetupCard';
import ExplainerPanel from '../components/optimization/ExplainerPanel';
import Phase1ResultsTable from '../components/optimization/Phase1ResultsTable';
import Phase2ResultsTable from '../components/optimization/Phase2ResultsTable';
import RiskParamConfig from '../components/optimization/RiskParamConfig';
import { ParamConfig } from '../components/optimization/ParamRangeRow';

const PRESET_NAMES: Record<string, string> = {
    '1': 'RSI Mean Reversion',
    '3': 'MACD Crossover',
};

const Optimization: React.FC = () => {
    const navigate = useNavigate();
    const {
        symbol, strategyId, customStrategies, setParams: setGlobalParams, startDate, endDate,
        timeframe, paramRanges,
        wfoConfig, setWfoConfig,
        capital, pyramiding, positionSizing, positionSizeValue,
        stopLossPct, takeProfitPct,
        setStopLossPct, setTakeProfitPct, setTrailingStopPct,
        optResults, setOptResults,
        dataStatus,
        // Split is set on the Backtest page and shared via context
        enableDataSplit, splitRatio,
    } = useBacktestContext();

    // ── Wizard state ──────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<'WFO' | 'GRID'>('GRID');
    const [running, setRunning] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [optunaMetric, setOptunaMetric] = useState('sharpe');
    const [selectedParams, setSelectedParams] = useState<Record<string, number> | null>(null);
    const [selectedRiskParams, setSelectedRiskParams] = useState<Record<string, number> | null>(null);

    // ── Phase 1 params ────────────────────────────────────────────────────────
    const [params, setParams] = useState<ParamConfig[]>([]);

    // Auto-sync params from strategy
    React.useEffect(() => {
        const strategy = customStrategies.find(s => s.id === strategyId);
        if (strategy?.params) {
            const initialParams = strategy.params.map((p, idx) => {
                const v = p.default || 1;
                let min = p.type === 'float' ? v / 2 : Math.max(1, Math.floor(v / 2));
                let max = p.type === 'float' ? v * 1.5 : Math.ceil(v * 1.5);
                if (p.name === 'upper') max = Math.min(99, max);
                if (p.name === 'lower') max = Math.min(49, max);
                if (p.name === 'period') { min = Math.max(2, min); max = Math.min(100, max); }
                return { id: idx.toString(), name: p.name, min, max, step: p.type === 'float' ? 0.1 : 1 };
            });
            setParams(initialParams);
        } else {
            const builtinRanges: Record<string, Record<string, { min: number; max: number; step: number }>> = {
                '1': { period: { min: 5, max: 30, step: 1 }, lower: { min: 10, max: 40, step: 1 }, upper: { min: 60, max: 90, step: 1 } },
                '3': { fast: { min: 5, max: 20, step: 1 }, slow: { min: 15, max: 50, step: 1 }, signal: { min: 3, max: 15, step: 1 } },
            };
            const source = Object.keys(paramRanges).length > 0 ? paramRanges : (builtinRanges[strategyId] ?? {});
            setParams(Object.entries(source).map(([name, range], idx) => ({ id: idx.toString(), name, ...range })));
        }
    }, [strategyId, customStrategies, paramRanges]);

    const updateParam = (id: string, field: keyof ParamConfig, value: number) =>
        setParams(params.map(p => p.id === id ? { ...p, [field]: value } : p));

    // ── Phase 2 state ─────────────────────────────────────────────────────────
    const [riskParams, setRiskParams] = useState<ParamConfig[]>([
        { id: 'r0', name: 'stopLossPct', min: 0, max: 5, step: 0.5 },
        { id: 'r1', name: 'takeProfitPct', min: 0, max: 10, step: 0.5 },
        { id: 'r2', name: 'trailingStopPct', min: 0, max: 3, step: 0.5 },
    ]);
    const [phase2Running, setPhase2Running] = useState(false);

    // ── Derived wizard step ───────────────────────────────────────────────────
    const wizardStep: WizardStep =
        !optResults ? 'setup' :
            (optResults.riskGrid && optResults.riskGrid.length > 0) ? 'risk' :
                'results';

    // ── Helpers ───────────────────────────────────────────────────────────────
    const strategyName =
        customStrategies.find(s => s.id === strategyId)?.name ??
        PRESET_NAMES[strategyId] ??
        'Strategy';

    const buildConfigPayload = () => ({
        initial_capital: capital, pyramiding, positionSizing, positionSizeValue,
    });

    const toRanges = (list: ParamConfig[]) =>
        list.reduce((acc, p) => { acc[p.name] = { min: p.min, max: p.max, step: p.step }; return acc; }, {} as any);

    const applyParams = (paramSet: Record<string, number>) => {
        setGlobalParams(paramSet);
        if (paramSet.stopLossPct !== undefined) setStopLossPct(paramSet.stopLossPct);
        if (paramSet.takeProfitPct !== undefined) setTakeProfitPct(paramSet.takeProfitPct);
        if (paramSet.trailingStopPct !== undefined) setTrailingStopPct(paramSet.trailingStopPct);
        navigate('/backtest', { state: { appliedParams: paramSet } });
    };

    // ── Run handlers ──────────────────────────────────────────────────────────
    const handleRun = async () => {
        setRunning(true);
        setOptResults(null);
        setSelectedParams(null);
        setSelectedRiskParams(null);
        setErrorMessage(null);

        try {
            if (activeTab === 'GRID') {
                const optConfig: any = {
                    n_trials: 30,
                    scoring_metric: optunaMetric,
                    startDate, endDate, timeframe,
                    config: buildConfigPayload(),
                    phase2SplitRatio: enableDataSplit ? splitRatio / 100 : 0.0,
                };
                // Phase 1 only — no riskRanges. Phase 2 runs separately after user picks a row.
                const res = await runOptimization(symbol || 'NIFTY 50', strategyId || '1', toRanges(params), optConfig);
                setOptResults({ ...res, wfo: [], period: undefined });
            } else {
                // Pass startDate/endDate/timeframe so the WFO backend can slice the
                // correct date window — without these wfo_config["startDate"] is None
                // and WFOEngine._fetch_and_prepare_df crashes with a TypeError.
                const wfoRes = await runWFO(symbol || 'NIFTY 50', strategyId || '1', toRanges(params), wfoConfig, {
                    ...buildConfigPayload(),
                    startDate,
                    endDate,
                    timeframe,
                });
                setOptResults({ grid: [], wfo: wfoRes, period: undefined } as any);
            }
        } catch (e) {
            setErrorMessage('Optimization failed: ' + e);
        }
        setRunning(false);
    };

    // When user selects a Phase 1 row: store selection + always auto-run Phase 2
    const handleSelectPhase1 = (paramSet: Record<string, number>) => {
        setSelectedParams(paramSet);
        setSelectedRiskParams(null);
        // Clear existing riskGrid so Phase 2 re-runs fresh for this RSI selection
        if (optResults) setOptResults({ ...(optResults as any), riskGrid: [], combinedParams: undefined });
        handleRunPhase2(paramSet);
    };

    const handleRunPhase2 = async (fixedParamSet: Record<string, number>) => {
        setPhase2Running(true);
        setErrorMessage(null);
        const fixedRanges = Object.fromEntries(
            Object.entries(fixedParamSet).map(([k, v]) => [k, { min: v, max: v, step: 1 }])
        );
        try {
            const res = await runOptimization(symbol || 'NIFTY 50', strategyId || '1', fixedRanges, {
                n_trials: 30,
                scoring_metric: optunaMetric,
                startDate, endDate, timeframe,
                config: buildConfigPayload(),
                riskRanges: toRanges(riskParams),
                // Phase 2 trains on the OOS slice so it doesn't see Phase 1's data.
                phase2SplitRatio: enableDataSplit ? splitRatio / 100 : 0.0,
            });
            setOptResults({ ...((optResults ?? {}) as any), ...res, wfo: [], period: undefined });
        } catch (e) {
            setErrorMessage('Risk optimisation failed: ' + e);
        }
        setPhase2Running(false);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="w-full h-full flex flex-col space-y-6 max-w-7xl mx-auto">

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100">Optimization Engine</h2>
                    <p className="text-emerald-400 text-sm mt-1 flex items-center flex-wrap gap-2">
                        <Target className="w-4 h-4 mr-1" />
                        Targeting <strong className="mx-1">{strategyName}</strong> on{' '}
                        <strong className="mx-1">{symbol || 'Asset'}</strong> — backtest starts{' '}
                        <strong className="ml-1">{formatDateDisplay(startDate)}</strong>
                        {dataStatus === 'READY'
                            ? <span className="text-emerald-400 text-xs font-mono">● Data Ready</span>
                            : <span className="text-yellow-500 text-xs font-mono">● No Data Loaded</span>
                        }
                    </p>
                </div>
                {/* Wizard progress — only show once past setup */}
                {wizardStep !== 'setup' && <WizardSteps step={wizardStep} />}
            </div>

            {/* Inline error banner */}
            <ErrorBanner message={errorMessage} onDismiss={() => setErrorMessage(null)} />

            {/* Running spinner — Phase 1 full-screen */}
            {running && (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-6" />
                    <h3 className="text-lg font-medium text-slate-200">
                        {activeTab === 'WFO' ? 'Processing rolling WFO windows...' : 'Running Phase 1: Strategy Params...'}
                    </h3>
                    <p className="text-slate-400 text-sm mt-1">
                        {activeTab === 'WFO' ? 'Train → Test across all windows' : 'Maximizing objective across 30 trials'}
                    </p>
                </div>
            )}

            {/* Step 1: Setup */}
            {!running && wizardStep === 'setup' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <SetupCard
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        params={params}
                        updateParam={updateParam}
                        optunaMetric={optunaMetric}
                        setOptunaMetric={setOptunaMetric}
                        wfoConfig={wfoConfig}
                        setWfoConfig={setWfoConfig}
                        dataStatus={dataStatus}
                        running={running}
                        onRun={handleRun}
                    />
                    <ExplainerPanel activeTab={activeTab} />
                </div>
            )}

            {/* Step 2 + 3: Results */}
            {!running && wizardStep !== 'setup' && optResults?.grid && (
                <div className="space-y-4">
                    <Phase1ResultsTable
                        results={optResults.grid}
                        optunaMetric={optunaMetric}
                        hasPhase2Results={wizardStep === 'risk'}
                        selectedParams={selectedParams}
                        setSelectedParams={handleSelectPhase1}
                        phase2Running={phase2Running}
                        onReset={() => { setOptResults(null); setSelectedParams(null); setSelectedRiskParams(null); }}
                        dataStartDate={(optResults as any).dataStartDate}
                        dataEndDate={(optResults as any).dataEndDate}
                        totalBars={(optResults as any).totalBars}
                        phase1EndDate={(optResults as any).phase1EndDate}
                        phase1Bars={(optResults as any).phase1Bars}
                        splitRatio={(optResults as any).splitRatio}
                    />

                    {/* Phase 2 risk param config — always shown after Phase 1, so user can tune ranges before selecting a row */}
                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-5 py-4 space-y-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-200">Phase 2 — SL / TP / TSL Search Ranges</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Configure the search ranges below, then click any row above to run Phase 2 locked to that RSI config.
                            </p>
                        </div>
                        <RiskParamConfig riskParams={riskParams} setRiskParams={setRiskParams} />
                    </div>

                    {/* Phase 2 spinner — inline, below Phase 1 table */}
                    {phase2Running && (
                        <div className="flex items-center gap-3 px-5 py-4 bg-indigo-900/20 border border-indigo-700/40 rounded-xl">
                            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-indigo-300">Running Phase 2: SL / TP / TSL search...</p>
                                <p className="text-xs text-slate-400">
                                    Locked to selected RSI params · Maximizing objective across 30 trials
                                </p>
                            </div>
                        </div>
                    )}

                    {wizardStep === 'risk' && optResults.riskGrid && optResults.riskGrid.length > 0 && (
                        <Phase2ResultsTable
                            riskGrid={optResults.riskGrid}
                            optunaMetric={optunaMetric}
                            splitRatio={optResults.splitRatio}
                            combinedParams={optResults.combinedParams}
                            selectedRiskParams={selectedRiskParams}
                            setSelectedRiskParams={setSelectedRiskParams}
                            onApply={applyParams}
                            phase2StartDate={(optResults as any).phase2StartDate}
                            phase2Bars={(optResults as any).phase2Bars}
                            dataEndDate={(optResults as any).dataEndDate}
                            dataStartDate={(optResults as any).dataStartDate}
                            totalBars={(optResults as any).totalBars}
                        />
                    )}

                    {/* Combined Apply button — shown when both RSI and risk params are selected */}
                    {selectedParams && selectedRiskParams && (
                        <div className="flex items-center justify-between gap-4 bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-5 py-4">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-emerald-300">Ready to backtest with selected params</p>
                                <p className="text-xs text-slate-400 font-mono">
                                    Strategy: {Object.entries(selectedParams).map(([k, v]) => `${k}=${v}`).join(', ')}
                                    {'  ·  '}
                                    Risk: {Object.entries(selectedRiskParams).map(([k, v]) => `${k}=${v}`).join(', ')}
                                </p>
                            </div>
                            <button
                                onClick={() => applyParams({ ...selectedParams, ...selectedRiskParams })}
                                className="shrink-0 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
                            >
                                Apply to Backtest →
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Optimization;
