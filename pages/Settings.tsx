import React, { useState, useEffect } from 'react';
import { Save, Shield, Database, Bell, User, Monitor, Globe, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { CONFIG } from '../config';
import { fetchClient } from '../services/http';


const Settings: React.FC = () => {
    const [activeTab, setActiveTab] = useState('api');
    const [alphaVantageKey, setAlphaVantageKey] = useState('');
    const [useAlphaVantage, setUseAlphaVantage] = useState(true);
    const [saved, setSaved] = useState(false);

    // Validation State
    const [isValidating, setIsValidating] = useState(false);
    const [validationStatus, setValidationStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [validationMsg, setValidationMsg] = useState('');

    useEffect(() => {
        const savedAlphaKey = localStorage.getItem('ALPHA_VANTAGE_KEY');
        const savedUseAlpha = localStorage.getItem('USE_ALPHA_VANTAGE');

        if (savedAlphaKey) setAlphaVantageKey(savedAlphaKey);
        if (savedUseAlpha !== null) setUseAlphaVantage(savedUseAlpha === 'true');
    }, []);

    const handleSave = () => {
        localStorage.setItem('ALPHA_VANTAGE_KEY', alphaVantageKey);
        localStorage.setItem('USE_ALPHA_VANTAGE', String(useAlphaVantage));

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleValidate = async () => {
        if (!alphaVantageKey) return;

        setIsValidating(true);
        setValidationStatus('idle');
        setValidationMsg('');

        // Temporarily store the key so fetchClient picks it up in headers
        localStorage.setItem('ALPHA_VANTAGE_KEY', alphaVantageKey);
        localStorage.setItem('USE_ALPHA_VANTAGE', 'true');

        try {
            const data = await fetchClient<{ status: string; message?: string }>(
                '/validate-key',
                { method: 'POST' }
            );

            if (data.status === 'valid') {
                setValidationStatus('success');
            } else {
                setValidationStatus('error');
                setValidationMsg(data.message || 'Validation failed');
            }
        } catch (error) {
            setValidationStatus('error');
            setValidationMsg('Network error connecting to backend');
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-slate-100">Settings</h2>
                <p className="text-slate-400 text-sm">Manage your data connections and application preferences.</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Sidebar Navigation */}
                <div className="w-full lg:w-64 flex-shrink-0 space-y-2">
                    {[
                        { id: 'api', label: 'Data Sources', icon: Database },
                        { id: 'risk', label: 'Risk Management', icon: Shield },
                        { id: 'general', label: 'General', icon: Monitor },
                        { id: 'notifications', label: 'Notifications', icon: Bell },
                        { id: 'account', label: 'Account', icon: User },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === tab.id
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
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col min-h-[500px]">

                    <div className="flex-1">
                        {/* API & Brokers Section */}
                        {activeTab === 'api' && (
                            <div className="space-y-8">

                                {/* Alpha Vantage Configuration */}
                                <div>
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                                        <h3 className="text-lg font-semibold text-slate-100 flex items-center">
                                            <Globe className="w-4 h-4 mr-2 text-indigo-500" />
                                            Market Data Provider
                                        </h3>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg">
                                            <div className="flex justify-between items-center mb-6">
                                                <div>
                                                    <h4 className="text-base font-semibold text-slate-200">Alpha Vantage</h4>
                                                    <p className="text-sm text-slate-500 mt-1">Primary source for historical global and equity data.</p>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <label className="relative inline-flex items-center cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only peer"
                                                            checked={useAlphaVantage}
                                                            onChange={(e) => setUseAlphaVantage(e.target.checked)}
                                                        />
                                                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-400 mb-2">API Key</label>
                                                    <input
                                                        type="text"
                                                        value={alphaVantageKey}
                                                        onChange={(e) => {
                                                            setAlphaVantageKey(e.target.value);
                                                            setValidationStatus('idle');
                                                        }}
                                                        placeholder="Enter your Alpha Vantage API Key"
                                                        className={`w-full bg-slate-900 border ${validationStatus === 'error' ? 'border-red-500' : validationStatus === 'success' ? 'border-emerald-500' : 'border-slate-700'} rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none font-mono transition-colors`}
                                                    />
                                                    <div className="flex justify-between items-start mt-3">
                                                        <p className="text-xs text-slate-500">
                                                            Don't have a key? <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Get a free key here</a>.
                                                        </p>

                                                        <div className="flex items-center space-x-3">
                                                            {validationStatus === 'success' && <span className="text-xs text-emerald-400 flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Valid</span>}
                                                            {validationStatus === 'error' && <span className="text-xs text-red-400 flex items-center"><AlertCircle className="w-3 h-3 mr-1" /> {validationMsg || 'Invalid'}</span>}

                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={handleValidate}
                                                                disabled={isValidating || !alphaVantageKey}
                                                                className="min-w-[100px]"
                                                            >
                                                                {isValidating ? (
                                                                    <span className="flex items-center">
                                                                        <div className="w-3 h-3 border-2 border-slate-400 border-t-white rounded-full animate-spin mr-2"></div>
                                                                        Checking
                                                                    </span>
                                                                ) : 'Validate Key'}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
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
                                </div>
                            </div>
                        )}

                        {(activeTab === 'notifications' || activeTab === 'account') && (
                            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                                <Monitor className="w-12 h-12 mb-4 opacity-20" />
                                <p>This setting module is under development.</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-800 flex justify-end">
                        <Button
                            onClick={handleSave}
                            icon={<Save className="w-4 h-4" />}
                            className={saved ? 'bg-emerald-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}
                        >
                            {saved ? 'Saved Successfully!' : 'Save Changes'}
                        </Button>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Settings;