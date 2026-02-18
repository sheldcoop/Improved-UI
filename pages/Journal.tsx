import React, { useState } from 'react';
import { BookOpen, Plus, Tag, Search, Calendar, Smile, Meh, Frown, Edit2 } from 'lucide-react';

interface JournalEntry {
  id: string;
  date: string;
  title: string;
  content: string;
  tags: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  symbol?: string;
}

const Journal: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Mock Data
  const [entries] = useState<JournalEntry[]>([
    {
      id: '1',
      date: '2024-02-23',
      title: 'NIFTY Intraday Reversal',
      content: 'Market opened gap up but faced resistance at 22,200. RSI showed clear divergence on the 15m timeframe. Took a short position after the breakdown of the first 15m candle low. Covered at VWAP.',
      tags: ['NIFTY', 'Intraday', 'Technical'],
      sentiment: 'positive',
      symbol: 'NIFTY 50'
    },
    {
      id: '2',
      date: '2024-02-22',
      title: 'BankNifty Chop',
      content: 'Got caught in a sideways market today. The breakout was fake. Need to wait for candle close next time before entering. Stop loss hit twice.',
      tags: ['BANKNIFTY', 'Mistake', 'Psychology'],
      sentiment: 'negative',
      symbol: 'BANKNIFTY'
    },
    {
      id: '3',
      date: '2024-02-20',
      title: 'Reliance Swing Setup',
      content: 'Observing a cup and handle pattern formation on the daily chart. Volume is accumulating. Will enter if it crosses 2980 with volume support.',
      tags: ['RELIANCE', 'Swing', 'Setup'],
      sentiment: 'neutral',
      symbol: 'RELIANCE'
    }
  ]);

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <Smile className="w-5 h-5 text-emerald-400" />;
      case 'negative': return <Frown className="w-5 h-5 text-red-400" />;
      default: return <Meh className="w-5 h-5 text-yellow-400" />;
    }
  };

  const filteredEntries = entries.filter(e => 
    e.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-100">Trading Journal</h2>
           <p className="text-slate-400 text-sm">Log your trades, analyze psychology, and track setups.</p>
        </div>
        <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 flex items-center">
          <Plus className="w-4 h-4 mr-2" />
          New Entry
        </button>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
         <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search by title or tag..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 text-sm"
            />
         </div>
         <div className="flex items-center space-x-2 text-sm text-slate-400">
            <Calendar className="w-4 h-4" />
            <span>Last 30 Days</span>
         </div>
      </div>

      {/* Entries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEntries.map((entry) => (
          <div key={entry.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-emerald-500/30 transition-all group flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
               <div className="flex items-center space-x-2 text-xs text-slate-500">
                 <Calendar className="w-3 h-3" />
                 <span>{entry.date}</span>
                 {entry.symbol && (
                   <>
                     <span>•</span>
                     <span className="font-semibold text-slate-300">{entry.symbol}</span>
                   </>
                 )}
               </div>
               <div className="flex space-x-2">
                 {getSentimentIcon(entry.sentiment)}
               </div>
            </div>
            
            <h3 className="text-lg font-semibold text-slate-100 mb-2 group-hover:text-emerald-400 transition-colors">{entry.title}</h3>
            <p className="text-slate-400 text-sm mb-6 line-clamp-4 flex-1">
              {entry.content}
            </p>

            <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-800/50">
               <div className="flex flex-wrap gap-2">
                 {entry.tags.map(tag => (
                   <span key={tag} className="flex items-center text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-md">
                     <Tag className="w-3 h-3 mr-1 opacity-70" /> {tag}
                   </span>
                 ))}
               </div>
               <button className="text-slate-500 hover:text-white transition-colors">
                 <Edit2 className="w-4 h-4" />
               </button>
            </div>
          </div>
        ))}

        {/* Empty State Helper */}
        <button className="border-2 border-dashed border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center text-slate-500 hover:text-emerald-400 hover:border-emerald-500/50 transition-all h-full min-h-[200px]">
           <Plus className="w-8 h-8 mb-2" />
           <span className="font-medium">Add Note</span>
        </button>
      </div>
    </div>
  );
};

export default Journal;
