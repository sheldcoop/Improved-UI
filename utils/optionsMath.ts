import { OptionLeg } from '../types';

/**
 * Cumulative Normal Distribution Function
 */
function CND(x: number): number {
    const a1 = 0.31938153, a2 = -0.356563782, a3 = 1.781477937, a4 = -1.821255978, a5 = 1.330274429;
    const p = 0.2316419;
    const k = 1.0 / (1 + p * Math.abs(x));
    const y = 1.0 - (((((a5 * k + a4) * k) + a3) * k + a2) * k + a1) * k * Math.exp(-x * x / 2.0) / Math.sqrt(2 * Math.PI);
    return x < 0 ? 1.0 - y : y;
}

/**
 * Calculates theoretical option price using Black-Scholes Model
 */
export const calculateBlackScholes = (
    type: 'CE' | 'PE',
    S: number,   // Spot Price
    K: number,   // Strike Price
    T: number,   // Time to Expiry (in years)
    r: number,   // Risk-free rate (decimal, e.g., 0.05)
    sigma: number // Volatility (decimal, e.g., 0.20)
): number => {
    if (T <= 0) {
        return type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
    }

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (type === 'CE') {
        return S * CND(d1) - K * Math.exp(-r * T) * CND(d2);
    } else {
        return K * Math.exp(-r * T) * CND(-d2) - S * CND(-d1);
    }
};

/**
 * Generates Payoff Data for Charts
 */
export const generatePayoffData = (
    legs: OptionLeg[],
    spotPrice: number,
    scenarioIvChange: number = 0, // Percentage points (e.g. 5 for +5%)
    scenarioDaysPassed: number = 0
) => {
    const data = [];
    const rangePercent = 0.08; // 8% range
    const minPrice = spotPrice * (1 - rangePercent);
    const maxPrice = spotPrice * (1 + rangePercent);
    const steps = 80;
    const stepSize = (maxPrice - minPrice) / steps;

    for (let price = minPrice; price <= maxPrice; price += stepSize) {
        let expiryPnl = 0;
        let t0Pnl = 0;

        legs.forEach(leg => {
            // 1. Expiry PnL (Intrinsic Value)
            let intrinsic = 0;
            if (leg.type === 'CE') {
                intrinsic = Math.max(0, price - leg.strike);
            } else {
                intrinsic = Math.max(0, leg.strike - price);
            }

            if (leg.action === 'BUY') {
                expiryPnl += (intrinsic - leg.premium);
            } else {
                expiryPnl += (leg.premium - intrinsic);
            }

            // 2. T+0 / Scenario PnL (Black Scholes)
            // Parse expiry string to get rough days remaining, then subtract scenarioDaysPassed
            // For demo, we assume the leg.expiry is approx 30 days away if not parsed
            const initialDaysToExpiry = 30; 
            const daysRemaining = Math.max(0.1, initialDaysToExpiry - scenarioDaysPassed);
            const T = daysRemaining / 365.0;
            
            // Adjust Volatility
            const currentIv = (leg.iv + scenarioIvChange) / 100.0;
            const r = 0.05; // Risk free rate

            const theoreticalPrice = calculateBlackScholes(leg.type, price, leg.strike, T, r, Math.max(0.01, currentIv));
            
            if (leg.action === 'BUY') {
                t0Pnl += (theoreticalPrice - leg.premium);
            } else {
                t0Pnl += (leg.premium - theoreticalPrice);
            }
        });

        data.push({
            price: Math.round(price),
            expiryPnl: Math.round(expiryPnl),
            t0Pnl: Math.round(t0Pnl)
        });
    }

    const maxProfit = Math.max(...data.map(d => d.expiryPnl));
    const maxLoss = Math.min(...data.map(d => d.expiryPnl));

    return { data, maxProfit, maxLoss };
};
