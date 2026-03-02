import React, { useState } from 'react';
import { Filter, Code, Zap, Activity, ChevronDown, ChevronRight, Cpu, BookOpen } from 'lucide-react';

interface Section {
    title: string;
    content: React.ReactNode;
}

const CodeBlock: React.FC<{ code: string }> = ({ code }) => (
    <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs text-emerald-300 font-mono leading-relaxed overflow-x-auto whitespace-pre">
        {code}
    </pre>
);

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

export const StrategyGuide: React.FC = () => {
    return (
        <div className="space-y-4 max-w-4xl">
            {/* Header */}
            <div className="flex items-center gap-3 pb-2 border-b border-slate-800">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <div>
                    <h2 className="text-base font-bold text-slate-100">How to Build a Strategy</h2>
                    <p className="text-xs text-slate-500">Learn how to use the Visual Builder and Python Code mode</p>
                </div>
            </div>

            {/* ── VISUAL BUILDER ──────────────────────────────────────────── */}
            <CollapsibleSection
                title="Visual Builder"
                icon={<Filter className="w-4 h-4 text-emerald-400" />}
                defaultOpen
            >
                <p className="text-xs text-slate-400 leading-relaxed">
                    The Visual Builder lets you create a strategy by connecting conditions with AND / OR logic — no code needed.
                    You define two rule trees: <span className="text-emerald-400 font-medium">Entry Conditions</span> (when to buy)
                    and <span className="text-red-400 font-medium">Exit Conditions</span> (when to sell).
                </p>

                <div className="space-y-3">
                    <Step num={1} title="Add an Entry Condition">
                        Click <span className="text-emerald-400 font-mono">+ Add Rule</span> under <strong>ENTRY CONDITIONS</strong>.
                        Each rule has three parts:
                        <ul className="mt-1 space-y-1 list-disc list-inside text-slate-500">
                            <li><span className="text-slate-300">Left side</span> — choose an indicator (RSI, EMA, Close Price, etc.) and its period</li>
                            <li><span className="text-slate-300">Operator</span> — how to compare: {'>'}, {'<'}, Crosses Above, Crosses Below, or {'='}</li>
                            <li><span className="text-slate-300">Right side</span> — either a fixed number (Static) or another indicator</li>
                        </ul>
                    </Step>

                    <Step num={2} title="Combine conditions with AND / OR">
                        By default all conditions in a group use <span className="text-amber-400 font-bold">AND</span> logic — every
                        condition must be true at the same time for a signal to fire. Click the AND/OR toggle to switch a group to
                        <span className="text-purple-400 font-bold"> OR</span> (any one condition is enough).
                    </Step>

                    <Step num={3} title="Nest Groups for complex logic">
                        Click <span className="text-slate-300 font-mono">+ Add Group</span> to create a nested group.
                        This lets you express logic like: <em>"(RSI &lt; 30 AND price &gt; SMA 200) OR (MACD crosses above Signal)"</em>.
                    </Step>

                    <Step num={4} title="Set Exit Conditions (optional)">
                        Under <strong>EXIT CONDITIONS</strong>, add when to close the trade.
                        If you leave Exit empty the backtest will only close trades via Stop Loss or Take Profit from the Risk settings.
                    </Step>

                    <Step num={5} title="Use Multi-Timeframe (MTF)">
                        Each condition can use a different timeframe. For example, keep your main timeframe at <code className="text-slate-300">5m</code>
                        but set the SMA 200 indicator to use <code className="text-slate-300">1d</code> — the daily trend filter.
                    </Step>
                </div>

                {/* Example */}
                <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Example: RSI Oversold Bounce</div>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 text-xs font-mono">
                        <div className="text-emerald-400 font-bold">ENTRY — AND</div>
                        <div className="ml-4 text-slate-300">
                            RSI(14) <span className="text-amber-400">&lt;</span> <span className="text-blue-300">30</span>
                        </div>
                        <div className="ml-4 text-slate-300">
                            Close Price <span className="text-amber-400">&gt;</span> EMA(200)
                        </div>
                        <div className="text-red-400 font-bold mt-2">EXIT — OR</div>
                        <div className="ml-4 text-slate-300">
                            RSI(14) <span className="text-amber-400">&gt;</span> <span className="text-blue-300">65</span>
                        </div>
                        <div className="ml-4 text-slate-300">
                            Close Price <span className="text-amber-400">Crosses Below</span> EMA(20)
                        </div>
                    </div>
                </div>

                <Callout type="tip">
                    Check the <strong>Logic Summary</strong> panel at the bottom — it shows a plain-English translation of your
                    conditions so you can verify the logic matches what you intended before running.
                </Callout>

                {/* Available indicators */}
                <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Available Indicators</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                        {[
                            ['RSI', 'Relative Strength Index'],
                            ['SMA', 'Simple Moving Average'],
                            ['EMA', 'Exponential Moving Average'],
                            ['MACD', 'MACD line'],
                            ['MACD Signal', 'MACD signal line'],
                            ['Bollinger Upper/Mid/Lower', 'Bollinger Bands'],
                            ['ATR', 'Average True Range'],
                            ['Close / Open / High / Low', 'Raw OHLC price'],
                            ['Volume', 'Trading volume'],
                        ].map(([name, desc]) => (
                            <div key={name} className="flex gap-2">
                                <span className="text-emerald-400 font-mono shrink-0">{name}</span>
                                <span className="text-slate-500">{desc}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </CollapsibleSection>

            {/* ── PYTHON CODE ─────────────────────────────────────────────── */}
            <CollapsibleSection
                title="Python Code Mode"
                icon={<Code className="w-4 h-4 text-blue-400" />}
            >
                <p className="text-xs text-slate-400 leading-relaxed">
                    Python Code mode lets you write custom signal logic using full Python.
                    You define a <code className="text-emerald-300 font-mono">signal_logic(df)</code> function that receives
                    OHLCV data and returns two boolean Series: entry signals and exit signals.
                </p>

                <div className="space-y-3">
                    <Step num={1} title="The function signature">
                        Your code must define exactly this function:
                        <CodeBlock code={`def signal_logic(df):
    # df is a pandas DataFrame with columns:
    #   open, high, low, close, volume
    # Returns: entries (bool Series), exits (bool Series)
    ...
    return entries, exits`} />
                    </Step>

                    <Step num={2} title="Available globals">
                        The runtime provides these pre-imported libraries:
                        <div className="mt-1 space-y-1 text-slate-500">
                            <div><code className="text-slate-300">vbt</code> — VectorBT Pro (indicators, portfolio tools)</div>
                            <div><code className="text-slate-300">np</code> — NumPy</div>
                            <div><code className="text-slate-300">pd</code> — pandas</div>
                            <div><code className="text-slate-300">talib</code> — TA-Lib (if installed)</div>
                        </div>
                    </Step>

                    <Step num={3} title="Simple example — Moving Average Crossover">
                        <CodeBlock code={`def signal_logic(df):
    # Buy when fast EMA crosses above slow EMA
    fast = vbt.MA.run(df['close'], 10, short_name='fast')
    slow = vbt.MA.run(df['close'], 50, short_name='slow')

    entries = fast.ma_crossed_above(slow.ma)
    exits   = fast.ma_crossed_below(slow.ma)
    return entries, exits`} />
                    </Step>

                    <Step num={4} title="Using RSI with VectorBT">
                        <CodeBlock code={`def signal_logic(df):
    rsi = vbt.RSI.run(df['close'], window=14)

    entries = rsi.rsi < 30   # oversold
    exits   = rsi.rsi > 65   # overbought
    return entries, exits`} />
                    </Step>

                    <Step num={5} title="Computing indicators with pandas / NumPy">
                        <CodeBlock code={`def signal_logic(df):
    close = df['close']

    # Rolling SMA using pandas
    sma20 = close.rolling(20).mean()
    sma50 = close.rolling(50).mean()

    entries = (sma20 > sma50) & (close > sma20)
    exits   = (sma20 < sma50) | (close < sma20)
    return entries.fillna(False), exits.fillna(False)`} />
                    </Step>
                </div>

                <Callout type="warn">
                    Always <code className="font-mono">.fillna(False)</code> when using <code className="font-mono">.rolling()</code>
                    or other operations that produce NaN at the start of the series — otherwise the backtest will skip those bars unexpectedly.
                </Callout>

                <Callout type="info">
                    Your code runs in a sandboxed environment. Imports of <code className="font-mono">os</code>,
                    <code className="font-mono"> subprocess</code>, file I/O, and network calls are blocked for security.
                </Callout>

                <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Common VectorBT Indicators</div>
                    <div className="grid grid-cols-1 gap-1 text-xs font-mono">
                        {[
                            'vbt.MA.run(df[\'close\'], 20)          → .ma',
                            'vbt.RSI.run(df[\'close\'], 14)         → .rsi',
                            'vbt.MACD.run(df[\'close\'])            → .macd, .signal',
                            'vbt.ATR.run(df[\'high\'], df[\'low\'], df[\'close\'], 14) → .atr',
                            'vbt.BBANDS.run(df[\'close\'], 20)      → .upper, .middle, .lower',
                        ].map(line => (
                            <div key={line} className="text-slate-400 bg-slate-950 px-2 py-1 rounded">{line}</div>
                        ))}
                    </div>
                </div>
            </CollapsibleSection>

            {/* ── AI GENERATE ─────────────────────────────────────────────── */}
            <CollapsibleSection
                title="AI Strategy Generator"
                icon={<Cpu className="w-4 h-4 text-purple-400" />}
            >
                <p className="text-xs text-slate-400 leading-relaxed">
                    Describe a strategy in plain English and the AI will build the Visual Builder rule tree for you.
                </p>

                <div className="space-y-3">
                    <Step num={1} title="Type a description in the AI bar">
                        Examples of good prompts:
                        <ul className="mt-1 space-y-1 list-disc list-inside text-slate-500">
                            <li>"Buy when RSI crosses below 30 and price is above SMA 200"</li>
                            <li>"MACD crossover strategy with ATR stop loss"</li>
                            <li>"Bollinger Band breakout — enter when close crosses above upper band"</li>
                        </ul>
                    </Step>

                    <Step num={2} title="Review and edit the generated logic">
                        After generation, the Visual Builder is updated with the AI's conditions.
                        Always review the <strong>Logic Summary</strong> to confirm the rules match your intent.
                        You can add, remove or modify any condition manually.
                    </Step>
                </div>

                <Callout type="tip">
                    AI generation sets the Visual Builder mode. You can then switch to Python Code to inspect or extend it further.
                </Callout>
            </CollapsibleSection>

            {/* ── WORKFLOW TIPS ───────────────────────────────────────────── */}
            <CollapsibleSection
                title="Recommended Workflow"
                icon={<Zap className="w-4 h-4 text-amber-400" />}
            >
                <div className="space-y-3">
                    <Step num={1} title="Start with a preset or AI">
                        Select a preset from the left panel (RSI, MACD, Bollinger Bands, etc.) to see a working example,
                        then customise the periods and thresholds.
                    </Step>
                    <Step num={2} title="Set the symbol and date range">
                        Enter the symbol in the top bar (e.g. <code className="text-slate-300">NIFTY 50</code>, <code className="text-slate-300">RELIANCE</code>).
                        Leave dates empty to use the maximum available history.
                    </Step>
                    <Step num={3} title="Watch the live signal preview">
                        The mini chart in the top bar updates live as you add conditions. Green triangles = buy signals, red triangles = sell signals.
                        Aim for a reasonable number of signals — too few means the strategy rarely trades.
                    </Step>
                    <Step num={4} title="Configure risk settings">
                        Set Stop Loss %, Take Profit %, and Position Sizing on the left panel before running.
                        These are applied in the backtest simulation.
                    </Step>
                    <Step num={5} title="Save then Run">
                        Click <strong>Save Strategy</strong> to persist your work, then <strong>Run Strategy</strong> to execute the full backtest
                        and view metrics, equity curve, monthly returns, and trade list on the Results page.
                    </Step>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-emerald-900/10 border border-emerald-900 rounded-lg p-3">
                        <div className="text-emerald-400 font-bold mb-1 flex items-center gap-1">
                            <Zap className="w-3 h-3" /> Visual Builder is best for...
                        </div>
                        <ul className="space-y-0.5 text-slate-400 list-disc list-inside">
                            <li>Indicator crossovers</li>
                            <li>Threshold conditions (RSI &lt; 30)</li>
                            <li>Multi-timeframe filters</li>
                            <li>Quick strategy prototyping</li>
                        </ul>
                    </div>
                    <div className="bg-blue-900/10 border border-blue-900 rounded-lg p-3">
                        <div className="text-blue-400 font-bold mb-1 flex items-center gap-1">
                            <Code className="w-3 h-3" /> Python Code is best for...
                        </div>
                        <ul className="space-y-0.5 text-slate-400 list-disc list-inside">
                            <li>Complex multi-step logic</li>
                            <li>Custom indicators</li>
                            <li>Statistical calculations</li>
                            <li>Pattern recognition</li>
                        </ul>
                    </div>
                </div>
            </CollapsibleSection>
        </div>
    );
};
