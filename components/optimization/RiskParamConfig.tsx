import React from 'react';
import ParamRangeRow, { ParamConfig } from './ParamRangeRow';

interface RiskParamConfigProps {
    riskParams: ParamConfig[];
    setRiskParams: (params: ParamConfig[]) => void;
}

const RISK_LABELS: Record<string, string> = {
    stopLossPct:     'Stop Loss %',
    takeProfitPct:   'Take Profit %',
    trailingStopPct: 'Trailing Stop Loss %',
};

const riskLabel = (name: string) =>
    RISK_LABELS[name] ?? name.replace(/_/g, ' ').toUpperCase();

/**
 * Phase 2 configuration section — SL/TP/TSL search ranges only.
 * Data-split control has been moved to the Backtest page (StrategyLogic).
 */
const RiskParamConfig: React.FC<RiskParamConfigProps> = ({ riskParams, setRiskParams }) => {
    const updateRisk = (id: string, field: keyof ParamConfig, value: number) =>
        setRiskParams(riskParams.map(r => r.id === id ? { ...r, [field]: value } : r));

    return (
        <div className="mt-3 space-y-3">
            {riskParams.map(param => (
                <ParamRangeRow
                    key={param.id}
                    param={param}
                    onUpdate={updateRisk}
                    label={riskLabel(param.name)}
                />
            ))}
        </div>
    );
};

export default RiskParamConfig;
