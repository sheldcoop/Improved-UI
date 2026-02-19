
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, Calendar, DollarSign, Layers, Settings, ChevronDown, Database, Sliders, AlertCircle, CheckCircle, Split, Info, AlertTriangle, CheckSquare, Clock } from 'lucide-react';
import { MOCK_SYMBOLS, UNIVERSES } from '../constants';
import { runBacktest, validateMarketData, DataHealthReport, fetchStrategies } from '../services/api';
import { Timeframe, Strategy } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { fetchClient } from '../services/http';
import { logActiveRun, logDataHealth, logOptunaResults, logWFOBreakdown, logAlert } from '../components/DebugConsole';

// Debounce helper
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

// Search instruments API
const searchInstruments = async (segment: string, query: string) => {
  return fetchClient<Array<{ symbol: string; display_name: string; security_id: string; instrument_type: string }>>(`/market/instruments?segment=${segment}&q=${encodeURIComponent(query)}`);
};

// Run backtest with Dhan API
const runBacktestWithDhan = async (payload: {
  instrument_details: {
    security_id: string;
    symbol: string;
    exchange_segment: string;
    instrument_type: string;
  };
  parameters: {
    timeframe: string;
    start_date: string;
    end_date: string;
    initial_capital: number;
    strategy_logic: {
      name: string;
      [key: string]: any;
    };
  };
}) => {
  return fetchClient<{
    status: string;
    data_summary?: {
      total_candles: number;
      start_date: string;
      end_date: string;
      open_price: number;
      close_price: number;
      high: number;
      low: number;
      avg_volume: number;
    };
    instrument?: {
      symbol: string;
      security_id: string;
      timeframe: string;
    };
    note?: string;
  }>('/market/backtest/run', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};

const Backtest: React.FC = () => {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);

  // Core Config
  const [mode, setMode] = useState<'SINGLE' | 'UNIVERSE'>('SINGLE');
  const [segment, setSegment] = useState<'NSE_EQ' | 'NSE_SME'>('NSE_EQ');
  const [symbol, setSymbol] = useState('');
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; display_name: string; security_id: string; instrument_type: string }>>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<{ symbol: string; display_name: string; security_id: string; instrument_type: string } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [universe, setUniverse] = useState(UNIVERSES[0].id);
  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.D1);

  // Strategy State
  const [strategyId, setStrategyId] = useState('1');
  const [customStrategies, setCustomStrategies] = useState<Strategy[]>([]);

  // Date Range
  const [startDate, setStartDate] = useState('2023-01-01');
  const [endDate, setEndDate] = useState('2023-12-31');

  // Dynamic Strategy Parameters (Feature A)
  const [params, setParams] = useState<Record<string, number>>({});

  // Splitter State (Feature C)
  const [splitRatio, setSplitRatio] = useState(80); // 80% Train, 20% Test

  // Advanced Settings State
  const [capital, setCapital] = useState(100000);
  const [slippage, setSlippage] = useState(0.05);
  const [commission, setCommission] = useState(20);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // New Data Loading State (Improvement 1 & 2)
  const [dataStatus, setDataStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  const [healthReport, setHealthReport] = useState<DataHealthReport | null>(null);

  // --- Optimization State (Optuna / WFO) ---
  const [isDynamic, setIsDynamic] = useState(false);
  const [wfoConfig, setWfoConfig] = useState({ trainWindow: 12, testWindow: 3 });
  const [autoTuneConfig, setAutoTuneConfig] = useState({ lookbackMonths: 12, trials: 30, metric: 'sharpe' });
  const [paramRanges, setParamRanges] = useState<Record<string, { min: number, max: number, step: number }>>({});
  const [isAutoTuning, setIsAutoTuning] = useState(false);
  const [showRanges, setShowRanges] = useState(false);
  const [reproducible, setReproducible] = useState(false);
  // Auto-Calculate WFO Windows when dates change
  useEffect(() => {
    if (!isDynamic) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalMonths = Math.round(diffTime / (1000 * 60 * 60 * 24 * 30.44));

    let newTrain = 12;
    let newTest = 3;

    if (totalMonths < 12) { newTrain = 3; newTest = 1; }
    else if (totalMonths < 24) { newTrain = 6; newTest = 2; }
    else if (totalMonths < 36) { newTrain = 9; newTest = 3; }

    // Only update if significantly different to avoid overriding user custom tweaks too aggressively
    // But requirement says "Auto-calculate... when user loads market data or changes date range"
    // So we should update. To be safe, we can check if the *current* config is "invalid" or just strict overwrite.
    // User asked: "When user changes date range... auto-update". So strict overwrite is expected behavior for a "date change" event.

    setWfoConfig({ trainWindow: newTrain, testWindow: newTest });

  }, [startDate, endDate, isDynamic]);

  // Load Strategies on Mount
  useEffect(() => {
    const loadStrats = async () => {
      try {
        const strats = await fetchStrategies();
        setCustomStrategies(strats);
      } catch (e) {
        console.error("Failed to load strategies", e);
      }
    };
    loadStrats();
  }, []);

  // Initialize defaults based on strategy selection
  useEffect(() => {
    if (strategyId === '1') { // RSI
      setParams({ period: 14, lower: 30, upper: 70 });
      setParamRanges({
        period: { min: 5, max: 30, step: 1 },
        lower: { min: 10, max: 40, step: 1 },
        upper: { min: 60, max: 90, step: 1 }
      });
    } else if (strategyId === '3') { // SMA
      setParams({ fast: 10, slow: 50 });
      setParamRanges({
        fast: { min: 5, max: 50, step: 1 },
        slow: { min: 20, max: 200, step: 1 }
      });
    } else {
      // Clear params for custom strategies
      setParams({});
      setParamRanges({});
    }
    setShowRanges(false);
  }, [strategyId]);

  // Reset data status when key inputs change
  useEffect(() => {
    setDataStatus('IDLE');
    setHealthReport(null);
  }, [symbol, universe, timeframe, startDate, endDate]);

  // Debounced search effect
  const debouncedSearchQuery = useDebounce(symbolSearchQuery, 300);

  useEffect(() => {
    if (mode !== 'SINGLE' || !debouncedSearchQuery || debouncedSearchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const doSearch = async () => {
      setIsSearching(true);
      try {
        const results = await searchInstruments(segment, debouncedSearchQuery);
        setSearchResults(results);
      } catch (e) {
        console.error('Search failed:', e);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    doSearch();
  }, [debouncedSearchQuery, segment, mode]);

  // Calculate Split Date
  const splitDateString = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (isNaN(diffDays)) return '-';

    const splitDayIndex = Math.floor(diffDays * (splitRatio / 100));
    const splitDate = new Date(start);
    splitDate.setDate(start.getDate() + splitDayIndex);
    return splitDate.toISOString().split('T')[0];
  }, [startDate, endDate, splitRatio]);

  const handleLoadData = async () => {
    setDataStatus('LOADING');
    try {
      const target = mode === 'SINGLE' ? symbol : universe;

      // Calculate extended from_date (Lookback + Backtest)
      const lookbackMonths = autoTuneConfig.lookbackMonths;
      const startDt = new Date(startDate);
      const extendedDt = new Date(startDt);
      extendedDt.setMonth(startDt.getMonth() - lookbackMonths);
      const extendedFromDate = extendedDt.toISOString().split('T')[0];

      console.log(`[Unified Load] Fetching ${lookbackMonths}m lookback + backtest range: ${extendedFromDate} to ${endDate}`);

      logActiveRun({
        type: 'DATA_LOADING',
        strategyName: 'Market Data Validator',
        symbol: target,
        timeframe,
        startDate: extendedFromDate,
        endDate: endDate,
        status: 'running'
      });

      const report = await validateMarketData(target, timeframe, extendedFromDate, endDate);
      setHealthReport(report);
      logDataHealth(report);

      if (report.status === 'POOR' || report.status === 'CRITICAL') {
        logAlert([{
          type: 'warning',
          msg: `Data health is ${report.status} for ${target}. ${report.missingCandles} candles missing.`,
          timestamp: new Date().toLocaleTimeString()
        }]);
      }

      setDataStatus('READY');
    } catch (e) {
      console.error("Data load failed", e);
      setDataStatus('ERROR');
      logAlert([{
        type: 'error',
        msg: `Failed to load data for ${mode === 'SINGLE' ? symbol : universe}: ${e}`,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      logActiveRun(null);
    }
  };

  const handleAutoTune = async () => {
    if (!selectedInstrument) {
      alert("Please select a symbol first.");
      return;
    }

    // Enforcement: Block auto-tune if data is not pre-loaded/validated
    if (dataStatus !== 'READY') {
      alert("Optimization requires pre-loaded data. Please click 'Load Market Data' first to fetch the lookback range.");
      return;
    }

    if (!showRanges) {
      setShowRanges(true);
      return;
    }

    setIsAutoTuning(true);
    logActiveRun({
      type: 'AUTO_TUNING',
      strategyName: strategyId === '1' ? 'RSI Mean Reversion' : strategyId === '3' ? 'Moving Average Crossover' : 'Custom Strategy',
      symbol: selectedInstrument.symbol,
      timeframe,
      startDate,
      endDate,
      status: 'running'
    });

    try {
      const result = await fetchClient<{ bestParams: Record<string, number>, score: number, period: string, grid?: any[] }>('/optimization/auto-tune', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedInstrument.symbol,
          strategyId: strategyId,
          ranges: paramRanges,
          startDate: startDate,
          lookbackMonths: autoTuneConfig.lookbackMonths,
          scoringMetric: autoTuneConfig.metric,
          reproducible: reproducible
        })
      });
      if (result.bestParams) {
        setParams(result.bestParams);
        logOptunaResults(result.grid || []); // Assuming result.grid exists in the backend response
        logActiveRun(null); // Clear active run after tune
        setShowRanges(false); // Hide ranges after successful tune
      }
    } catch (e) {
      console.error("Auto-tune failed", e);
      alert("Auto-tune failed. Check logs.");
    } finally {
      setIsAutoTuning(false);
      logActiveRun(null);
    }
  };

  const handleRun = async () => {
    if (dataStatus !== 'READY') {
      alert("Please load and validate market data first.");
      return;
    }

    if (mode === 'SINGLE' && !selectedInstrument) {
      alert("Please select a symbol from the search results.");
      return;
    }

    setRunning(true);
    logActiveRun({
      type: isDynamic ? 'WALK_FORWARD_OPTIMIZATION' : 'SINGLE_BACKTEST',
      strategyName: strategyId === '1' ? 'RSI Mean Reversion' : strategyId === '3' ? 'Moving Average Crossover' : 'Custom Strategy',
      symbol: mode === 'SINGLE' ? selectedInstrument?.symbol || symbol : universe,
      timeframe,
      startDate,
      endDate,
      params,
      status: 'running'
    });

    try {
      if (isDynamic && mode === 'SINGLE' && selectedInstrument) {
        // Path 1: Dynamic WFO Backtest
        const result = await fetchClient<any>('/optimization/wfo', {
          method: 'POST',
          body: JSON.stringify({
            symbol: selectedInstrument.symbol,
            strategyId: strategyId,
            ranges: paramRanges,
            wfoConfig: {
              ...wfoConfig,
              startDate,
              endDate,
              scoringMetric: autoTuneConfig.metric,
              initial_capital: capital
            },
            reproducible: reproducible,
            fullResults: true
          })
        });

        if (result && !result.error) {
          // Log structured data to specialized inspectors
          if (result.wfo) logWFOBreakdown(result.wfo);

          logActiveRun(null);
          navigate('/results', { state: { result } });
        } else {
          alert("Dynamic Backtest Failed: " + (result?.error || "Unknown error"));
          logActiveRun(null);
        }
      } else if (mode === 'SINGLE' && selectedInstrument) {
        // Path 2: Standard Dhan-based Single Backtest
        const timeframeMap: Record<string, string> = {
          [Timeframe.M1]: '1m', [Timeframe.M5]: '5m', [Timeframe.M15]: '15m',
          [Timeframe.H1]: '1h', [Timeframe.D1]: '1d'
        };

        const result = await runBacktestWithDhan({
          instrument_details: {
            security_id: selectedInstrument.security_id,
            symbol: selectedInstrument.symbol,
            exchange_segment: 'NSE_EQ',
            instrument_type: selectedInstrument.instrument_type
          },
          parameters: {
            timeframe: timeframeMap[timeframe] || '1d',
            start_date: startDate,
            end_date: endDate,
            initial_capital: capital,
            strategy_logic: {
              id: strategyId,
              name: strategyId === '1' ? 'RSI Mean Reversion' : strategyId === '3' ? 'Moving Average Crossover' : 'Custom Strategy',
              ...params
            }
          }
        });

        if (result) {
          navigate('/results', { state: { result } });
        }
      } else {
        // Path 3: Fallback for Universe mode
        const config: any = {
          capital, slippage, commission, ...params,
          splitDate: splitDateString,
          trainTestSplit: splitRatio
        };

        if (mode === 'UNIVERSE') {
          config.universe = universe;
        }

        const result = await runBacktest(strategyId, mode === 'SINGLE' ? symbol : universe, config);
        if (result) result.timeframe = timeframe;
        navigate('/results', { state: { result } });
      }
    } catch (e) {
      alert("Backtest Failed: " + e);
      logActiveRun(null);
    } finally {
      setRunning(false);
    }
  };

  const renderHealthBadge = (status: string) => {
    switch (status) {
      case 'EXCELLENT': return <Badge variant="success" className="flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Excellent Quality</Badge>;
      case 'GOOD': return <Badge variant="info" className="flex items-center"><CheckSquare className="w-3 h-3 mr-1" /> Good Quality</Badge>;
      case 'POOR': return <Badge variant="warning" className="flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> Poor Quality</Badge>;
      case 'CRITICAL': return <Badge variant="danger" className="flex items-center"><AlertCircle className="w-3 h-3 mr-1" /> Critical Issues</Badge>;
      default: return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-slate-100 mb-2">Backtest Engine</h2>
        <p className="text-slate-400">Validate strategy performance with professional-grade tools.</p>
      </div>

      <Card className="p-8 shadow-2xl shadow-black/50 border-t-4 border-t-emerald-500">
        <div className="space-y-8">

          {/* 1. STRATEGY SELECTION & DYNAMIC PARAMS */}
          <div className="bg-slate-950/50 p-6 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-slate-400 flex items-center">
                <Layers className="w-4 h-4 mr-2" /> Strategy Logic
              </label>
              <div className="text-xs text-emerald-400 flex items-center bg-emerald-500/10 px-2 py-1 rounded">
                <Sliders className="w-3 h-3 mr-1" /> Parameters Active
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1">
                <select
                  value={strategyId}
                  onChange={(e) => setStrategyId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none"
                >
                  <optgroup label="Preset Strategies">
                    <option value="3">Moving Average Crossover</option>
                    <option value="1">RSI Mean Reversion</option>
                  </optgroup>
                  {customStrategies.length > 0 && (
                    <optgroup label="My Custom Strategies">
                      {customStrategies.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* In-Place Parameter Overrides & Auto-Tune */}
              <div className="md:col-span-2 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {strategyId === '1' && (
                    <>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Period</label>
                        {!showRanges ? (
                          <input type="number" value={params.period || 14} onChange={(e) => setParams({ ...params, period: parseInt(e.target.value) })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                        ) : (
                          <div className="flex gap-1">
                            <input type="number" placeholder="Min" value={paramRanges.period?.min || 10} onChange={(e) => setParamRanges({ ...paramRanges, period: { ...(paramRanges.period || {}), min: parseInt(e.target.value), step: 1 } })} className="w-1/2 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-emerald-400 font-mono" />
                            <input type="number" placeholder="Max" value={paramRanges.period?.max || 30} onChange={(e) => setParamRanges({ ...paramRanges, period: { ...(paramRanges.period || {}), max: parseInt(e.target.value), step: 1 } })} className="w-1/2 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-emerald-400 font-mono" />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Oversold</label>
                        {!showRanges ? (
                          <input type="number" value={params.lower || 30} onChange={(e) => setParams({ ...params, lower: parseInt(e.target.value) })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                        ) : (
                          <div className="flex gap-1">
                            <input type="number" placeholder="Min" value={paramRanges.lower?.min || 10} onChange={(e) => setParamRanges({ ...paramRanges, lower: { ...(paramRanges.lower || {}), min: parseInt(e.target.value), step: 1 } })} className="w-1/2 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-emerald-400 font-mono" />
                            <input type="number" placeholder="Max" value={paramRanges.lower?.max || 40} onChange={(e) => setParamRanges({ ...paramRanges, lower: { ...(paramRanges.lower || {}), max: parseInt(e.target.value), step: 1 } })} className="w-1/2 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-emerald-400 font-mono" />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Overbought</label>
                        {!showRanges ? (
                          <input type="number" value={params.upper || 70} onChange={(e) => setParams({ ...params, upper: parseInt(e.target.value) })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                        ) : (
                          <div className="flex gap-1">
                            <input type="number" placeholder="Min" value={paramRanges.upper?.min || 60} onChange={(e) => setParamRanges({ ...paramRanges, upper: { ...(paramRanges.upper || {}), min: parseInt(e.target.value), step: 1 } })} className="w-1/2 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-emerald-400 font-mono" />
                            <input type="number" placeholder="Max" value={paramRanges.upper?.max || 90} onChange={(e) => setParamRanges({ ...paramRanges, upper: { ...(paramRanges.upper || {}), max: parseInt(e.target.value), step: 1 } })} className="w-1/2 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-emerald-400 font-mono" />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {strategyId === '3' && (
                    <>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Fast Period</label>
                        {!showRanges ? (
                          <input type="number" value={params.fast || 10} onChange={(e) => setParams({ ...params, fast: parseInt(e.target.value) })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                        ) : (
                          <div className="flex gap-1">
                            <input type="number" placeholder="Min" value={paramRanges.fast?.min || 5} onChange={(e) => setParamRanges({ ...paramRanges, fast: { ...(paramRanges.fast || {}), min: parseInt(e.target.value), step: 1 } })} className="w-1/2 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-emerald-400 font-mono" />
                            <input type="number" placeholder="Max" value={paramRanges.fast?.max || 50} onChange={(e) => setParamRanges({ ...paramRanges, fast: { ...(paramRanges.fast || {}), max: parseInt(e.target.value), step: 1 } })} className="w-1/2 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-emerald-400 font-mono" />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Slow Period</label>
                        {!showRanges ? (
                          <input type="number" value={params.slow || 50} onChange={(e) => setParams({ ...params, slow: parseInt(e.target.value) })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                        ) : (
                          <div className="flex gap-1">
                            <input type="number" placeholder="Min" value={paramRanges.slow?.min || 20} onChange={(e) => setParamRanges({ ...paramRanges, slow: { ...(paramRanges.slow || {}), min: parseInt(e.target.value), step: 1 } })} className="w-1/2 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-emerald-400 font-mono" />
                            <input type="number" placeholder="Max" value={paramRanges.slow?.max || 200} onChange={(e) => setParamRanges({ ...paramRanges, slow: { ...(paramRanges.slow || {}), max: parseInt(e.target.value), step: 1 } })} className="w-1/2 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-emerald-400 font-mono" />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Auto-Tune Row */}
                {(strategyId === '1' || strategyId === '3') && (
                  <div className="flex items-center gap-4 bg-slate-900/50 p-3 rounded border border-slate-800 border-dashed">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Optuna Metric</label>
                      <select
                        value={autoTuneConfig.metric}
                        onChange={(e) => setAutoTuneConfig({ ...autoTuneConfig, metric: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded text-xs px-2 py-1 text-slate-300 outline-none w-full"
                      >
                        <option value="sharpe">Sharpe Ratio</option>
                        <option value="calmar">Calmar Ratio</option>
                        <option value="total_return">Total Return</option>
                        <option value="drawdown">Min Drawdown</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Lookback</label>
                      <select
                        value={autoTuneConfig.lookbackMonths}
                        onChange={(e) => setAutoTuneConfig({ ...autoTuneConfig, lookbackMonths: parseInt(e.target.value) })}
                        className="bg-slate-950 border border-slate-800 rounded text-xs px-2 py-1 text-slate-300 outline-none w-full"
                      >
                        <option value="3">3 Months</option>
                        <option value="6">6 Months</option>
                        <option value="12">12 Months</option>
                        <option value="24">24 Months</option>
                      </select>
                    </div>
                    <button
                      onClick={handleAutoTune}
                      disabled={isAutoTuning}
                      className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold px-4 py-2 rounded border border-emerald-600/30 transition-all flex items-center h-fit mt-4"
                    >
                      {isAutoTuning ? <div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin mr-2" /> : <Sliders className="w-3 h-3 mr-2" />}
                      {showRanges ? 'Run Auto-Tune' : 'Auto-Tune'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* 2. ASSET SELECTION */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Backtest Mode</label>
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-700">
                  <button
                    onClick={() => setMode('SINGLE')}
                    className={`flex-1 py-1.5 text-sm rounded-md transition-all ${mode === 'SINGLE' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Single Symbol
                  </button>
                  <button
                    onClick={() => setMode('UNIVERSE')}
                    className={`flex-1 py-1.5 text-sm rounded-md transition-all ${mode === 'UNIVERSE' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Multi-Asset Universe
                  </button>
                </div>
              </div>

              {mode === 'SINGLE' ? (
                <div className="space-y-4">
                  {/* Segment Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Market Segment</label>
                    <select
                      value={segment}
                      onChange={(e) => {
                        setSegment(e.target.value as 'NSE_EQ' | 'NSE_SME');
                        setSelectedInstrument(null);
                        setSymbol('');
                        setSymbolSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                    >
                      <option value="NSE_EQ">NSE Mainboard</option>
                      <option value="NSE_SME">NSE SME</option>
                    </select>
                  </div>

                  {/* Symbol Search */}
                  <div className="relative z-50">
                    <div className="flex justify-between mb-2">
                      <label className="block text-sm font-medium text-slate-400">Symbol Search</label>
                      {selectedInstrument ? (
                        <span className="text-xs text-emerald-400">
                          {selectedInstrument.display_name} (ID: {selectedInstrument.security_id})
                        </span>
                      ) : (
                        <span className="text-xs text-yellow-500">
                          Type 2+ chars and click a result
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={symbolSearchQuery}
                        onChange={(e) => {
                          setSymbolSearchQuery(e.target.value);
                          if (selectedInstrument) {
                            // Clear selection when user starts typing again
                            setSelectedInstrument(null);
                            setSymbol('');
                          }
                        }}
                        placeholder={`Search ${segment === 'NSE_EQ' ? 'Mainboard' : 'SME'} stocks...`}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                      {isSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>

                    {/* Search Results Dropdown */}
                    {searchResults.length > 0 && !selectedInstrument && (
                      <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg max-h-60 overflow-y-auto shadow-xl">
                        {searchResults.map((result) => (
                          <button
                            key={result.security_id}
                            onClick={() => {
                              setSelectedInstrument(result);
                              setSymbol(result.symbol);
                              setSymbolSearchQuery(`${result.symbol} - ${result.display_name}`);
                              setSearchResults([]);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-medium text-slate-200">{result.symbol}</span>
                              <span className="text-xs text-slate-500">{result.instrument_type}</span>
                            </div>
                            <div className="text-xs text-slate-400 truncate">{result.display_name}</div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* No results message */}
                    {symbolSearchQuery.length >= 2 && !isSearching && searchResults.length === 0 && !selectedInstrument && (
                      <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-400">
                        No results found. Try a different search term.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                    <Database className="w-4 h-4 mr-2 text-indigo-400" /> Universe
                  </label>
                  <select
                    value={universe}
                    onChange={(e) => setUniverse(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    {UNIVERSES && UNIVERSES.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                  <Clock className="w-4 h-4 mr-2" /> Timeframe
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.values(Timeframe).map(tf => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`py-2 rounded-lg text-sm font-medium border transition-colors ${timeframe === tf ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. DATES, LOAD DATA & SPLITTER */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center justify-between">
                  <div className="flex items-center"><Calendar className="w-4 h-4 mr-2" /> Date Range & Data</div>
                  {dataStatus === 'READY' && <span className="text-xs text-emerald-400 font-mono">DATA LOCKED</span>}
                </label>
                <div className="flex space-x-2 mb-3">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
                  <span className="text-slate-600 self-center">-</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
                </div>

                {/* Improvement 1: Load Market Data Button */}
                <Button
                  variant="secondary"
                  className={`w-full justify-center ${dataStatus === 'READY' ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-400' : ''}`}
                  onClick={handleLoadData}
                  disabled={dataStatus === 'LOADING'}
                  icon={dataStatus === 'LOADING' ? <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div> : <Database className="w-4 h-4" />}
                >
                  {dataStatus === 'LOADING' ? 'Validating Data...' : dataStatus === 'READY' ? 'Data Loaded & Validated' : 'Load Market Data'}
                </Button>
              </div>

              {/* Improvement 2: Data Health Report Card */}
              {dataStatus === 'READY' && healthReport && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Health Report</h4>
                    {renderHealthBadge(healthReport.status)}
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <div className="flex justify-between pr-2 border-r border-slate-800">
                      <span className="text-slate-500">Quality Score</span>
                      <span className={`font-mono font-bold ${healthReport.score > 90 ? 'text-emerald-400' : 'text-yellow-400'}`}>{healthReport.score}%</span>
                    </div>
                    <div className="flex justify-between pl-2">
                      <span className="text-slate-500">Total Candles</span>
                      <span className="font-mono text-slate-200">{healthReport.totalCandles}</span>
                    </div>
                    <div className="flex justify-between pr-2 border-r border-slate-800">
                      <span className="text-slate-500">Missing</span>
                      <span className={`font-mono ${healthReport.missingCandles > 0 ? 'text-red-400' : 'text-slate-200'}`}>{healthReport.missingCandles}</span>
                    </div>
                    <div className="flex justify-between pl-2">
                      <span className="text-slate-500">Zero Volume</span>
                      <span className={`font-mono ${healthReport.zeroVolumeCandles > 0 ? 'text-yellow-400' : 'text-slate-200'}`}>{healthReport.zeroVolumeCandles}</span>
                    </div>
                  </div>
                  {healthReport.gaps.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-800">
                      <p className="text-xs text-red-400 flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> Gap detected near {healthReport.gaps[0]}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Visual Splitter */}
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-blue-400 font-bold">In-Sample (Train): {splitRatio}%</span>
                  <span className="text-purple-400 font-bold">Out-of-Sample (Test): {100 - splitRatio}%</span>
                </div>
                <input
                  type="range"
                  min="50" max="95" step="5"
                  value={splitRatio}
                  onChange={(e) => setSplitRatio(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 mb-2"
                />
                <div className="flex items-center justify-center text-xs text-slate-500 bg-slate-900 py-1 rounded border border-slate-800 border-dashed">
                  <Split className="w-3 h-3 mr-1" />
                  Split Date: <span className="text-slate-200 ml-1 font-mono">{splitDateString}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                  <DollarSign className="w-4 h-4 mr-2" /> Initial Capital
                </label>
                <input
                  type="number"
                  value={capital}
                  onChange={(e) => setCapital(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <div className="border-t border-slate-800 pt-4">
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center text-sm text-slate-400 hover:text-emerald-400 transition-colors">
              <Settings className="w-4 h-4 mr-2" />
              Advanced Configuration
              <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>
            {showAdvanced && (
              <div className="space-y-6 mt-4 bg-slate-950 p-6 rounded-xl border border-slate-800 animate-in fade-in slide-in-from-top-2">
                {/* Dynamic WFO Toggle */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h4 className="text-slate-200 font-bold flex items-center">
                      <Split className="w-4 h-4 mr-2 text-indigo-400" />
                      Dynamic WFO (Rolling Optimization)
                    </h4>
                    <p className="text-xs text-slate-500">Enable Walk-Forward Optimization for dynamic parameter updates.</p>
                  </div>
                  <button
                    onClick={() => setIsDynamic(!isDynamic)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${isDynamic ? 'bg-indigo-600' : 'bg-slate-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isDynamic ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Reproducible Mode Toggle */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h4 className="text-slate-200 font-bold flex items-center">
                      <Settings className="w-4 h-4 mr-2 text-indigo-400" />
                      Reproducible Mode
                    </h4>
                    <p className="text-xs text-slate-500">
                      OFF = Random exploration (production)<br />
                      ON = Fixed seed (debugging/verification)
                    </p>
                  </div>
                  <button
                    onClick={() => setReproducible(!reproducible)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${reproducible ? 'bg-indigo-600' : 'bg-slate-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${reproducible ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {isDynamic && (
                  <div className="space-y-4 animate-in fade-in zoom-in-95">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Train Window (Months)</label>
                        <input
                          type="number"
                          value={wfoConfig.trainWindow}
                          onChange={(e) => setWfoConfig({ ...wfoConfig, trainWindow: parseInt(e.target.value) })}
                          className={`w-full bg-slate-900 border rounded px-2 py-2 text-sm text-slate-200 ${
                            // Validation: Train + Test > Total
                            (() => {
                              const start = new Date(startDate);
                              const end = new Date(endDate);
                              const diffTime = Math.abs(end.getTime() - start.getTime());
                              const totalMonths = Math.round(diffTime / (1000 * 60 * 60 * 24 * 30.44));
                              return (wfoConfig.trainWindow + wfoConfig.testWindow) > totalMonths ? 'border-red-500 focus:ring-red-500' : 'border-slate-700'
                            })()
                            }`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Test Window (Months)</label>
                        <input
                          type="number"
                          value={wfoConfig.testWindow}
                          onChange={(e) => setWfoConfig({ ...wfoConfig, testWindow: parseInt(e.target.value) })}
                          className={`w-full bg-slate-900 border rounded px-2 py-2 text-sm text-slate-200 ${wfoConfig.testWindow < 1 ? 'border-yellow-500 focus:ring-yellow-500' : 'border-slate-700'
                            }`}
                        />
                      </div>
                    </div>

                    {/* Info & Validation Messages */}
                    <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
                      {(() => {
                        const start = new Date(startDate);
                        const end = new Date(endDate);
                        const diffTime = Math.abs(end.getTime() - start.getTime());
                        const totalMonths = Math.round(diffTime / (1000 * 60 * 60 * 24 * 30.44));
                        const totalWindow = wfoConfig.trainWindow + wfoConfig.testWindow;

                        // Error 1: Total window > Data
                        if (totalWindow > totalMonths) {
                          return (
                            <div className="text-xs text-red-400 flex items-start">
                              <AlertCircle className="w-3 h-3 mr-1.5 mt-0.5 flex-shrink-0" />
                              <span>
                                <strong>Configuration Error:</strong> Train ({wfoConfig.trainWindow}m) + Test ({wfoConfig.testWindow}m) exceeds available data ({totalMonths}m).
                              </span>
                            </div>
                          );
                        }

                        // Warning 1: Too few windows
                        const expectedWindows = Math.floor((totalMonths - wfoConfig.trainWindow) / wfoConfig.testWindow);
                        if (expectedWindows < 2) {
                          return (
                            <div className="text-xs text-yellow-400 flex items-start">
                              <AlertTriangle className="w-3 h-3 mr-1.5 mt-0.5 flex-shrink-0" />
                              <span>
                                <strong>Warning:</strong> Only {expectedWindows} window(s) expected. Short backtest reliability.
                              </span>
                            </div>
                          );
                        }

                        // Warning 2: Test window too small
                        if (wfoConfig.testWindow < 1) {
                          return (
                            <div className="text-xs text-yellow-400 flex items-start">
                              <AlertTriangle className="w-3 h-3 mr-1.5 mt-0.5 flex-shrink-0" />
                              <span>
                                <strong>Warning:</strong> Test window must be at least 1 month.
                              </span>
                            </div>
                          );
                        }

                        // Info Success
                        return (
                          <div className="text-xs text-slate-400 flex items-start">
                            <Info className="w-3 h-3 mr-1.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                            <span>
                              Auto-calculated base on {totalMonths} months data.<br />
                              <span className="text-emerald-400">Expected ~{Math.max(0, expectedWindows)} Walk-Forward Windows.</span>
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Slippage (%)</label>
                    <input type="number" step="0.01" value={slippage} onChange={(e) => setSlippage(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Commission (Flat ₹)</label>
                    <input type="number" value={commission} onChange={(e) => setCommission(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={handleRun}
              disabled={running || dataStatus !== 'READY'}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/40 transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center disabled:grayscale"
            >
              {running ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                  Running Simulation...
                </>
              ) : (
                <>
                  <PlayCircle className="w-6 h-6 mr-2" />
                  Start {mode === 'UNIVERSE' ? 'Multi-Asset' : ''} Simulation
                </>
              )}
            </button>
            <p className="text-center text-xs text-slate-500 mt-3 flex items-center justify-center">
              <Info className="w-3 h-3 mr-1" />
              Engine uses {100 - splitRatio}% of recent data for out-of-sample validation.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Backtest;
