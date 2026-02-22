import React from 'react';
import { Layers, Sliders, AlertTriangle } from 'lucide-react';
import { Strategy } from '../types';

interface StrategyLogicProps {
  strategyId: string;
  setStrategyId: (id: string) => void;
  customStrategies: Strategy[];
  params: Record<string, any>;
  setParams: (params: Record<string, any>) => void;
  stopLossEnabled: boolean;
  setStopLossEnabled: (enabled: boolean) => void;
  stopLossPct: number;
  setStopLossPct: (pct: number) => void;
  useTrailingStop: boolean;
  setUseTrailingStop: (enabled: boolean) => void;
  takeProfitEnabled: boolean;
  setTakeProfitEnabled: (enabled: boolean) => void;
  takeProfitPct: number;
  setTakeProfitPct: (pct: number) => void;
  dataStatus: string;
  navigate: (path: string) => void;
}

const StrategyLogic: React.FC<StrategyLogicProps> = ({
  strategyId,
  setStrategyId,
  customStrategies,
  params,
  setParams,
  stopLossEnabled,
  setStopLossEnabled,
  stopLossPct,
  setStopLossPct,
  useTrailingStop,
  setUseTrailingStop,
  takeProfitEnabled,
  setTakeProfitEnabled,
  takeProfitPct,
  setTakeProfitPct,
  dataStatus,
  navigate,
}) => {
  return (
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-2">
          <select
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value)}
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
                  onChange={(e) => setParams({ ...params, [param.name]: param.type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200"
                />
              </div>
            ))}
            <div className={`space-y-2 ${stopLossEnabled ? 'p-2 bg-slate-900/60 rounded-lg border border-slate-700/60' : ''}`}>
              <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stopLossEnabled}
                  onChange={e => {
                    setStopLossEnabled(e.target.checked);
                    if (!e.target.checked) { setStopLossPct(0); setUseTrailingStop(false); }
                  }}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                />
                <span>Stop Loss %</span>
              </label>
              {stopLossEnabled && (
                <>
                  <input
                    type="number" min="0.1" step="0.1"
                    value={stopLossPct || 2}
                    onChange={(e) => setStopLossPct(parseFloat(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200"
                  />
                  <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer pt-1 border-t border-slate-700/50">
                    <input
                      type="checkbox"
                      checked={useTrailingStop}
                      onChange={e => setUseTrailingStop(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Trailing Stop</span>
                  </label>
                </>
              )}
            </div>
            <div>
              <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer mb-1">
                <input
                  type="checkbox"
                  checked={takeProfitEnabled}
                  onChange={e => {
                    setTakeProfitEnabled(e.target.checked);
                    if (!e.target.checked) setTakeProfitPct(0);
                  }}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                />
                <span>Take Profit %</span>
              </label>
              {takeProfitEnabled && (
                <input
                  type="number" min="0.1" step="0.1"
                  value={takeProfitPct || 2}
                  onChange={(e) => setTakeProfitPct(parseFloat(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200"
                />
              )}
            </div>
          </div>
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
  );
};

export default StrategyLogic;
