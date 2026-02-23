import React from 'react';
import { Badge } from './ui/Badge';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { DataHealthReport } from '../services/marketService';

interface HealthReportCardProps {
  healthReport: DataHealthReport;
}

const renderHealthBadge = (status: string | undefined) => {
  if (status === 'AUDITED') {
    return <Badge variant="success" className="flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Audit Passed</Badge>;
  }
  return <Badge variant="warning" className="flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> Anomalies Found</Badge>;
};

const HealthReportCard: React.FC<HealthReportCardProps> = ({ healthReport }) => {
  if (!healthReport) return null;

  const hasAnomalies = healthReport.nullCandles > 0 ||
    healthReport.gapCount > 0 ||
    healthReport.sessionFailures > 0 ||
    healthReport.spikeFailures > 0;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 animate-in fade-in slide-in-from-top-2 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Market Data Audit</h4>
        {renderHealthBadge(healthReport.status)}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-slate-500">Null Candles</span>
            <span className={`text-xs font-mono font-bold ${healthReport.nullCandles > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {healthReport.nullCandles}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-slate-500">Timeline Gaps</span>
            <span className={`text-xs font-mono font-bold ${healthReport.gapCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {healthReport.gapCount}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-slate-500">Session Leaks</span>
            <span className={`text-xs font-mono font-bold ${healthReport.sessionFailures > 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
              {healthReport.sessionFailures}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-slate-500">Flash Spikes</span>
            <span className={`text-xs font-mono font-bold ${healthReport.spikeFailures > 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {healthReport.spikeFailures}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-slate-500">Stale Prices</span>
            <span className={`text-xs font-mono font-bold ${healthReport.staleFailures > 0 ? 'text-orange-400' : 'text-slate-400'}`}>
              {healthReport.staleFailures}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-slate-500">Zero Volume</span>
            <span className={`text-xs font-mono font-bold ${healthReport.zeroVolumeCandles > 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
              {healthReport.zeroVolumeCandles}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-slate-900 flex justify-between items-center">
        <span className="text-[10px] text-slate-600">Total Sample: {healthReport.totalCandles} bars</span>
        {hasAnomalies && (
          <p className="text-[10px] text-red-500/80 font-medium flex items-center">
            <AlertTriangle className="w-2.5 h-2.5 mr-1" /> Tech. Risk Detected
          </p>
        )}
      </div>
    </div>
  );
};

export default HealthReportCard;
