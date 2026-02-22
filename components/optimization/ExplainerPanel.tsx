import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

interface ExplainerPanelProps {
    activeTab: 'WFO' | 'GRID';
}

const WFOPanel: React.FC = () => (
    <div className="space-y-5">
        <div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">Walk-Forward Validation</h3>
            <p className="text-xs text-slate-400">
                Divides your date range into rolling{' '}
                <span className="text-indigo-400 font-medium">train → test</span> windows.
                The most rigorous way to validate a strategy.
            </p>
        </div>

        {/* Rolling window diagram */}
        <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Rolling Windows</span>
            {[0, 1, 2].map(i => (
                <div key={i} className="flex h-6 rounded overflow-hidden text-[9px] font-bold" style={{ marginLeft: `${i * 16}px` }}>
                    <div className="flex items-center justify-center bg-indigo-600/30 border border-indigo-600/50 text-indigo-300 flex-[3] px-1">
                        Train
                    </div>
                    <div className="w-px bg-slate-600" />
                    <div className="flex items-center justify-center bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 flex-1 px-1">
                        Test
                    </div>
                </div>
            ))}
        </div>

        <div className="flex items-start space-x-2 text-xs text-indigo-300 bg-indigo-900/10 border border-indigo-900/40 rounded p-3">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Out-of-sample performance across multiple periods — the gold standard for strategy validation.</span>
        </div>
    </div>
);

const GridPanel: React.FC = () => (
    <div className="space-y-5">
        <div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">Manual Optuna Search</h3>
            <p className="text-xs text-slate-400">
                Runs 30 TPE trials over your full backtest range to surface the top 10 parameter configurations.
            </p>
        </div>

        <div className="flex items-start space-x-3 bg-amber-950/40 border border-amber-700/50 rounded-lg p-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
                <p className="text-xs font-semibold text-amber-300 mb-1">Overfitting Risk</p>
                <p className="text-[11px] text-amber-400/80">
                    This method optimizes on the <em>same data</em> your backtest uses. Results look great in-sample
                    but may not generalize. Consider Walk-Forward validation for unbiased estimates.
                </p>
            </div>
        </div>

        <div className="flex items-start space-x-2 text-xs text-slate-400 bg-slate-900/50 border border-slate-800 rounded p-3">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Best for research, exploring parameter sensitivity, or when you understand the in-sample limitation.</span>
        </div>
    </div>
);

/**
 * Contextual right-panel explainer that switches between WFO and Grid descriptions.
 */
const ExplainerPanel: React.FC<ExplainerPanelProps> = ({ activeTab }) => (
    <div className="flex flex-col justify-center p-6 bg-slate-950/50 rounded-xl border border-slate-800">
        {activeTab === 'WFO' ? <WFOPanel /> : <GridPanel />}
    </div>
);

export default ExplainerPanel;
