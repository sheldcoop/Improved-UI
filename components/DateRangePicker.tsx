import React from 'react';
import { Calendar } from 'lucide-react';
import { DateInput } from './ui/DateInput';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  dataStatus?: string;
  disabled?: boolean;
}

const PRESETS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: '5Y', months: 60 },
  { label: 'YTD', isYtd: true },
];

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ startDate, endDate, setStartDate, setEndDate, dataStatus, disabled = false }) => {

  const applyPreset = (preset: typeof PRESETS[0]) => {
    if (disabled) return;

    // Use the current endDate if selected, otherwise use today as the reference point
    const referenceDate = endDate ? new Date(endDate) : new Date();

    const newStart = new Date(referenceDate);
    if (preset.isYtd) {
      newStart.setMonth(0, 1); // January 1st of the current year (from reference)
    } else if (preset.months) {
      newStart.setMonth(newStart.getMonth() - preset.months);
    }

    // Always format as YYYY-MM-DD to match the native date input expectations natively
    const endString = referenceDate.toISOString().split('T')[0];
    const startString = newStart.toISOString().split('T')[0];

    setStartDate(startString);
    if (!endDate) {
      setEndDate(endString);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-400 flex items-center">
          <Calendar className="w-4 h-4 mr-2" /> Date Range & Data
        </label>
        {dataStatus === 'READY' && <span className="text-xs text-emerald-400 font-mono">DATA LOCKED</span>}
      </div>

      <div className="flex items-center space-x-2 overflow-x-auto pb-1 hide-scrollbar">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold shrink-0 pr-1">Fast Select:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            disabled={disabled}
            className={`px-2.5 py-1 text-[10px] font-bold rounded shrink-0 transition-colors border ${disabled
              ? 'bg-slate-950 border-slate-800 text-slate-600 cursor-not-allowed opacity-60'
              : 'bg-slate-800/50 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 border-slate-700 hover:border-emerald-500/50'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex space-x-2">
        <div className="flex-1">
          <DateInput
            value={startDate}
            onChange={setStartDate}
            disabled={disabled}
            className="w-full"
            label="From Date"
          />
        </div>
        <div className="flex-1">
          <DateInput
            value={endDate}
            onChange={setEndDate}
            disabled={disabled}
            className="w-full"
            label="To Date"
          />
        </div>
      </div>
    </div>
  );
};

export default DateRangePicker;
