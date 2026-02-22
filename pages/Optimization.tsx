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
        capital, commission, slippage, pyramiding, positionSizing, positionSizeValue,
        stopLossPct, takeProfitPct, useTrailingStop,
        setStopLossPct, setTakeProfitPct, setUseTrailingStop,
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
                if (p.name === 'upper')  max = Math.min(99, max);
                if (p.name === 'lower')  max = Math.min(49, max);
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
    const [enableRiskSearch, setEnableRiskSearch] = useState(false);
    const [riskParams, setRiskParams] = useState<ParamConfig[]>([
        { id: 'r0', name: 'stopLossPct',     min: 0, max: 5, step: 1 },
        { id: 'r1', name: 'takeProfitPct',   min: 0, max: 5, step: 1 },
        { id: 'r2', name: 'useTrailingStop', min: 0, max: 1, step: 1 },
    ]);
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
        initial_capital: capital, commission, slippage, pyramiding, positionSizing, positionSizeValue,
    });

    const toRanges = (list: ParamConfig[]) =>
        list.reduce((acc, p) => { acc[p.name] = { min: p.min, max: p.max, step: p.step }; return acc; }, {} as any);

    const applyParamsAndRun = (paramSet: Record<string, number>) => {
        setGlobalParams(paramSet);
        if (paramSet.stopLossPct !== undefined) setStopLossPct(paramSet.stopLossPct);
        if (paramSet.takeProfitPct !== undefined) setTakeProfitPct(paramSet.takeProfitPct);
        if (paramSet.useTrailingStop !== undefined) setUseTrailingStop(Boolean(paramSet.useTrailingStop));
        navigate('/backtest', { state: { appliedParams: paramSet } });
    };

    // ── Run handlers ──────────────────────────────────────────────────────────
    const handleRun = async () => {
        setRunning(true);
        setOptResults(null);
        setSelectedParams(null);
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
                if (enableRiskSearch) optConfig.riskRanges = toRanges(riskParams);
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

    const handleRunPhase2 = async (fixedParamSet: Record<string, number>) => {
        setRunning(true);
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
                // Use the same split ratio set on the Backtest page (from context).
                // Phase 2 trains on the OOS slice so it doesn't see Phase 1's data.
                phase2SplitRatio: enableDataSplit ? splitRatio / 100 : 0.0,
            });
            setOptResults({ ...((optResults ?? {}) as any), ...res, wfo: [], period: undefined });
        } catch (e) {
            setErrorMessage('Risk optimisation failed: ' + e);
        }
        setRunning(false);
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

            {/* Running spinner */}
            {running && (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-6" />
                    <h3 className="text-lg font-medium text-slate-200">
                        {activeTab === 'WFO' ? 'Processing rolling WFO windows...' : 'Running Optuna trials...'}
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
                        enableRiskSearch={enableRiskSearch}
                        setEnableRiskSearch={setEnableRiskSearch}
                        riskParams={riskParams}
                        setRiskParams={setRiskParams}
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
                        enableRiskSearch={enableRiskSearch}
                        selectedParams={selectedParams}
                        setSelectedParams={setSelectedParams}
                        running={running}
                        dataStatus={dataStatus}
                        onApply={applyParamsAndRun}
                        onRunPhase2={handleRunPhase2}
                        onReset={() => { setOptResults(null); setSelectedParams(null); }}
                        dataStartDate={(optResults as any).dataStartDate}
                        dataEndDate={(optResults as any).dataEndDate}
                        totalBars={(optResults as any).totalBars}
                        phase1EndDate={(optResults as any).phase1EndDate}
                        phase1Bars={(optResults as any).phase1Bars}
                        splitRatio={(optResults as any).splitRatio}
                    />

                    {wizardStep === 'risk' && optResults.riskGrid && optResults.riskGrid.length > 0 && (
                        <Phase2ResultsTable
                            riskGrid={optResults.riskGrid}
                            optunaMetric={optunaMetric}
                            splitRatio={optResults.splitRatio}
                            combinedParams={optResults.combinedParams}
                            onApply={applyParamsAndRun}
                            phase2StartDate={(optResults as any).phase2StartDate}
                            phase2Bars={(optResults as any).phase2Bars}
                            dataEndDate={(optResults as any).dataEndDate}
                            dataStartDate={(optResults as any).dataStartDate}
                            totalBars={(optResults as any).totalBars}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default Optimization;
