import React from 'react';
import { Calendar } from 'lucide-react';
import { DateInput } from './ui/DateInput';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  dataStatus?: string;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({ startDate, endDate, setStartDate, setEndDate, dataStatus }) => (
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
  </div>
);

export default DateRangePicker;
