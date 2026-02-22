import React from 'react';
import { Activity } from 'lucide-react';

interface AdvancedSettingsProps {
  positionSizing: string;
  setPositionSizing: (val: string) => void;
  positionSizeValue: number;
  setPositionSizeValue: (val: number) => void;
  pyramiding: number;
  setPyramiding: (val: number) => void;
  showAdvanced: boolean;
  setShowAdvanced: (val: boolean) => void;
}

const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
  positionSizing,
  setPositionSizing,
  positionSizeValue,
  setPositionSizeValue,
  pyramiding,
  setPyramiding,
  showAdvanced,
  setShowAdvanced,
}) => (
  <div className="border-t border-slate-800 pt-4">
    <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center text-sm text-slate-400 hover:text-emerald-400 transition-colors">
      <Activity className="w-4 h-4 mr-2" />
      Advanced Configuration
      <span className={`w-4 h-4 ml-2 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
    </button>
    {showAdvanced && (
      <div className="space-y-6 mt-4 bg-slate-950 p-6 rounded-xl border border-slate-800 animate-in fade-in slide-in-from-top-2">
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
    )}
  </div>
);

export default AdvancedSettings;
