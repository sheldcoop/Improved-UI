import React, { useState } from 'react';
import { AlertTriangle, X, CheckCircle, Info } from 'lucide-react';

import { Alert } from '../../types';

interface AlertBannerProps {
    alerts: Alert[];
}

const AlertBanner: React.FC<AlertBannerProps> = ({ alerts }) => {
    const [isVisible, setIsVisible] = useState(true);

    if (!alerts || alerts.length === 0 || !isVisible) return null;

    const hasWarnings = alerts.some(a => a.type === 'warning' || a.type === 'error');
    const allSuccess = alerts.every(a => a.type === 'success');

    return (
        <div className={`mb-6 rounded-lg border p-4 shadow-lg animate-in fade-in slide-in-from-top-4 duration-500 ${hasWarnings
            ? 'bg-yellow-900/20 border-yellow-500/30 text-yellow-200'
            : allSuccess
                ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-200'
                : 'bg-blue-900/20 border-blue-500/30 text-blue-200'
            }`}>
            <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                    <div className="mt-0.5">
                        {hasWarnings ? (
                            <AlertTriangle className="w-5 h-5 text-yellow-500" />
                        ) : allSuccess ? (
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                        ) : (
                            <Info className="w-5 h-5 text-blue-500" />
                        )}
                    </div>
                    <div>
                        <h3 className="font-bold text-sm mb-1">
                            {hasWarnings ? 'Strategy Diagnostics' : 'System Checks'}
                        </h3>
                        <ul className="space-y-1">
                            {alerts.map((alert, idx) => (
                                <li key={idx} className="text-xs flex items-center space-x-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${alert.type === 'warning' ? 'bg-yellow-500' :
                                        alert.type === 'success' ? 'bg-emerald-500' :
                                            alert.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                                        }`} />
                                    <span>{alert.msg}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <button
                    onClick={() => setIsVisible(false)}
                    className="text-slate-400 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default AlertBanner;
