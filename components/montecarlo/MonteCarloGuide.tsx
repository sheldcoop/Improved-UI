import React, { useState } from 'react';
import { BookOpen, Activity, Play, ChevronDown, ChevronRight, Shuffle, AlertTriangle } from 'lucide-react';

const Step: React.FC<{ num: number; title: string; children: React.ReactNode }> = ({ num, title, children }) => (
    <div className="flex gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-900/60 border border-emerald-700 text-emerald-400 text-xs font-bold flex items-center justify-center mt-0.5">
            {num}
        </div>
        <div>
            <div className="text-sm font-semibold text-slate-200 mb-1">{title}</div>
            <div className="text-xs text-slate-400 leading-relaxed">{children}</div>
        </div>
    </div>
);

const Callout: React.FC<{ type?: 'tip' | 'info' | 'warn'; children: React.ReactNode }> = ({ type = 'info', children }) => {
    const styles = {
        tip: 'bg-emerald-900/20 border-emerald-800 text-emerald-300',
        info: 'bg-blue-900/20 border-blue-800 text-blue-300',
        warn: 'bg-amber-900/20 border-amber-800 text-amber-300',
    };
    const labels = { tip: 'Tip', info: 'Note', warn: 'Important' };
    return (
        <div className={`border rounded-lg px-3 py-2 text-xs leading-relaxed ${styles[type]}`}>
            <span className="font-bold uppercase tracking-wide mr-2">{labels[type]}:</span>
            {children}
        </div>
    );
};

const CollapsibleSection: React.FC<{ title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }> = ({
    title, icon, defaultOpen = false, children,
}) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border border-slate-800 rounded-xl overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 hover:bg-slate-800 transition-colors"
            >
                <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                    {icon}
                    {title}
                </div>
                {open ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            </button>
            {open && <div className="px-4 py-4 bg-slate-900/50 space-y-4">{children}</div>}
        </div>
    );
};

