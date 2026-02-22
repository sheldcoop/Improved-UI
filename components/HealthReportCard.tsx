import React from 'react';
import { Badge } from './ui/Badge';
import { CheckCircle, CheckSquare, AlertTriangle, AlertCircle, FileQuestionMark } from 'lucide-react';

interface HealthReportCardProps {
  healthReport: {
    score: number;
    status: string;
    totalCandles: number;
    missingCandles: number;
    zeroVolumeCandles: number;
    gaps: string[];
    note?: string;
  };
}

const renderHealthBadge = (status: string | undefined) => {
  switch (status) {
    case 'EXCELLENT': return <Badge variant="success" className="flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Excellent Quality</Badge>;
    case 'GOOD': return <Badge variant="info" className="flex items-center"><CheckSquare className="w-3 h-3 mr-1" /> Good Quality</Badge>;
    case 'POOR': return <Badge variant="warning" className="flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> Poor Quality</Badge>;
    case 'CRITICAL': return <Badge variant="danger" className="flex items-center"><AlertCircle className="w-3 h-3 mr-1" /> Critical Issues</Badge>;
    default:
      return <Badge variant="neutral" className="flex items-center"><FileQuestionMark className="w-3 h-3 mr-1" /> Unknown</Badge>;
  }
};

const HealthReportCard: React.FC<HealthReportCardProps> = ({ healthReport }) => {
  if (!healthReport) return null;
  return (
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
  );
};

export default HealthReportCard;
