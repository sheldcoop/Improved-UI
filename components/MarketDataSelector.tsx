import React from 'react';
import { Database, Clock } from 'lucide-react';
import { UNIVERSES } from '../constants';
import { Timeframe } from '../types';

interface MarketDataSelectorProps {
  mode: string;
  segment: string;
  setSegment: (segment: string) => void;
  symbolSearchQuery: string;
  setSymbolSearchQuery: (query: string) => void;
  selectedInstrument: any;
  setSelectedInstrument: (instrument: any) => void;
  symbol: string;
  setSymbol: (symbol: string) => void;
  searchResults: any[];
  setSearchResults: (results: any[]) => void;
  isSearching: boolean;
  universe: string;
  setUniverse: (universe: string) => void;
  timeframe: string;
  setTimeframe: (tf: string) => void;
}

const MarketDataSelector: React.FC<MarketDataSelectorProps> = ({
  mode,
  segment,
  setSegment,
  symbolSearchQuery,
  setSymbolSearchQuery,
  selectedInstrument,
  setSelectedInstrument,
  symbol,
  setSymbol,
  searchResults,
  setSearchResults,
  isSearching,
  universe,
  setUniverse,
  timeframe,
  setTimeframe,
}) => {
  return (
    <div className="space-y-6 bg-slate-950/50 p-6 rounded-xl border border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <label className="text-sm font-medium text-slate-400 flex items-center">
          <Database className="w-4 h-4 mr-2" /> Market Data Selection
        </label>
      </div>

      {mode === 'SINGLE' ? (
        <div className="space-y-4">
          {/* Segment Dropdown */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Market Segment</label>
            <select
              value={segment}
              onChange={(e) => {
                setSegment(e.target.value);
                setSelectedInstrument(null);
                setSymbol('');
                setSymbolSearchQuery('');
                setSearchResults([]);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
            >
              <option value="NSE_EQ">NSE Mainboard</option>
              <option value="NSE_SME">NSE SME</option>
            </select>
          </div>

          {/* Symbol Search */}
          <div className="relative z-50">
            <div className="flex justify-between mb-2">
              <label className="block text-sm font-medium text-slate-400">Symbol Search</label>
              {selectedInstrument ? (
                <span className="text-xs text-emerald-400">
                  {selectedInstrument.display_name} (ID: {selectedInstrument.security_id})
                </span>
              ) : (
                <span className="text-xs text-yellow-500">
                  Type 2+ chars and click a result
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={symbolSearchQuery}
                onChange={(e) => {
                  setSymbolSearchQuery(e.target.value);
                  if (selectedInstrument) {
                    setSelectedInstrument(null);
                    setSymbol('');
                  }
                }}
                placeholder={`Search ${segment === 'NSE_EQ' ? 'Mainboard' : 'SME'} stocks...`}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && !selectedInstrument && (
              <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg max-h-60 overflow-y-auto shadow-xl">
                {searchResults.map((result: any) => (
                  <button
                    key={result.security_id}
                    onClick={() => {
                      setSelectedInstrument(result);
                      setSymbol(result.symbol);
                      setSymbolSearchQuery(`${result.symbol} - ${result.display_name}`);
                      setSearchResults([]);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-200">{result.symbol}</span>
                      <span className="text-xs text-slate-500">{result.instrument_type}</span>
                    </div>
                    <div className="text-xs text-slate-400 truncate">{result.display_name}</div>
                  </button>
                ))}
              </div>
            )}

            {/* No results message */}
            {symbolSearchQuery.length >= 2 && !isSearching && searchResults.length === 0 && !selectedInstrument && (
              <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-400">
                No results found. Try a different search term.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
            <Database className="w-4 h-4 mr-2 text-indigo-400" /> Universe
          </label>
          <select
            value={universe}
            onChange={(e) => setUniverse(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            {UNIVERSES && UNIVERSES.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
          <Clock className="w-4 h-4 mr-2" /> Timeframe
        </label>
        <div className="grid grid-cols-4 gap-2">
          {Object.values(Timeframe).map((tf: any) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`py-2 rounded-lg text-sm font-medium border transition-colors ${timeframe === tf ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MarketDataSelector;