export const MonteCarloGuide: React.FC = () => {
    return (
        <div className="space-y-4 max-w-4xl">
            {/* Header */}
            <div className="flex items-center gap-3 pb-2 border-b border-slate-800">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <div>
                    <h2 className="text-base font-bold text-slate-100">How to use Monte Carlo Simulation</h2>
                    <p className="text-xs text-slate-500">Learn how to stress-test your strategies and measure sequence-of-returns risk</p>
                </div>
            </div>

            {/* ── GBM MODE ──────────────────────────────────────────── */}
            <CollapsibleSection
                title="Price Path Mode (GBM)"
                icon={<Activity className="w-4 h-4 text-emerald-400" />}
                defaultOpen
            >
                <p className="text-xs text-slate-400 leading-relaxed">
                    Price Path mode generates future equity curves by simulating the random daily price variations of the underlying asset.
                    It fetches real historical market data to calculate typical returns and volatility, then projects thousands of possible futures 252 trading days ahead.
                </p>

                <div className="space-y-3">
                    <Step num={1} title="Select a Symbol">
                        Choose the primary asset for your strategy (e.g. <code className="text-slate-300">NIFTY 50</code>, <code className="text-slate-300">RELIANCE</code>).
                        The backend calls the Dhan API to fetch real historical data for this symbol to baseline the simulation.
                    </Step>

                    <Step num={2} title="Baseline Metrics">
                        The engine automatically calculates the <strong>mean daily return (µ)</strong> and <strong>daily volatility (σ)</strong> from the historical data.
                        If the Dhan API is unreachable, it seamlessly falls back to standard market defaults (µ=0.0005, σ=0.015).
                    </Step>

                    <Step num={3} title="Apply Volatility Stress">
                        Use the slider to stress-test your strategy against different market regimes:
                        <ul className="mt-1 space-y-1 list-disc list-inside text-slate-500">
                            <li><span className="text-slate-300">1.0×</span> — Normal regime matching historical volatility.</li>
                            <li><span className="text-amber-300">1.5×</span> — High volatility environment (e.g. market corrections).</li>
                            <li><span className="text-red-400">2.0×+</span> — Extreme stress (e.g. financial crises / crash periods).</li>
                        </ul>
                    </Step>
                </div>

                <Callout type="tip">
                    Even basic trend strategies may look good at 1.0× volatility. A robust institutional strategy should survive at least a 1.5× stress multiplier without hitting the Ruin threshold.
                </Callout>
            </CollapsibleSection>

            {/* ── TRADE SEQUENCE MODE ─────────────────────────────────────────────── */}
            <CollapsibleSection
                title="Trade Sequence Mode"
                icon={<Shuffle className="w-4 h-4 text-indigo-400" />}
            >
                <p className="text-xs text-slate-400 leading-relaxed">
                    Trade Sequence mode takes the <strong>actual trade returns</strong> from your backtest and randomly shuffles their order thousands of times.
                    This answers the critical question: <em>"What if I hit my worst losing streak right at the beginning?"</em>
                </p>

                <div className="space-y-3">
                    <Step num={1} title="Run a Backtest First">
                        This mode requires actual trades. Go to the <strong>Strategy Builder</strong>, run your backtest, and head to the <strong>Results</strong> page.
                    </Step>

                    <Step num={2} title="Load the Trades">
                        On the Results page, click the <strong>Monte Carlo</strong> button. Your actual trades will automatically load into the risk analyser.
                    </Step>

                    <Step num={3} title="Measure Sequence Risk">
                        The simulation <em>bootstraps</em> the sequence of your P&L returns. If your backtest had an average win rate but clustered wins together,
                        the Trade Sequence Monte Carlo will reveal if the strategy blows up when losses inevitably cluster instead.
                    </Step>
                </div>

                <Callout type="warn">
                    If your baseline backtest curve looks fantastic but your Trade Sequence CVaR is very bad, your strategy relies too much on a lucky sequence of winning trades. You may need stricter Stop Losses or position sizing.
                </Callout>
            </CollapsibleSection>

            {/* ── READING CONFIDENCE BANDS ─────────────────────────────────────────────── */}
            <CollapsibleSection
                title="Reading the Results"
                icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
            >
                <div className="space-y-2 mb-4 text-xs font-mono bg-slate-950 border border-slate-800 p-3 rounded-lg">
                    <div className="flex justify-between border-b border-slate-800 pb-1 text-slate-400">
                        <span>Outer Band (P5-P95)</span>
                        <span>90% of all paths land inside this zone.</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1 pt-1 text-emerald-400/70">
                        <span>Inner Band (P25-P75)</span>
                        <span>The most likely 50% core outcomes.</span>
                    </div>
                    <div className="flex justify-between pt-1 text-emerald-400 font-bold">
                        <span>Median Line (P50)</span>
                        <span>The exact middle outcome. Expected return.</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <Step num={1} title="Value at Risk (VaR 95%)">
                        Indicates the worst-case loss scenario at a 95% confidence level.
                        E.g. "-15%" means there is only a 5% chance your portfolio drops more than 15%.
                    </Step>

                    <Step num={2} title="Conditional VaR (CVaR 95%)">
                        Also known as Expected Shortfall. It averages the worst 5% of outcomes.
                        If things go wrong (you enter the bottom 5%), CVaR tells you <em>how bad</em> the bloodbath gets.
                    </Step>

                    <Step num={3} title="Ruin Probability">
                        The percentage of simulated paths where portfolio drawdown exceeds 50%.
                        Institutional trading desks generally reject any strategy with a Ruin Probability higher than 1-2%.
                    </Step>
                </div>
            </CollapsibleSection>

            {/* ── RECOMMENDED WORKFLOW ───────────────────────────────────────────── */}
            <CollapsibleSection
                title="Recommended Workflow"
                icon={<Play className="w-4 h-4 text-emerald-400" />}
            >
                <div className="space-y-3">
                    <Step num={1} title="Verify the Base Logic">
                        Build your strategy in the Visual Builder or Python Code, and hit <strong>Run Strategy</strong> to verify the base
                        logic works and is profitable over historical data.
                    </Step>
                    <Step num={2} title="Bootstrap the Trades">
                        From the Results page, click <strong>Monte Carlo</strong> to load the Trade Sequence mode.
                        Verify your CVaR and Ruin Probability remain low even if trade order is randomized.
                    </Step>
                    <Step num={3} title="Stress Test the Market Regime (GBM)">
                        Switch to Price Path (GBM) mode. Increase Volatility Stress to 1.5×, then 2.0×.
                        Ensure the strategy doesn't collapse entirely under chaotic market environments.
                    </Step>
                    <Step num={4} title="Tune Stop Losses">
                        If Ruin Probability creeps up under stress, dial back your Position Sizing in the Strategy Builder or tighten your Stop Loss %, and run the process again.
                    </Step>
                </div>
            </CollapsibleSection>
        </div>
    );
};
