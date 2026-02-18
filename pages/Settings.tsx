import React, { useState, useEffect } from 'react';
import { Save, Shield, Database, Bell, User, Monitor, Link2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { CONFIG } from '../config';
import { fetchClient } from '../services/http';


const Settings: React.FC = () => {
    const [activeTab, setActiveTab] = useState('api');

    const [dhanClientId, setDhanClientId] = useState('');
    const [dhanAccessToken, setDhanAccessToken] = useState('');
    const [dhanStatus, setDhanStatus] = useState<{
        client_id: string;
        token_set: boolean;
        token_preview: string;
        expiry_utc: string | null;
        is_expired: boolean;
        hours_remaining: number | null;
    } | null>(null);
    const [dhanBusy, setDhanBusy] = useState<'idle' | 'status' | 'save' | 'test'>('idle');
    const [dhanMsg, setDhanMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        // Pull Dhan status from backend (credentials stay server-side)
        (async () => {
            try {
                const data = await fetchClient<typeof dhanStatus>('/broker/dhan/status');
                setDhanStatus(data as any);
                if ((data as any)?.client_id && !dhanClientId) {
                    setDhanClientId((data as any).client_id);
                }
            } catch (e) {
                // ignore — backend may be offline
            }
        })();
    }, []);

    const handleDhanStatus = async () => {
        setDhanBusy('status');
        setDhanMsg(null);
        try {
            const data = await fetchClient<typeof dhanStatus>('/broker/dhan/status');
            setDhanStatus(data as any);
            if ((data as any)?.client_id && !dhanClientId) {
                setDhanClientId((data as any).client_id);
            }
        } catch (e: any) {
            setDhanMsg({ type: 'error', text: e?.message || 'Failed to fetch Dhan status' });
        } finally {
            setDhanBusy('idle');
        }
    };

    const handleDhanSave = async () => {
        if (!dhanClientId.trim() || !dhanAccessToken.trim()) {
            setDhanMsg({ type: 'error', text: 'client_id and access_token are required' });
            return;
        }
        setDhanBusy('save');
        setDhanMsg(null);
        try {
            await fetchClient<{ status: string; expiry_utc?: string | null; message?: string }>(
                '/broker/dhan/save',
                {
                    method: 'POST',
                    body: JSON.stringify({ client_id: dhanClientId.trim(), access_token: dhanAccessToken.trim() })
                }
            );
            setDhanMsg({ type: 'success', text: 'Saved to backend' });
            await handleDhanStatus();
        } catch (e: any) {
            setDhanMsg({ type: 'error', text: e?.message || 'Failed to save Dhan credentials' });
        } finally {
            setDhanBusy('idle');
        }
    };

    const handleDhanTest = async () => {
        setDhanBusy('test');
        setDhanMsg(null);
        try {
            const data = await fetchClient<{ status: string; message?: string }>(
                '/broker/dhan/test',
                { method: 'POST' }
            );
            if (data.status === 'connected') {
                setDhanMsg({ type: 'success', text: data.message || 'Connected' });
            } else {
                setDhanMsg({ type: 'error', text: data.message || 'Connection failed' });
            }
            await handleDhanStatus();
        } catch (e: any) {
            setDhanMsg({ type: 'error', text: e?.message || 'Failed to test Dhan connection' });
        } finally {
            setDhanBusy('idle');
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

                                {/* Dhan Broker Configuration */}
                                <div>
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                                        <h3 className="text-lg font-semibold text-slate-100 flex items-center">
                                            <Link2 className="w-4 h-4 mr-2 text-emerald-500" />
                                            Broker Connection (Dhan)
                                        </h3>
                                    </div>

                                    <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg space-y-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="text-sm text-slate-400">
                                                <div className="text-slate-200 font-semibold">Server-side credentials</div>
                                                <div className="text-xs text-slate-500 mt-1">Stored in backend and never persisted in your browser.</div>
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={handleDhanStatus}
                                                    disabled={dhanBusy !== 'idle'}
                                                >
                                                    Refresh Status
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={handleDhanTest}
                                                    disabled={dhanBusy !== 'idle'}
                                                >
                                                    {dhanBusy === 'test' ? 'Testing…' : 'Test Connection'}
                                                </Button>
                                            </div>
                                        </div>

                                        {dhanStatus && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                                                    <div className="text-xs text-slate-500">Client ID</div>
                                                    <div className="text-slate-200 font-mono mt-1">{dhanStatus.client_id || '—'}</div>
                                                </div>
                                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                                                    <div className="text-xs text-slate-500">Token</div>
                                                    <div className="mt-1 flex items-center justify-between gap-3">
                                                        <div className="text-slate-200 font-mono truncate">{dhanStatus.token_set ? dhanStatus.token_preview : 'Not set'}</div>
                                                        <span className={`text-xs font-semibold ${dhanStatus.token_set && !dhanStatus.is_expired ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {dhanStatus.token_set ? (dhanStatus.is_expired ? 'Expired' : 'Active') : 'Missing'}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-2">
                                                        Expiry: {dhanStatus.expiry_utc || '—'}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-400 mb-2">Dhan Client ID</label>
                                                <input
                                                    type="text"
                                                    value={dhanClientId}
                                                    onChange={(e) => setDhanClientId(e.target.value)}
                                                    placeholder="Enter your Dhan Client ID"
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-400 mb-2">Access Token (JWT)</label>
                                                <input
                                                    type="password"
                                                    value={dhanAccessToken}
                                                    onChange={(e) => setDhanAccessToken(e.target.value)}
                                                    placeholder="Paste access token"
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                                                />
                                            </div>
                                        </div>

                                        {dhanMsg && (
                                            <div className={`text-sm ${dhanMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {dhanMsg.text}
                                            </div>
                                        )}

                                        <div className="flex justify-end">
                                            <Button
                                                onClick={handleDhanSave}
                                                disabled={dhanBusy !== 'idle'}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                                            >
                                                {dhanBusy === 'save' ? 'Saving…' : 'Save Dhan Credentials'}
                                            </Button>
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

                    <div className="mt-8 pt-6 border-t border-slate-800 flex justify-end"></div>

                </div>
            </div>
        </div>
    );
};

export default Settings;