"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    CreditCard,
    Plus,
    CheckCircle2,
    XCircle,
    Trash2,
    Eye,
    EyeOff,
    Shield,
    AlertCircle,
    Pencil
} from "lucide-react"
import { formatDbDateTime } from "@/lib/utils"

interface Gateway {
    id: number
    provider: string
    isActive: boolean
    hasConfig: boolean
    createdAt: string
    mode?: "live" | "test"
    keyMode?: "live" | "test" | "unknown"
    hasTestKeys?: boolean
    hasLiveKeys?: boolean
    hasWebhookSecret?: boolean
}

type KeySet = { keyId: string; keySecret: string; webhookSecret: string }
const emptyKeys = (): KeySet => ({ keyId: "", keySecret: "", webhookSecret: "" })

export default function PaymentGatewaysPage() {
    const { isSuperAdmin } = useAuth()
    const [gateways, setGateways] = useState<Gateway[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showAddForm, setShowAddForm] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
    const [editId, setEditId] = useState<number | null>(null)

    // Form state
    const [formProvider, setFormProvider] = useState("")
    const [formMode, setFormMode] = useState<"test" | "live">("test")
    const [testKeys, setTestKeys] = useState<KeySet>(emptyKeys())
    const [liveKeys, setLiveKeys] = useState<KeySet>(emptyKeys())
    const [displayName, setDisplayName] = useState("")
    const [formActive, setFormActive] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

    async function loadGateways() {
        setLoading(true)
        setError(null)
        try {
            const token = localStorage.getItem("qc_token")
            const res = await fetch("/api/admin/payment-gateways", {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (!res.ok) throw new Error("Failed to load gateways")
            const data = await res.json()
            setGateways(data.gateways || [])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load gateways")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (isSuperAdmin()) {
            loadGateways()
        }
    }, [])

    function resetForm() {
        setShowAddForm(false)
        setEditId(null)
        setFormProvider("")
        setFormMode("test")
        setTestKeys(emptyKeys())
        setLiveKeys(emptyKeys())
        setDisplayName("")
        setFormActive(false)
        setFormError(null)
    }

    function openEdit(gateway: Gateway) {
        // Secrets are never sent to the client; leave them blank to keep existing.
        setEditId(gateway.id)
        setFormProvider(gateway.provider)
        setFormMode(gateway.mode || "test")
        setTestKeys(emptyKeys())
        setLiveKeys(emptyKeys())
        setDisplayName("")
        setFormActive(gateway.isActive)
        setFormError(null)
        setShowAddForm(true)
    }

    async function handleSwitchMode(id: number, mode: "test" | "live") {
        try {
            const token = localStorage.getItem("qc_token")
            const res = await fetch(`/api/admin/payment-gateways/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ mode }),
            })
            if (!res.ok) throw new Error("Failed to switch mode")
            loadGateways()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to switch mode")
        }
    }

    async function handleSaveGateway() {
        if (!formProvider) {
            setFormError("Provider is required")
            return
        }

        // On create, the selected mode's keys are required. On edit, blanks keep existing.
        if (!editId && formProvider.toLowerCase() === "razorpay") {
            const active = formMode === "live" ? liveKeys : testKeys
            if (!active.keyId || !active.keySecret) {
                setFormError(`Razorpay requires Key ID and Key Secret for the active (${formMode}) mode`)
                return
            }
        }

        const config = {
            mode: formMode,
            test: testKeys,
            live: liveKeys,
            displayName,
        }

        setSaving(true)
        setFormError(null)
        try {
            const token = localStorage.getItem("qc_token")
            const url = editId
                ? `/api/admin/payment-gateways/${editId}`
                : "/api/admin/payment-gateways"
            const res = await fetch(url, {
                method: editId ? "PATCH" : "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(
                    editId
                        ? { config, isActive: formActive }
                        : { provider: formProvider.toLowerCase(), config, isActive: formActive }
                )
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || "Failed to save gateway")
            }

            resetForm()
            loadGateways()
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Failed to save gateway")
        } finally {
            setSaving(false)
        }
    }

    async function handleActivateGateway(id: number) {
        try {
            const token = localStorage.getItem("qc_token")
            const res = await fetch(`/api/admin/payment-gateways/${id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ activate: true })
            })

            if (!res.ok) throw new Error("Failed to activate gateway")
            loadGateways()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to activate gateway")
        }
    }

    async function handleDeleteGateway(id: number) {
        try {
            const token = localStorage.getItem("qc_token")
            const res = await fetch(`/api/admin/payment-gateways/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!res.ok) throw new Error("Failed to delete gateway")
            setDeleteConfirm(null)
            loadGateways()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete gateway")
        }
    }

    function getProviderIcon(provider: string) {
        switch (provider.toLowerCase()) {
            case "razorpay":
                return "🇮🇳"
            default:
                return "💰"
        }
    }

    function getProviderDisplayName(provider: string) {
        switch (provider.toLowerCase()) {
            case "razorpay":
                return "Razorpay"
            default:
                return provider.charAt(0).toUpperCase() + provider.slice(1)
        }
    }

    function renderConfigFields() {
        const provider = formProvider.toLowerCase()

        if (provider === "razorpay") {
            const renderKeySet = (label: string, mode: "test" | "live", keys: KeySet, setKeys: (k: KeySet) => void) => (
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-800">{label}</h4>
                        {formMode === mode && (
                            <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-semibold">Active</span>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Key ID</label>
                        <Input
                            type="text"
                            placeholder={editId ? "Leave blank to keep current" : (mode === "test" ? "rzp_test_xxxxx" : "rzp_live_xxxxx")}
                            value={keys.keyId}
                            onChange={(e) => setKeys({ ...keys, keyId: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Key Secret</label>
                        <div className="relative">
                            <Input
                                type={showSecrets[`${mode}Secret`] ? "text" : "password"}
                                placeholder={editId ? "Leave blank to keep current" : "Your secret key"}
                                value={keys.keySecret}
                                onChange={(e) => setKeys({ ...keys, keySecret: e.target.value })}
                            />
                            <button type="button"
                                onClick={() => setShowSecrets({ ...showSecrets, [`${mode}Secret`]: !showSecrets[`${mode}Secret`] })}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showSecrets[`${mode}Secret`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Webhook Secret <span className="text-slate-400">(recommended)</span></label>
                        <div className="relative">
                            <Input
                                type={showSecrets[`${mode}Webhook`] ? "text" : "password"}
                                placeholder={editId ? "Leave blank to keep current" : "From Razorpay → Webhooks"}
                                value={keys.webhookSecret}
                                onChange={(e) => setKeys({ ...keys, webhookSecret: e.target.value })}
                            />
                            <button type="button"
                                onClick={() => setShowSecrets({ ...showSecrets, [`${mode}Webhook`]: !showSecrets[`${mode}Webhook`] })}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showSecrets[`${mode}Webhook`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            )
            return (
                <>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Active mode</label>
                        <select
                            value={formMode}
                            onChange={(e) => setFormMode(e.target.value as "test" | "live")}
                            className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm"
                        >
                            <option value="test">Test</option>
                            <option value="live">Live</option>
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Which key set processes payments right now — switchable anytime.</p>
                    </div>
                    {renderKeySet("Test keys", "test", testKeys, setTestKeys)}
                    {renderKeySet("Live keys", "live", liveKeys, setLiveKeys)}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Checkout Display Name <span className="text-slate-400">(optional)</span></label>
                        <Input
                            type="text"
                            placeholder="LaptopQC License"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />
                        <p className="text-xs text-slate-500 mt-1">On edit, leave key fields blank to keep the saved values.</p>
                    </div>
                </>
            )
        }

        return (
            <p className="text-sm text-slate-500">Select a supported provider to configure its credentials.</p>
        )
    }

    if (!isSuperAdmin()) {
        return (
            <div className="p-8 text-center">
                <Shield className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
                <p className="text-slate-600 mt-2">Only Super Admins can manage payment gateways.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payment Gateways</h1>
                    <p className="text-slate-500 mt-1">
                        Configure payment providers for customer license purchases
                    </p>
                </div>
                <Button
                    onClick={() => (showAddForm ? resetForm() : setShowAddForm(true))}
                    className="flex items-center gap-2 bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white"
                >
                    <Plus className="h-4 w-4" />
                    {showAddForm ? "Cancel" : "Add Gateway"}
                </Button>
            </div>

            {/* Alert for no active gateway */}
            {!loading && gateways.length > 0 && !gateways.some(g => g.isActive) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-amber-900">No Active Gateway</h3>
                        <p className="text-sm text-amber-700 mt-1">
                            Customers cannot purchase licenses until you activate a payment gateway.
                        </p>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    {error}
                </div>
            )}

            {/* Add Gateway Form */}
            {showAddForm && (
                <Card className="border-2 border-[var(--brand-purple)]">
                    <CardHeader>
                        <CardTitle>{editId ? "Edit Payment Gateway" : "Add Payment Gateway"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Provider <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={formProvider}
                                disabled={!!editId}
                                onChange={(e) => {
                                    setFormProvider(e.target.value)
                                    setTestKeys(emptyKeys())
                                    setLiveKeys(emptyKeys())
                                    setDisplayName("")
                                    setFormError(null)
                                }}
                                className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm disabled:bg-slate-100 disabled:text-slate-500"
                            >
                                <option value="">Select a provider...</option>
                                <option value="razorpay">🇮🇳 Razorpay (India)</option>
                            </select>
                        </div>

                        {formProvider && renderConfigFields()}

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="activateGateway"
                                checked={formActive}
                                onChange={(e) => setFormActive(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-[var(--brand-purple)] focus:ring-[var(--brand-purple)]"
                            />
                            <label htmlFor="activateGateway" className="text-sm text-slate-700">
                                Activate this gateway immediately (deactivates others)
                            </label>
                        </div>

                        {formError && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
                                {formError}
                            </div>
                        )}

                        <div className="flex gap-2 pt-2">
                            <Button
                                onClick={handleSaveGateway}
                                disabled={saving || !formProvider}
                                className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white"
                            >
                                {saving ? "Saving..." : editId ? "Update Gateway" : "Save Gateway"}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={resetForm}
                            >
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Gateways List */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Configured Gateways
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading gateways...</div>
                    ) : gateways.length === 0 ? (
                        <div className="text-center py-12">
                            <CreditCard className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-500 mb-2">No payment gateways configured</p>
                            <p className="text-sm text-slate-400">
                                Add a payment gateway to enable customer license purchases
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {gateways.map((gateway) => (
                                <div
                                    key={gateway.id}
                                    className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                                        gateway.isActive
                                            ? "border-green-200 bg-green-50"
                                            : "border-slate-200 bg-white"
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="text-3xl">{getProviderIcon(gateway.provider)}</div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold text-slate-900">
                                                    {getProviderDisplayName(gateway.provider)}
                                                </h3>
                                                {gateway.isActive && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        Active
                                                    </span>
                                                )}
                                                {gateway.keyMode === "live" && (
                                                    <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                                                        Live
                                                    </span>
                                                )}
                                                {gateway.keyMode === "test" && (
                                                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                                        Test
                                                    </span>
                                                )}
                                                {gateway.hasTestKeys && (
                                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">test keys</span>
                                                )}
                                                {gateway.hasLiveKeys && (
                                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">live keys</span>
                                                )}
                                                {gateway.hasWebhookSecret ? (
                                                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                                        Webhook ✓
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                                                        No webhook
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-500">
                                                {gateway.hasConfig ? "Configured" : "Missing configuration"} • Added {formatDbDateTime(gateway.createdAt)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {!gateway.isActive && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleActivateGateway(gateway.id)}
                                                className="text-green-600 hover:text-green-700 hover:border-green-600"
                                            >
                                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                                Activate
                                            </Button>
                                        )}
                                        {gateway.mode && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleSwitchMode(gateway.id, gateway.mode === "live" ? "test" : "live")}
                                                disabled={gateway.mode === "live" ? !gateway.hasTestKeys : !gateway.hasLiveKeys}
                                                title={
                                                    gateway.mode === "live"
                                                        ? (gateway.hasTestKeys ? "Switch to Test mode" : "No test keys saved")
                                                        : (gateway.hasLiveKeys ? "Switch to Live mode" : "No live keys saved")
                                                }
                                            >
                                                {gateway.mode === "live" ? "Use Test" : "Go Live"}
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEdit(gateway)}
                                            className="text-slate-600 hover:text-slate-900"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        {deleteConfirm === gateway.id ? (
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => handleDeleteGateway(gateway.id)}
                                                >
                                                    Confirm
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDeleteConfirm(null)}
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setDeleteConfirm(gateway.id)}
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Documentation */}
            <Card className="border-slate-200 bg-slate-50">
                <CardHeader>
                    <CardTitle className="text-base">Setup Instructions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-600">
                    <div>
                        <h4 className="font-semibold text-slate-900 mb-2">Razorpay Setup (India)</h4>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                            <li>Create account at <a href="https://razorpay.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">razorpay.com</a></li>
                            <li>Go to Dashboard → Settings → API Keys</li>
                            <li>Generate Test/Live keys</li>
                            <li>Copy Key ID and Key Secret</li>
                            <li>Add gateway above with credentials</li>
                        </ol>
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-900 mb-2">Webhook Setup (recommended)</h4>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                            <li>In Razorpay → Settings → Webhooks, add a webhook</li>
                            <li>URL: <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">{`${typeof window !== "undefined" ? window.location.origin : ""}/api/customer/payment/webhook`}</code></li>
                            <li>Subscribe to events: <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">payment.captured</code>, <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">payment.failed</code></li>
                            <li>Copy the webhook secret and paste it into the gateway config above</li>
                        </ol>
                        <p className="text-xs text-slate-500 mt-1">Without a webhook, a license key may not be issued if the customer closes the browser before redirect.</p>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                        <p className="text-xs text-slate-500">
                            ⚠️ Only one gateway can be active at a time. Activating a gateway will deactivate all others.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
