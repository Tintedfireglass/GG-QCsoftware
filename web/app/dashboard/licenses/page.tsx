'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useRouter } from 'next/navigation';

interface LicenseKey {
    id: number;
    key: string;
    type: string;
    max_uses: number;
    current_uses: number;
    is_active: boolean;
    expires_at: string | null;
    created_at: string;
    activations_count: string;
}

export default function LicensesPage() {
    const { user, token } = useAuth();
    const router = useRouter();

    const [keys, setKeys] = useState<LicenseKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Form states
    const [isGenerating, setIsGenerating] = useState(false);
    const [newType, setNewType] = useState('single_use');
    const [newMaxUses, setNewMaxUses] = useState(1);

    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }
        if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
            router.push('/dashboard');
            return;
        }
        fetchKeys();
    }, [user, router]);

    const fetchKeys = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/licenses', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setKeys(data.keys);
            } else {
                setError('Failed to fetch license keys.');
            }
        } catch (err) {
            setError('Error connecting to the server.');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setIsGenerating(true);

        try {
            const res = await fetch('/api/licenses', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: newType,
                    max_uses: newMaxUses
                })
            });

            const data = await res.json();

            if (res.ok) {
                setSuccessMsg('License key generated successfully!');
                fetchKeys(); // Refresh list
            } else {
                setError(data.message || data.error || 'Failed to generate key.');
            }
        } catch (err) {
            setError('Server error while generating key.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = (keyString: string) => {
        navigator.clipboard.writeText(keyString);
        alert('Copied to clipboard!');
    };

    if (loading) return <div className="p-8">Loading licenses...</div>;

    return (
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="px-4 py-6 sm:px-0">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">License Management</h1>
                </div>

                {error && <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6"><p className="text-sm text-red-700">{error}</p></div>}
                {successMsg && <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6"><p className="text-sm text-green-700">{successMsg}</p></div>}

                {/* Generation Form */}
                <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6 mb-8">
                    <div className="md:grid md:grid-cols-3 md:gap-6">
                        <div className="md:col-span-1">
                            <h3 className="text-lg font-medium leading-6 text-gray-900">Generate New License Key</h3>
                            <p className="mt-1 text-sm text-gray-500">Create a 16-digit code for Desktop Application login.</p>

                            {user?.role === 'Admin' && (
                                <div className="mt-4 p-3 bg-blue-50 text-blue-800 rounded-md text-sm border border-blue-200">
                                    <span className="font-semibold">Note:</span> Generating bulk keys will subtract credits from your account capacity.
                                </div>
                            )}
                        </div>
                        <div className="mt-5 md:mt-0 md:col-span-2">
                            <form onSubmit={handleGenerate}>
                                <div className="grid grid-cols-6 gap-6">
                                    <div className="col-span-6 sm:col-span-3">
                                        <label htmlFor="type" className="block text-sm font-medium text-gray-700">License Type</label>
                                        <select
                                            id="type"
                                            value={newType}
                                            onChange={(e) => {
                                                setNewType(e.target.value);
                                                if (e.target.value === 'single_use') setNewMaxUses(1);
                                            }}
                                            className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                        >
                                            <option value="single_use">Single Use (1 Device)</option>
                                            <option value="bulk">Bulk (Multiple Devices)</option>
                                        </select>
                                    </div>

                                    <div className="col-span-6 sm:col-span-3">
                                        <label htmlFor="max_uses" className="block text-sm font-medium text-gray-700">Max Device Activations</label>
                                        <input
                                            type="number"
                                            min="1"
                                            id="max_uses"
                                            disabled={newType === 'single_use'}
                                            value={newMaxUses}
                                            onChange={(e) => setNewMaxUses(parseInt(e.target.value) || 1)}
                                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
                                        />
                                    </div>
                                </div>
                                <div className="mt-6 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={isGenerating}
                                        className="bg-indigo-600 border border-transparent rounded-md shadow-sm py-2 px-4 inline-flex justify-center text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                                    >
                                        {isGenerating ? 'Generating...' : 'Generate License Key'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Keys List */}
                <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                    <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Active License Keys</h3>
                    </div>
                    {keys.length === 0 ? (
                        <div className="p-6 text-center text-gray-500">No license keys found. Generate one above.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">License Key</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activations (Uses / Max)</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {keys.map((k) => (
                                        <tr key={k.id}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-mono text-gray-900 font-bold tracking-wider">{k.key}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${k.type === 'bulk' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                                    {k.type === 'bulk' ? 'Bulk' : 'Single Use'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {k.current_uses} / {k.max_uses}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {k.is_active ?
                                                    (k.current_uses >= k.max_uses ?
                                                        <span className="text-red-600 font-semibold text-sm">Exhausted</span> :
                                                        <span className="text-green-600 font-semibold text-sm">Active</span>)
                                                    : <span className="text-red-600 font-semibold text-sm">Revoked</span>
                                                }
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                <button onClick={() => handleCopy(k.key)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                                                    Copy
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
