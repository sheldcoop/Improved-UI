import React from 'react';
import { GitBranch, Sliders } from 'lucide-react';

interface WorkflowToggleProps {
    activeTab: 'WFO' | 'GRID';
    setActiveTab: (tab: 'WFO' | 'GRID') => void;
}

/**
 * WFO / Manual Optuna workflow selector.
 * Displayed as two large option cards inside the Setup step.
 */
const WorkflowToggle: React.FC<WorkflowToggleProps> = ({ activeTab, setActiveTab }) => {
    return (
        <div className="grid grid-cols-2 gap-2">
            <button
                onClick={() => setActiveTab('WFO')}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-xs font-semibold transition-all ${
                    activeTab === 'WFO'
                        ? 'bg-indigo-600/20 border-indigo-600/50 text-indigo-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
            >
                <GitBranch className="w-4 h-4" />
                Walk-Forward
                <span className="text-[10px] font-normal opacity-70">Rolling train/test</span>
            </button>

            <button
                onClick={() => setActiveTab('GRID')}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-xs font-semibold transition-all ${
                    activeTab === 'GRID'
                        ? 'bg-slate-700 border-slate-600 text-slate-100'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
            >
                <Sliders className="w-4 h-4" />
                Manual Optuna
                <span className="text-[10px] font-normal opacity-70">TPE 30 trials</span>
            </button>
        </div>
    );
};

export default WorkflowToggle;
