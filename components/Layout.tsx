import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_ITEMS, APP_NAME } from '../constants';
import { Activity, Bell } from 'lucide-react';
import DebugConsole from './DebugConsole';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0">
        <div className="p-6 flex items-center space-x-3">
          <Activity className="text-emerald-500 w-8 h-8" />
          <span className="text-xl font-bold tracking-tight text-slate-100">{APP_NAME}</span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                <span className="font-medium">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-500">
            <div className="flex justify-between mb-1">
              <span>Status</span>
              <span className="text-emerald-500 font-semibold">Online</span>
            </div>
            <div className="flex justify-between">
              <span>API Latency</span>
              <span>45ms</span>
            </div>
            <div className="flex justify-between mt-2 pt-2 border-t border-slate-700/50">
               <span>v1.0.0</span>
               <span className="text-slate-600">Phase 12</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
        {/* Top Header */}
        <header className="h-16 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between px-8 backdrop-blur-sm sticky top-0 z-10">
          <h1 className="text-lg font-semibold text-slate-100">
            {NAV_ITEMS.find(i => i.path === location.pathname)?.name || 'VectorBT Pro'}
          </h1>
          
          <div className="flex items-center space-x-4">
             <button className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors relative">
               <Bell className="w-5 h-5" />
               <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
             </button>
             <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white border border-emerald-500">
               JS
             </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto p-8 scroll-smooth pb-20">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>

        {/* GOD MODE TERMINAL */}
        <DebugConsole />
      </main>
    </div>
  );
};

export default Layout;