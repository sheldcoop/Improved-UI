import React, { useState } from 'react';
import { Save, Shield, Database, Bell, User, Monitor, Key } from 'lucide-react';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
         <h2 className="text-2xl font-bold text-slate-100">Settings</h2>
         <p className="text-slate-400 text-sm">Manage your account preferences and API configurations.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="w-full lg:w-64 flex-shrink-0 space-y-2">
          {[
            { id: 'general', label: 'General', icon: Monitor },
            { id: 'api', label: 'API & Brokers', icon: Database },
            { id: 'risk', label: 'Risk Management', icon: Shield },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'account', label: 'Account', icon: User },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === tab.id 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="font-medium text-sm">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-8">
          
          {/* API & Brokers Section */}
          {activeTab === 'api' && (
            <div className="space-y-6">
               <h3 className="text-lg font-semibold text-slate-100 border-b border-slate-800 pb-4">Broker Configuration</h3>
               
               <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Select Broker</label>
                    <select className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-emerald-500">
                      <option>Dhan HQ</option>
                      <option>Zerodha Kite</option>
                      <option>Angel One</option>
                      <option>Fyers</option>
                    </select>
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-slate-400 mb-2">Client ID</label>
                     <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-emerald-500" placeholder="e.g. 10002548" />
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-slate-400 mb-2">Access Token / API Key</label>
                     <div className="relative">
                        <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-600 w-4 h-4" />
                        <input type="password" value="************************" readOnly className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-slate-200 focus:outline-none focus:border-emerald-500" />
                     </div>
                  </div>
               </div>

               <div className="flex items-center justify-between pt-4">
                  <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">Connection Status: Active</span>
                  <button className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Test Connection</button>
               </div>
            </div>
          )}

          {/* Risk Management Section */}
           {activeTab === 'risk' && (
            <div className="space-y-6">
               <h3 className="text-lg font-semibold text-slate-100 border-b border-slate-800 pb-4">Global Risk Defaults</h3>
               
               <div className="space-y-4">
                  <div className="flex items-center justify-between">
                     <div>
                       <h4 className="text-slate-200 font-medium">Max Daily Loss Limit</h4>
                       <p className="text-xs text-slate-500">Stop all trading if this loss is reached in a day.</p>
                     </div>
                     <div className="flex items-center bg-slate-950 rounded-lg border border-slate-700 px-3">
                        <span className="text-slate-500 mr-2">₹</span>
                        <input type="number" defaultValue="5000" className="w-24 bg-transparent border-none py-2 text-slate-200 focus:ring-0 text-right" />
                     </div>
                  </div>

                  <div className="flex items-center justify-between">
                     <div>
                       <h4 className="text-slate-200 font-medium">Max Allocation Per Trade</h4>
                       <p className="text-xs text-slate-500">Maximum capital deployed in a single strategy.</p>
                     </div>
                     <div className="flex items-center bg-slate-950 rounded-lg border border-slate-700 px-3">
                        <input type="number" defaultValue="25" className="w-16 bg-transparent border-none py-2 text-slate-200 focus:ring-0 text-right" />
                        <span className="text-slate-500 ml-1">%</span>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {/* General Section */}
          {activeTab === 'general' && (
             <div className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-100 border-b border-slate-800 pb-4">Application Preferences</h3>
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                      <span className="text-slate-200">Dark Mode</span>
                      <div className="w-10 h-6 bg-emerald-600 rounded-full relative cursor-pointer">
                         <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                      </div>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-slate-200">Compact View (Dense Tables)</span>
                      <div className="w-10 h-6 bg-slate-700 rounded-full relative cursor-pointer">
                         <div className="absolute left-1 top-1 w-4 h-4 bg-slate-400 rounded-full"></div>
                      </div>
                   </div>
                </div>
             </div>
          )}
          
           {/* Placeholders for others */}
           {(activeTab === 'notifications' || activeTab === 'account') && (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                <Shield className="w-12 h-12 mb-4 opacity-20" />
                <p>This setting module is under development.</p>
              </div>
           )}

          <div className="mt-8 pt-6 border-t border-slate-800 flex justify-end">
             <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-medium flex items-center space-x-2 shadow-lg shadow-emerald-900/20 transition-all">
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
             </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Settings;
