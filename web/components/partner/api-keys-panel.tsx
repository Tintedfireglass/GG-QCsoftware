"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, AlertCircle, Check, Copy, Globe, KeyRound, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    PartnerApiKey,
    PartnerKeyUsage,
    getPartnerKeyUsage,
    issuePartnerKey,
    listPartnerKeys,
    revokePartnerKey,
} from "@/lib/api"
import {
    DEFAULT_PARTNER_SCOPES,
    PARTNER_SCOPE_DESCRIPTIONS,
    PARTNER_SCOPE_GROUPS,
    PartnerScope,
} from "@/lib/partner/scopes"
import { formatDateDMY } from "@/lib/utils"

/**
 * Issue and revoke the partner API keys a reseller uses to call
 * /api/partner/v1/* from their own backend.
 *
 * The plaintext key exists only in the create response, so it is held in local
 * state and shown until dismissed — there is no way to recover it afterwards.
 */
export function PartnerApiKeysPanel({ userId }: { userId: number }) {
    const [keys, setKeys] = useState<PartnerApiKey[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [issued, setIssued] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const [name, setName] = useState("")
    const [rateLimit, setRateLimit] = useState(120)
    const [expiresAt, setExpiresAt] = useState("")
    const [scopes, setScopes] = useState<PartnerScope[]>(DEFAULT_PARTNER_SCOPES)
    // One origin per line. Empty (the default) keeps the key server-to-server only.
    const [origins, setOrigins] = useState("")

    const load = useCallback(async () => {
        try {
            const data = await listPartnerKeys(userId)
            setKeys(data.keys)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load API keys")
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => { load() }, [load])

    function toggleScope(scope: PartnerScope) {
        setScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope])
    }

    async function handleCreate() {
        if (!name.trim()) return setError("Give the key a name so it can be told apart later")
        setCreating(true)
        setError(null)
        try {
            const { plaintext } = await issuePartnerKey({
                userId,
                name: name.trim(),
                scopes,
                rateLimitPerMin: rateLimit,
                allowedOrigins: origins.split("\n").map(o => o.trim()).filter(Boolean),
                expiresAt: expiresAt || null,
            })
            setIssued(plaintext)
            setShowForm(false)
            setName("")
            setScopes(DEFAULT_PARTNER_SCOPES)
            setOrigins("")
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create API key")
        } finally {
            setCreating(false)
        }
    }

    async function handleRevoke(id: number) {
        setError(null)
        try {
            await revokePartnerKey(id)
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to revoke API key")
        }
    }

    async function copyIssued() {
        if (!issued) return
        await navigator.clipboard.writeText(issued)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5" />
                    API Access
                </CardTitle>
                <CardDescription>
                    Keys this account uses to call <code className="text-xs">/api/partner/v1/*</code> from
                    its own backend. Each key acts as this user, so it sees exactly the data they see.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {error && (
                    <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        {error}
                    </div>
                )}

                {issued && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                        <p className="text-sm font-medium text-amber-900">
                            Copy this key now — it cannot be shown again.
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 break-all rounded bg-white px-2 py-1.5 text-xs font-mono border border-amber-200">
                                {issued}
                            </code>
                            <Button type="button" variant="outline" onClick={copyIssued}>
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIssued(null)}
                            className="text-xs text-amber-800 underline"
                        >
                            I have saved it
                        </button>
                    </div>
                )}

                {loading ? (
                    <p className="text-sm text-slate-500">Loading keys…</p>
                ) : keys.length === 0 ? (
                    <p className="text-sm text-slate-500">No API keys issued yet.</p>
                ) : (
                    <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                        {keys.map(k => (
                            <div key={k.id} className="flex items-start justify-between gap-4 p-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-slate-900 text-sm">{k.name}</span>
                                        {!k.isActive && (
                                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                                                revoked
                                            </span>
                                        )}
                                    </div>
                                    <code className="text-xs text-slate-500 font-mono">{k.keyPrefix}…</code>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {k.scopes.map(s => (
                                            <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {k.rateLimitPerMin}/min
                                        {" · "}
                                        {k.lastUsedAt ? `last used ${formatDateDMY(k.lastUsedAt)}` : "never used"}
                                        {k.expiresAt ? ` · expires ${formatDateDMY(k.expiresAt)}` : ""}
                                    </p>
                                    {k.allowedOrigins.length > 0 && (
                                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                            <Globe className="h-3 w-3" />
                                            browser access: {k.allowedOrigins.join(", ")}
                                        </p>
                                    )}
                                    <KeyUsage keyId={k.id} />
                                </div>
                                {k.isActive && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => handleRevoke(k.id)}
                                        className="text-red-600 hover:text-red-700 shrink-0"
                                    >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Revoke
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {showForm ? (
                    <div className="space-y-4 rounded-md border border-slate-200 p-4">
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium text-slate-700">Key name</label>
                                <Input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Acme production backend"
                                    maxLength={80}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Requests / min</label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={6000}
                                    value={rateLimit}
                                    onChange={e => setRateLimit(Number(e.target.value) || 120)}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                                Expires <span className="font-normal text-slate-500">(optional)</span>
                            </label>
                            <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                                Browser origins <span className="font-normal text-slate-500">(optional, one per line)</span>
                            </label>
                            <textarea
                                value={origins}
                                onChange={e => setOrigins(e.target.value)}
                                rows={2}
                                placeholder="https://app.acme.com"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                            />
                            <p className="mt-1 text-xs text-slate-500">
                                Leave empty for server-to-server only — the safe default. Add an origin
                                only if the reseller must call the API from a browser, which means the
                                key is visible to anyone using their site.
                            </p>
                        </div>

                        <div>
                            <p className="mb-2 text-sm font-medium text-slate-700">Scopes</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {PARTNER_SCOPE_GROUPS.map(group => (
                                    <div key={group.label}>
                                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            {group.label}
                                        </p>
                                        {group.scopes.map(scope => (
                                            <label key={scope} className="flex items-start gap-2 py-0.5 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1"
                                                    checked={scopes.includes(scope)}
                                                    onChange={() => toggleScope(scope)}
                                                />
                                                <span className="text-sm text-slate-700">
                                                    <code className="text-xs">{scope}</code>
                                                    <span className="block text-xs text-slate-500">
                                                        {PARTNER_SCOPE_DESCRIPTIONS[scope]}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button type="button" onClick={handleCreate} disabled={creating}>
                                {creating ? "Creating…" : "Create key"}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button type="button" variant="outline" onClick={() => setShowForm(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        New API key
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}

/**
 * Request volume for one key over the last 30 days. Loaded on demand: an admin
 * opening a user page usually wants the key list, not a query per key.
 */
function KeyUsage({ keyId }: { keyId: number }) {
    const [usage, setUsage] = useState<PartnerKeyUsage | null>(null)
    const [loading, setLoading] = useState(false)

    async function load() {
        setLoading(true)
        try {
            setUsage(await getPartnerKeyUsage(keyId))
        } catch {
            setUsage({ totalRequests: 0, totalErrors: 0, byDay: [], topRoutes: [] })
        } finally {
            setLoading(false)
        }
    }

    if (!usage) {
        return (
            <button
                type="button"
                onClick={load}
                disabled={loading}
                className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
                <Activity className="h-3 w-3" />
                {loading ? "Loading usage…" : "Show usage"}
            </button>
        )
    }

    if (usage.totalRequests === 0) {
        return <p className="mt-1 text-xs text-slate-500">No requests in the last 30 days.</p>
    }

    const errorRate = Math.round((usage.totalErrors / usage.totalRequests) * 100)

    return (
        <div className="mt-1 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{usage.totalRequests.toLocaleString()}</span> requests
            in 30 days · {errorRate}% errors
            {usage.topRoutes.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                    {usage.topRoutes.map(r => (
                        <li key={r.route} className="font-mono">
                            {r.route.replace("/api/partner/v1", "")} — {r.requests.toLocaleString()}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
