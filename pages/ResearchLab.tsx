/**
 * ResearchLab.tsx — Quantitative Research Lab page.
 *
 * Provides institutional-grade statistical analysis on any stock
 * across 4 tabs: Statistical Profile, Seasonality, Distribution, and Advanced.
 */

import React, { useState } from 'react';
import { Microscope, Activity, Calendar, BarChart, PlayCircle, AlertCircle, Zap } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import MarketDataSelector from '../components/MarketDataSelector';
import DateRangePicker from '../components/DateRangePicker';
import StatisticalProfile from '../components/research/StatisticalProfile';
import SeasonalityPanel from '../components/research/SeasonalityPanel';
import DistributionPanel from '../components/research/DistributionPanel';
import AdvancedAnalysis from '../components/research/AdvancedAnalysis';
import { analyzeStock } from '../services/researchService';
import { useInstrumentSearch } from '../hooks/useInstrumentSearch';
import type { ResearchResponse } from '../services/researchService';

type ResearchTab = 'PROFILE' | 'SEASONALITY' | 'DISTRIBUTION' | 'ADVANCED';

const ResearchLab: React.FC = () => {
    // Market data selection
    const [segment, setSegment] = useState('NSE_EQ');
    const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
    const [selectedInstrument, setSelectedInstrument] = useState<any>(null);
    const [symbol, setSymbol] = useState('');
    const [timeframe, setTimeframe] = useState('1d');

    // Generic instrument search hook (debounced + stale-request safe)
    const { results: searchResults, isSearching } = useInstrumentSearch(
        symbolSearchQuery,
        segment,
        selectedInstrument,
    );

    // Date range
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Correlation symbols (comma-separated input for advanced tab)
    const [corrSymbolsInput, setCorrSymbolsInput] = useState('');

    // State
    const [activeTab, setActiveTab] = useState<ResearchTab>('PROFILE');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ResearchResponse | null>(null);

    const handleAnalyze = async () => {
        if (!symbol) {
            setError('Please select a stock first.');
            return;
        }
        if (!startDate || !endDate) {
            setError('Please select a date range.');
            return;
        }
        setRunning(true);
        setError(null);
        try {
            const corrSymbols = corrSymbolsInput.split(',').map(s => s.trim()).filter(Boolean);
            const res = await analyzeStock({ symbol, startDate, endDate, timeframe, correlationSymbols: corrSymbols });
            setResult(res);
            setActiveTab('PROFILE');
        } catch (e: any) {
            setError(e?.message || 'Analysis failed');
        } finally {
            setRunning(false);
        }
    };

    const tabs: { id: ResearchTab; label: string; icon: React.ReactNode }[] = [
        { id: 'PROFILE', label: 'Statistical Profile', icon: <Activity className="w-4 h-4" /> },
        { id: 'SEASONALITY', label: 'Seasonality', icon: <Calendar className="w-4 h-4" /> },
        { id: 'DISTRIBUTION', label: 'Distribution', icon: <BarChart className="w-4 h-4" /> },
        { id: 'ADVANCED', label: 'Advanced', icon: <Zap className="w-4 h-4" /> },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                    <Microscope className="w-7 h-7 text-indigo-400" />
                    Research Lab
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                    Institutional-grade statistical analysis. Understand a stock before building strategies.
                </p>
            </div>

            {/* Controls */}
            <Card className="p-6">
                <div className="space-y-4">
                    <MarketDataSelector
                        segment={segment}
                        setSegment={setSegment}
                        symbolSearchQuery={symbolSearchQuery}
                        setSymbolSearchQuery={setSymbolSearchQuery}
                        searchResults={searchResults}
                        setSearchResults={() => { }}
                        isSearching={isSearching}
                        selectedInstrument={selectedInstrument}
                        setSelectedInstrument={setSelectedInstrument}
                        symbol={symbol}
                        setSymbol={setSymbol}
                        timeframe={timeframe}
                        setTimeframe={setTimeframe}
                    />

                    <div className="flex flex-col md:flex-row items-end gap-4">
                        <div className="flex-1 w-full">
                            <DateRangePicker
                                startDate={startDate}
                                endDate={endDate}
                                setStartDate={setStartDate}
                                setEndDate={setEndDate}
                            />
                        </div>
                        <div className="flex-1 w-full">
                            <label className="block text-xs text-slate-500 mb-1">Correlation Symbols (comma-separated)</label>
                            <input
                                id="corr-symbols-input"
                                type="text"
                                value={corrSymbolsInput}
                                onChange={(e) => setCorrSymbolsInput(e.target.value)}
                                placeholder="e.g. HDFCBANK, RELIANCE, INFY"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <Button
                            onClick={handleAnalyze}
                            disabled={running || !symbol || !startDate || !endDate}
                            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-indigo-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            icon={running
                                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : <PlayCircle className="w-5 h-5" />
                            }
                        >
                            {running ? 'Analyzing...' : 'Analyze'}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Error */}
            {error && (
                <div className="bg-red-900/20 text-red-400 border border-red-800 p-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {/* Results */}
            {result && (
                <>
                    {/* Info bar */}
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2.5 py-0.5 rounded text-xs font-bold">
                            {result.symbol}
                        </span>
                        <span>{result.startDate} → {result.endDate}</span>
                        <span>·</span>
                        <span>{result.bars} bars</span>
                    </div>

                    {/* Tab bar */}
                    <div className="flex space-x-2 bg-slate-900 p-1 rounded-lg border border-slate-800 w-fit">
                        {tabs.map(t => (
                            <Button
                                key={t.id}
                                variant={activeTab === t.id ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setActiveTab(t.id)}
                                icon={t.icon}
                            >
                                {t.label}
                            </Button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <Card className="p-6">
                        {activeTab === 'PROFILE' && <StatisticalProfile data={result.profile} />}
                        {activeTab === 'SEASONALITY' && <SeasonalityPanel data={result.seasonality} />}
                        {activeTab === 'DISTRIBUTION' && <DistributionPanel data={result.distribution} />}
                        {activeTab === 'ADVANCED' && <AdvancedAnalysis data={result.advanced} />}
                    </Card>
                </>
            )}

            {/* Empty state */}
            {!result && !running && (
                <div className="flex flex-col items-center justify-center h-[40vh] text-slate-500">
                    <Microscope className="w-16 h-16 mb-4 opacity-10" />
                    <p className="text-lg">Select a stock and date range to begin analysis</p>
                    <p className="text-xs text-slate-600 mt-1">Computes 40+ statistical metrics across 4 analysis domains</p>
                </div>
            )}
        </div>
    );
};

export default ResearchLab;
