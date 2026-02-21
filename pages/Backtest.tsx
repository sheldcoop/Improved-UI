import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, Calendar, DollarSign, Layers, Settings, ChevronDown, Database, Sliders, AlertCircle, CheckCircle, Split, Info, AlertTriangle, CheckSquare, Clock, Shield, Activity, FileQuestionMark } from 'lucide-react';
import { UNIVERSES } from '../constants';
import { Timeframe, Strategy } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useBacktest } from '../hooks/useBacktest';
import { DataReportModal } from '../components/DataReportModal';
import { DateInput } from '../components/ui/DateInput';

const Backtest: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, setters, handlers } = useBacktest();

  // when navigated from optimization with autoRun flag we may need to load data
  const [autoRunRequested, setAutoRunRequested] = useState(false);
  const {
    running, mode, segment, symbol, symbolSearchQuery, searchResults, selectedInstrument,
    isSearching, universe, timeframe, strategyId, customStrategies, startDate, endDate,
    params, capital, slippage, commission, showAdvanced, dataStatus, healthReport,
    isDynamic, wfoConfig, autoTuneConfig, paramRanges, isAutoTuning, showRanges, reproducible,
    top5Trials, oosResults, isOosValidating,
    stopLossPct, takeProfitPct, useTrailingStop, pyramiding, positionSizing, positionSizeValue,
    fullReportData, isReportOpen, useLookback, lookbackMonths
  } = state;
  const {
    setMode, setSegment, setSymbolSearchQuery, setSymbol, setSearchResults, setSelectedInstrument,
    setIsSearching, setUniverse, setTimeframe, setStrategyId, setCustomStrategies, setParams,
    setStartDate, setEndDate, setCapital, setSlippage, setCommission, setShowAdvanced,
    setDataStatus, setHealthReport, setRunning, setIsDynamic, setWfoConfig, setAutoTuneConfig,
    setParamRanges, setIsAutoTuning, setShowRanges, setReproducible, setTop5Trials,
    setOosResults, setIsOosValidating,
    setStopLossPct, setTakeProfitPct, setUseTrailingStop, setPyramiding, setPositionSizing, setPositionSizeValue,
    setFullReportData, setIsReportOpen, setUseLookback, setLookbackMonths
  } = setters;
  const { handleLoadData, handleAutoTune, handleRun, handleOOSValidation } = handlers;

  // When the optimization page brings us here it may supply a parameter set
  // under ``appliedParams``.  In the old flow we also passed an ``autoRun``
  // flag which triggered an immediate simulation; the new behaviour leaves the
  // decision to the user.  We still clear the history state afterwards so a
  // page refresh doesn't reapply or rerun unexpectedly.
  useEffect(() => {
    if (!location.state) return;

    const { appliedParams, autoRun } = location.state as any;
    if (appliedParams) {
      setParams(appliedParams);
    }
    if (autoRun) {
      setAutoRunRequested(true);
    }

    if (appliedParams || autoRun) {
      navigate(location.pathname, { replace: true, state: {} as any });
    }
  }, [navigate, location.pathname, location.state, setParams]);

  // when an auto-run is requested we need to ensure market data is loaded
  // before calling handleRun.  The hook's handleRun already alerts if data
  // isn't ready, so we intercept here and trigger load instead.
  useEffect(() => {
    if (!autoRunRequested) return;

    if (dataStatus !== 'READY') {
      handleLoadData();
    } else {
      handleRun();
      setAutoRunRequested(false);
    }
  }, [autoRunRequested, dataStatus, handleLoadData, handleRun]);

  const renderHealthBadge = (status: string | undefined) => {
    switch (status) {
      case 'EXCELLENT': return <Badge variant="success" className="flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Excellent Quality</Badge>;
      case 'GOOD': return <Badge variant="info" className="flex items-center"><CheckSquare className="w-3 h-3 mr-1" /> Good Quality</Badge>;
      case 'POOR': return <Badge variant="warning" className="flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> Poor Quality</Badge>;
      case 'CRITICAL': return <Badge variant="danger" className="flex items-center"><AlertCircle className="w-3 h-3 mr-1" /> Critical Issues</Badge>;
      default:
        // unknown/empty report – render a placeholder so user knows something went wrong
        return <Badge variant="neutral" className="flex items-center"><FileQuestionMark className="w-3 h-3 mr-1" /> Unknown</Badge>;
    }
  };

  return (
    // use entire available viewport area; flex container allows internal cards to stretch if needed
    // layout already constrains width via parent `max-w-7xl`
    <div className="w-full h-full flex flex-col space-y-8">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-slate-100 mb-2">Backtest Engine</h2>
        <p className="text-slate-400">Validate strategy performance with professional-grade tools.</p>
      </div>

      <Card className="p-8 shadow-2xl shadow-black/50 border-t-4 border-t-emerald-500 flex-1 flex flex-col overflow-y-auto">
        <div className="space-y-8 flex-1 flex flex-col overflow-y-auto">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* 1. ASSET SELECTION */}
            <div className="space-y-6 bg-slate-950/50 p-6 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-medium text-slate-400 flex items-center">
                  <Database className="w-4 h-4 mr-2" /> Market Data Selection
                </label>
              </div>

              {mode === 'SINGLE' ? (
                <div className="space-y-4">
                  {/* Segment Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Market Segment</label>
                    <select
                      value={segment}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
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
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
                        {searchResults.map((result: any) => (
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
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUniverse(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    {UNIVERSES && UNIVERSES.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                  <Clock className="w-4 h-4 mr-2" /> Timeframe
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.values(Timeframe).map((tf: any) => (
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
                  <DateInput value={startDate} onChange={setStartDate} className="flex-1" />
                  <span className="text-slate-600 self-center">-</span>
                  <DateInput value={endDate} onChange={setEndDate} className="flex-1" />
                </div>

                {/* Improvement 1: Load Market Data Button */}
                <Button
                  variant="secondary"
                  className={`w-full justify-center ${dataStatus === 'READY' ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-400' : ''}`}
                  onClick={handleLoadData}
                  disabled={dataStatus === 'LOADING' || (mode === 'SINGLE' && !symbol)}
                  icon={dataStatus === 'LOADING' ? <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div> : <Database className="w-4 h-4" />}
                >
                  {dataStatus === 'LOADING' ? 'Validating Data...' :
                    dataStatus === 'READY' ? 'Data Loaded & Validated' :
                      (mode === 'SINGLE' && !symbol) ? 'Select a Symbol First' : 'Load Market Data'}
                </Button>

                {/* Lookback Toggle moved here for visibility */}
                <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-2 text-indigo-400" />
                      <span className="text-sm font-medium text-slate-300">Indicator Lookback</span>
                    </div>
                    <button
                      onClick={() => setUseLookback(!useLookback)}
                      className={`w-10 h-5 rounded-full p-1 transition-colors ${useLookback ? 'bg-emerald-600' : 'bg-slate-700'}`}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white transition-transform ${useLookback ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>

                  {useLookback ? (
                    <div className="flex items-center space-x-3 mt-2 animate-in fade-in slide-in-from-top-1">
                      <span className="text-xs text-slate-500 whitespace-nowrap">Duration (months):</span>
                      <input
                        type="number"
                        min="1"
                        max="36"
                        value={lookbackMonths}
                        onChange={(e) => setLookbackMonths(parseInt(e.target.value) || 1)}
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 text-center focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                      <span className="text-[10px] text-slate-500 italic">Recommended: 12m</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 italic">
                      Strategy starts exactly on your start date (stabilization not guaranteed).
                    </p>
                  )}
                </div>
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
                  {healthReport.note && (
                    <div className="mt-2 pt-2 border-t border-slate-800">
                      <p className="text-xs text-yellow-400">{healthReport.note}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2">
                <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                  <DollarSign className="w-4 h-4 mr-2" /> Initial Capital
                </label>
                <input
                  type="number"
                  value={capital}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCapital(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3. STRATEGY SELECTION & DYNAMIC PARAMS */}
          <div className="bg-slate-950/50 p-6 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-slate-400 flex items-center">
                <Layers className="w-4 h-4 mr-2" /> Strategy Logic
              </label>
              {dataStatus !== 'READY' && (
                <div className="text-xs text-yellow-500 flex items-center bg-yellow-500/10 px-2 py-1 rounded">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Pending Data
                </div>
              )}
            </div>

            {/* make the selector noticeably wider than the parameter inputs and give params a little breathing room */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-2">
                <select
                  value={strategyId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStrategyId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none"
                  disabled={dataStatus !== 'READY'}
                >
                  <optgroup label="Preset Strategies">
                    <option value="3">Moving Average Crossover</option>
                    <option value="1">RSI Mean Reversion</option>
                  </optgroup>
                  {customStrategies.length > 0 && (
                    <optgroup label="My Custom Strategies">
                      {customStrategies.map((s: Strategy) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* In-Place Parameter Overrides & Auto-Tune */}
              <div className={`md:col-span-2 space-y-4 ${dataStatus !== 'READY' ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {customStrategies.find((s: Strategy) => s.id === strategyId)?.params?.map((param: any) => (
                    <div key={param.name}>
                      <label className="text-xs text-slate-500 block mb-1">
                        {param.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </label>
                      <input
                        type="number"
                        step={param.type === 'float' ? '0.1' : '1'}
                        value={params[param.name] ?? param.default}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams({ ...params, [param.name]: param.type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200"
                      />
                    </div>
                  ))}
                </div>

                {/* Tune Parameters Button */}
                {(customStrategies.find((s: Strategy) => s.id === strategyId)?.params?.length ?? 0) > 0 && (
                  <div className={`flex items-center gap-4 bg-slate-900/50 p-3 rounded border border-slate-800 border-dashed transition-opacity`}>
                    <div className="flex-1">
                      <p className="text-[11px] text-slate-400">Not sure what parameters to use? Use the Optimizer to scientifically search for the best values.</p>
                    </div>
                    <button
                      onClick={() => navigate('/optimization')}
                      disabled={dataStatus !== 'READY'}
                      className={`bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-xs font-bold px-4 py-2 rounded border border-indigo-600/30 transition-all flex items-center h-fit shrink-0 ${dataStatus !== 'READY' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Sliders className="w-3 h-3 mr-2" />
                      {dataStatus !== 'READY' ? 'Load Data First' : 'Tune Parameters'}
                    </button>
                  </div>
                )}
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
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${reproducible ? 'translate-x-6' : ''}`} />
                  </button>
                </div>


                {/* Risk Management & Execution */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4 border-b border-slate-800">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center">
                      <Shield className="w-3 h-3 mr-1" /> Risk Management
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Stop Loss %</label>
                        <input type="number" step="0.1" value={stopLossPct} onChange={e => setStopLossPct(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Take Profit %</label>
                        <input type="number" step="0.1" value={takeProfitPct} onChange={e => setTakeProfitPct(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <label className="flex items-center space-x-2 text-[10px] text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={useTrailingStop} onChange={e => setUseTrailingStop(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500" />
                      <span>Use Trailing Stop</span>
                    </label>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center">
                      <Activity className="w-3 h-3 mr-1" /> Execution & Sizing
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Sizing Mode</label>
                        <select value={positionSizing} onChange={e => setPositionSizing(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500">
                          <option value="Fixed Capital">Fixed Capital</option>
                          <option value="Fixed Percent">Fixed Percent</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Sizing Value</label>
                        <input type="number" value={positionSizeValue} onChange={e => setPositionSizeValue(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Pyramiding (Max Entries)</label>
                      <input type="number" min="1" max="10" value={pyramiding} onChange={e => setPyramiding(parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 space-y-4">
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
          </div>
        </div>
      </Card>

      <DataReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        report={fullReportData}
      />
    </div>
  );
};

export default Backtest;
