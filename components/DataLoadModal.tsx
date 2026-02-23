import React from 'react';
import { X, Calendar, BarChart, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from './ui/Button';

import { DataHealthReport } from '../services/marketService';

interface DataLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: DataHealthReport & {
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
          <ShieldCheck className="w-5 h-5 mr-2 text-emerald-400" /> Market Data Integrity Audit
        </h3>
        <p className="text-sm text-slate-400 mb-6 font-medium">Technical validation of dataset health</p>

        <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-lg">
                <BarChart className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-white">{report.totalCandles.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Total Dataset Size</div>
              </div>
            </div>
            <div className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-pink-400" />
              <span className="text-[10px] text-slate-400 font-mono">{report.startDate} - {report.endDate}</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="flex flex-col items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800/50 transition-colors hover:border-slate-700">
              <div className={`text-sm font-bold ${report.nullCandles > 0 ? 'text-red-400' : 'text-slate-100'}`}>{report.nullCandles}</div>
              <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">Nulls / NaNs</div>
            </div>
            <div className="flex flex-col items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800/50 transition-colors hover:border-slate-700">
              <div className={`text-sm font-bold ${report.gapCount > 0 ? 'text-red-400' : 'text-slate-100'}`}>{report.gapCount}</div>
              <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">Timeline Gaps</div>
            </div>
            <div className="flex flex-col items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800/50 transition-colors hover:border-slate-700">
              <div className={`text-sm font-bold ${report.sessionFailures > 0 ? 'text-amber-400' : 'text-slate-100'}`}>{report.sessionFailures}</div>
              <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">Session Leak</div>
            </div>
            <div className="flex flex-col items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800/50 transition-colors hover:border-slate-700">
              <div className={`text-sm font-bold ${report.spikeFailures > 0 ? 'text-amber-400' : 'text-slate-100'}`}>{report.spikeFailures}</div>
              <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">Flash Spikes</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="flex flex-col items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800/50 transition-colors hover:border-slate-700">
              <div className={`text-sm font-bold ${report.geometricFailures > 0 ? 'text-red-400' : 'text-slate-100'}`}>{report.geometricFailures}</div>
              <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">Geometry Fail</div>
            </div>
            <div className="flex flex-col items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800/50 transition-colors hover:border-slate-700">
              <div className={`text-sm font-bold ${report.zeroVolumeCandles > 0 ? 'text-amber-400' : 'text-slate-100'}`}>{report.zeroVolumeCandles}</div>
              <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">0 Volume</div>
            </div>
            <div className="flex flex-col items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800/50 transition-colors hover:border-slate-700">
              <div className={`text-sm font-bold ${report.staleFailures > 0 ? 'text-amber-400' : 'text-slate-100'}`}>{report.staleFailures}</div>
              <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">Stale Feed</div>
            </div>
          </div>
        </div>

        {/* Details List */}
        {report.details && report.details.length > 0 && (
          <div className="mb-6 bg-red-500/5 border border-red-500/10 rounded-xl p-3">
            <h4 className="text-[10px] font-bold text-red-400 uppercase mb-2">Detailed Anomalies</h4>
            <div className="flex flex-wrap gap-1">
              {report.details.map((detail, idx) => (
                <span key={idx} className="bg-red-500/10 text-red-400/80 text-[9px] px-1.5 py-0.5 rounded border border-red-500/5">
                  {detail}
                </span>
              ))}
            </div>
          </div>
        )}
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
