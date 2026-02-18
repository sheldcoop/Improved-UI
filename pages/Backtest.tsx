
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, Calendar, DollarSign, Layers, Settings, ChevronDown, Clock, Globe, Sliders, AlertCircle, CheckCircle, Split, Info } from 'lucide-react';
import { MOCK_SYMBOLS, UNIVERSES } from '../constants'; 
import { runBacktest } from '../services/api';
import { Timeframe } from '../types';
import { Card } from '../components/ui/Card';

const Backtest: React.FC = () => {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  
  // Core Config
  const [mode, setMode] = useState<'SINGLE' | 'UNIVERSE'>('SINGLE');
  const [symbol, setSymbol] = useState(MOCK_SYMBOLS[0].symbol);
  const [universe, setUniverse] = useState(UNIVERSES[0].id);
  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.D1);
  const [strategyId, setStrategyId] = useState('1');
  
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

  // Initialize defaults based on strategy selection
  useEffect(() => {
    if (strategyId === '1') { // RSI
        setParams({ period: 14, lower: 30, upper: 70 });
    } else if (strategyId === '3') { // SMA
        setParams({ fast: 10, slow: 50 });
    } else {
        setParams({});
    }
  }, [strategyId]);

  // Calculate Split Date (Feature C Logic)
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

  // Determine Data Quality (Feature B Logic)
  const dataQuality = useMemo(() => {
      if (mode === 'UNIVERSE') return { status: 'GOOD', text: 'Synthetic Universe Data' };
      
      const asset = MOCK_SYMBOLS.find(s => s.symbol === symbol);
      if (!asset) return { status: 'UNKNOWN', text: 'Unknown Asset' };
      if (!asset.dataAvailable) return { status: 'POOR', text: 'Data Missing / Gaps' };
      
      // Simple heuristic: If timeframe is 1m but range is > 1 year, quality might degrade or be slow
      const start = new Date(startDate).getFullYear();
      const end = new Date(endDate).getFullYear();
      if (timeframe === Timeframe.M1 && (end - start) >= 2) {
          return { status: 'FAIR', text: 'High Latency (Heavy Query)' };
      }

      return { status: 'GOOD', text: 'High Quality (Clean)' };
  }, [symbol, mode, startDate, endDate, timeframe]);

  const handleRun = async () => {
    setRunning(true);
    try {
        const config: any = { 
            capital, 
            slippage, 
            commission,
            ...params, // Spread dynamic params (fast, slow, period, etc.)
            splitDate: splitDateString,
            trainTestSplit: splitRatio
        };
        
        if (mode === 'UNIVERSE') {
            config.universe = universe;
        }

        const result = await runBacktest(strategyId, mode === 'SINGLE' ? symbol : universe, config);
        
        if (result) result.timeframe = timeframe; 
        navigate('/results', { state: { result } });
    } catch (e) {
        alert("Backtest Failed: " + e);
    } finally {
        setRunning(false);
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
            
            {/* 1. STRATEGY SELECTION & DYNAMIC PARAMS (Feature A) */}
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
                        </select>
                    </div>

                    {/* In-Place Parameter Overrides */}
                    <div className="md:col-span-2 grid grid-cols-3 gap-4">
                        {strategyId === '1' && (
                            <>
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">Period</label>
                                    <input type="number" value={params.period || 14} onChange={(e) => setParams({...params, period: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">Oversold</label>
                                    <input type="number" value={params.lower || 30} onChange={(e) => setParams({...params, lower: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">Overbought</label>
                                    <input type="number" value={params.upper || 70} onChange={(e) => setParams({...params, upper: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                                </div>
                            </>
                        )}
                        {strategyId === '3' && (
                             <>
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">Fast Period</label>
                                    <input type="number" value={params.fast || 10} onChange={(e) => setParams({...params, fast: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">Slow Period</label>
                                    <input type="number" value={params.slow || 50} onChange={(e) => setParams({...params, slow: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                                </div>
                                <div className="flex items-end pb-2">
                                    <span className="text-xs text-slate-500">Cross Logic Active</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* 2. ASSET SELECTION & DATA QUALITY (Feature B) */}
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
                     <div>
                      <div className="flex justify-between mb-2">
                          <label className="block text-sm font-medium text-slate-400">Symbol</label>
                          
                          {/* Data Quality Indicator */}
                          <div className={`flex items-center text-xs font-medium ${
                              dataQuality.status === 'GOOD' ? 'text-emerald-400' : 
                              dataQuality.status === 'FAIR' ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                              {dataQuality.status === 'GOOD' ? <CheckCircle className="w-3 h-3 mr-1"/> : <AlertCircle className="w-3 h-3 mr-1"/>}
                              {dataQuality.text}
                          </div>
                      </div>
                      <select 
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                      >
                        {MOCK_SYMBOLS.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol} ({s.exchange})</option>)}
                      </select>
                    </div>
                 ) : (
                     <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                          <Globe className="w-4 h-4 mr-2 text-indigo-400" /> Universe
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

              {/* 3. DATES & IN-SAMPLE SPLITTER (Feature C) */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                     <Calendar className="w-4 h-4 mr-2" /> Date Range
                  </label>
                  <div className="flex space-x-2">
                     <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
                     <span className="text-slate-600 self-center">-</span>
                     <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
                  </div>
                </div>
                
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
                     <div className="grid grid-cols-2 gap-6 mt-4 bg-slate-950 p-4 rounded-xl border border-slate-800 animate-in fade-in slide-in-from-top-2">
                         <div>
                             <label className="text-xs text-slate-500 block mb-1">Slippage (%)</label>
                             <input type="number" step="0.01" value={slippage} onChange={(e) => setSlippage(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                         </div>
                         <div>
                             <label className="text-xs text-slate-500 block mb-1">Commission (Flat ₹)</label>
                             <input type="number" value={commission} onChange={(e) => setCommission(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" />
                         </div>
                     </div>
                 )}
            </div>

            <div className="pt-2">
               <button onClick={handleRun} disabled={running} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/40 transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
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
