import React from 'react';
import { X, Calendar, BarChart, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from './ui/Button';

interface DataLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: {
    score: number;
    status: string;
    totalCandles: number;
    missingCandles: number;
    startDate: string;
    endDate: string;
    previewRows: Array<{
      timestamp: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
    note?: string;
  };
  onAcknowledge: () => void;
}

const DataLoadModal: React.FC<DataLoadModalProps> = ({ isOpen, onClose, report, onAcknowledge }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 rounded-2xl shadow-2xl p-8 w-full max-w-2xl relative">
        <button className="absolute top-4 right-4 text-slate-400 hover:text-slate-200" onClick={onClose}>
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-xl font-bold text-slate-100 mb-2 flex items-center">
          <BarChart className="w-5 h-5 mr-2 text-emerald-400" /> Data Load Complete
        </h3>
        <p className="text-sm text-slate-400 mb-6">Integrity report for loaded data</p>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-800 rounded-xl p-4 flex flex-col items-center">
            <span className="text-3xl font-bold text-emerald-400">{report.score}%</span>
            <span className="mt-2 text-xs font-semibold text-emerald-300">{report.status}</span>
            <span className="mt-1 text-xs text-slate-400">Institutional Integrity Score</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <BarChart className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-slate-200 font-bold">{report.totalCandles.toLocaleString()}</span>
              <span className="text-xs text-slate-400">Total Candles</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-slate-200 font-bold">{report.missingCandles}</span>
              <span className="text-xs text-slate-400">Missing Candles</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-pink-400" />
              <span className="text-xs text-slate-400">{report.startDate} - {report.endDate}</span>
            </div>
          </div>
        </div>
        <div className="mb-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Recent Data Preview</h4>
          <table className="w-full text-xs text-slate-200 bg-slate-800 rounded-xl">
            <thead>
              <tr>
                <th className="py-2 px-2 text-left">Timestamp</th>
                <th className="py-2 px-2 text-left">Open</th>
                <th className="py-2 px-2 text-left">High</th>
                <th className="py-2 px-2 text-left">Low</th>
                <th className="py-2 px-2 text-left">Close</th>
                <th className="py-2 px-2 text-left">Volume</th>
              </tr>
            </thead>
            <tbody>
              {report.previewRows.map((row, idx) => (
                <tr key={idx}>
                  <td className="py-2 px-2">{row.timestamp}</td>
                  <td className="py-2 px-2">{row.open != null ? row.open.toFixed(2) : '-'}</td>
                  <td className="py-2 px-2">{row.high != null ? row.high.toFixed(2) : '-'}</td>
                  <td className="py-2 px-2">{row.low != null ? row.low.toFixed(2) : '-'}</td>
                  <td className="py-2 px-2 font-bold text-emerald-300">{row.close != null ? row.close.toFixed(2) : '-'}</td>
                  <td className="py-2 px-2">{row.volume != null ? row.volume.toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-slate-500">Last {report.previewRows.length} candles loaded</div>
        </div>
        {report.note && (
          <div className="mb-4 text-xs text-yellow-400">{report.note}</div>
        )}
        {/* Footer for modal, matching DataReportModal style */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex justify-end items-center mt-6">
          <div className="mr-auto flex items-center space-x-2 text-slate-500 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Institutional Grade Verification Passed</span>
          </div>
          <Button variant="primary" onClick={onAcknowledge} className="px-8 shadow-lg shadow-emerald-500/10">
            Acknowledge & Sync
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DataLoadModal;
