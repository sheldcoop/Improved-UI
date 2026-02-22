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
import DataLoadModal from '../components/DataLoadModal';
import { DateInput } from '../components/ui/DateInput';
import MarketDataSelector from '../components/MarketDataSelector';
import StrategyLogic from '../components/StrategyLogic';
import AdvancedSettings from '../components/AdvancedSettings';
import HealthReportCard from '../components/HealthReportCard';
import DateRangePicker from '../components/DateRangePicker';

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
    isDynamic, wfoConfig, paramRanges, showRanges,
    top5Trials, oosResults, isOosValidating,
    stopLossPct, stopLossEnabled, takeProfitPct, takeProfitEnabled, useTrailingStop, pyramiding, positionSizing, positionSizeValue,
    fullReportData, isReportOpen, useLookback, lookbackMonths
  } = state;
  const {
    setMode, setSegment, setSymbolSearchQuery, setSymbol, setSearchResults, setSelectedInstrument,
    setIsSearching, setUniverse, setTimeframe, setStrategyId, setCustomStrategies, setParams,
    setStartDate, setEndDate, setCapital, setSlippage, setCommission, setShowAdvanced,
    setDataStatus, setHealthReport, setRunning, setIsDynamic, setWfoConfig,
    setParamRanges, setShowRanges, setTop5Trials,
    setOosResults, setIsOosValidating,
    setStopLossPct, setStopLossEnabled, setTakeProfitPct, setTakeProfitEnabled, setUseTrailingStop, setPyramiding, setPositionSizing, setPositionSizeValue,
    setFullReportData, setIsReportOpen, setUseLookback, setLookbackMonths
  } = setters;
  const { handleLoadData, handleRun, handleOOSValidation } = handlers;

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
      // if we don't already have validated market data for this configuration,
      // trigger a load.  previously we simply checked ``dataStatus`` but that
      // would reset to IDLE after navigating away; now we also look for a
      // cached report object which persists across page changes.
      if (dataStatus !== 'READY' && !fullReportData) {
        handleLoadData();
      }
    }
    if (autoRun) {
      setAutoRunRequested(true);
    }

    if (appliedParams || autoRun) {
      navigate(location.pathname, { replace: true, state: {} as any });
    }
  }, [navigate, location.pathname, location.state, setParams, dataStatus, fullReportData, handleLoadData]);

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
            {/* 1. ASSET SELECTION (Reusable Component) */}
            <MarketDataSelector
              mode={mode}
              segment={segment}
              setSegment={setSegment}
              symbolSearchQuery={symbolSearchQuery}
              setSymbolSearchQuery={setSymbolSearchQuery}
              selectedInstrument={selectedInstrument}
              setSelectedInstrument={setSelectedInstrument}
              symbol={symbol}
              setSymbol={setSymbol}
              searchResults={searchResults}
              setSearchResults={setSearchResults}
              isSearching={isSearching}
              universe={universe}
              setUniverse={setUniverse}
              timeframe={timeframe}
              setTimeframe={setTimeframe}
            />
            {/* 3. DATES, LOAD DATA & SPLITTER */}
            <div className="space-y-6">
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                setStartDate={setStartDate}
                setEndDate={setEndDate}
                dataStatus={dataStatus}
              />
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
              {/* Improvement 2: Data Health Report Card */}
              {dataStatus === 'READY' && healthReport && (
                <HealthReportCard healthReport={healthReport} />
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
          <StrategyLogic
            strategyId={strategyId}
            setStrategyId={setStrategyId}
            customStrategies={customStrategies}
            params={params}
            setParams={setParams}
            stopLossEnabled={stopLossEnabled}
            setStopLossEnabled={setStopLossEnabled}
            stopLossPct={stopLossPct}
            setStopLossPct={setStopLossPct}
            useTrailingStop={useTrailingStop}
            setUseTrailingStop={setUseTrailingStop}
            takeProfitEnabled={takeProfitEnabled}
            setTakeProfitEnabled={setTakeProfitEnabled}
            takeProfitPct={takeProfitPct}
            setTakeProfitPct={setTakeProfitPct}
            dataStatus={dataStatus}
            navigate={navigate}
          />
          <AdvancedSettings
            positionSizing={positionSizing}
            setPositionSizing={setPositionSizing}
            positionSizeValue={positionSizeValue}
            setPositionSizeValue={setPositionSizeValue}
            pyramiding={pyramiding}
            setPyramiding={setPyramiding}
            showAdvanced={showAdvanced}
            setShowAdvanced={setShowAdvanced}
          />
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
      <DataLoadModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        report={{
          score: healthReport?.score ?? 0,
          status: healthReport?.status ?? 'Unknown',
          totalCandles: healthReport?.totalCandles ?? 0,
          missingCandles: healthReport?.missingCandles ?? 0,
          startDate: startDate,
          endDate: endDate,
          previewRows: fullReportData?.sample ?? [],
          note: healthReport?.note ?? '',
        }}
        onAcknowledge={() => {
          setIsReportOpen(false);
          // Optionally sync or trigger any other action here
        }}
      />
    </div>
  );
};

export default Backtest;
