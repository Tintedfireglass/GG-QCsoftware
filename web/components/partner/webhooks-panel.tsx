"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Check, Copy, History, Pause, Play, Plus, Trash2, Webhook } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    PartnerWebhook,
    PartnerWebhookDelivery,
    createPartnerWebhook,
    deletePartnerWebhook,
    listPartnerWebhookDeliveries,
    listPartnerWebhooks,
    setPartnerWebhookActive,
} from "@/lib/api"
import { PARTNER_EVENTS, PARTNER_EVENT_DESCRIPTIONS, PartnerEvent } from "@/lib/partner/events"
import { formatDateTimeDMY } from "@/lib/utils"

/**
 * Register the endpoints a reseller wants events POSTed to, so they do not have
 * to poll.
 *
 * Like an API key, the signing secret is shown once at creation. An endpoint
 * that keeps failing is disabled automatically and can be re-enabled here once
 * the reseller has fixed it.
 */
export function PartnerWebhooksPanel({ userId }: { userId: number }) {
    const [webhooks, setWebhooks] = useState<PartnerWebhook[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [creating, setCreating] = useState(false)
    const [secret, setSecret] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const [name, setName] = useState("")
    const [url, setUrl] = useState("")
    const [events, setEvents] = useState<PartnerEvent[]>([...PARTNER_EVENTS])

    const load = useCallback(async () => {
        try {
            const data = await listPartnerWebhooks(userId)
            setWebhooks(data.webhooks)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load webhooks")
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => { load() }, [load])

    function toggleEvent(event: PartnerEvent) {
        setEvents(prev => prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event])
    }

    async function handleCreate() {
        setError(null)
        if (!name.trim() || !url.trim()) return setError("Name and URL are both required")
        if (!events.length) return setError("Pick at least one event")

        setCreating(true)
        try {
            const created = await createPartnerWebhook({ userId, name: name.trim(), url: url.trim(), events })
            setSecret(created.secret)
            setShowForm(false)
            setName("")
            setUrl("")
            setEvents([...PARTNER_EVENTS])
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create webhook")
        } finally {
            setCreating(false)
        }
    }

    async function act(fn: () => Promise<void>) {
        setError(null)
        try {
            await fn()
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Action failed")
        }
    }

    async function copySecret() {
        if (!secret) return
        await navigator.clipboard.writeText(secret)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Webhook className="h-5 w-5" />
                    Webhooks
                </CardTitle>
                <CardDescription>
                    Events POSTed to this account&apos;s own endpoints, signed with a shared secret.
                    An endpoint that fails repeatedly is disabled automatically.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {error && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        {error}
                    </div>
                )}

                {secret && (
                    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                        <p className="text-sm font-medium text-amber-900">
                            Signing secret — copy it now, it cannot be shown again.
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 break-all rounded border border-amber-200 bg-white px-2 py-1.5 font-mono text-xs">
                                {secret}
                            </code>
                            <Button type="button" variant="outline" onClick={copySecret}>
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                        <button type="button" onClick={() => setSecret(null)} className="text-xs text-amber-800 underline">
                            I have saved it
                        </button>
                    </div>
                )}

                {loading ? (
                    <p className="text-sm text-slate-500">Loading webhooks…</p>
                ) : webhooks.length === 0 ? (
                    <p className="text-sm text-slate-500">No webhooks registered.</p>
                ) : (
                    <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                        {webhooks.map(w => (
                            <div key={w.id} className="flex items-start justify-between gap-4 p-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-900">{w.name}</span>
                                        {!w.isActive && (
                                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">
                                                {w.disabledAt ? "disabled" : "paused"}
                                            </span>
                                        )}
                                    </div>
                                    <code className="block truncate font-mono text-xs text-slate-500">{w.url}</code>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {w.events.map(e => (
                                            <span key={e} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                                                {e}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {w.lastSuccessAt ? `last delivered ${formatDateTimeDMY(w.lastSuccessAt)}` : "never delivered"}
                                        {w.failureCount > 0 ? ` · ${w.failureCount} consecutive failures` : ""}
                                    </p>
                                    <Deliveries webhookId={w.id} />
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => act(() => setPartnerWebhookActive(w.id, !w.isActive))}
                                        title={w.isActive ? "Pause deliveries" : "Re-enable"}
                                    >
                                        {w.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => act(() => deletePartnerWebhook(w.id))}
                                        className="text-red-600 hover:text-red-700"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {showForm ? (
                    <div className="space-y-4 rounded-md border border-slate-200 p-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Acme order system" maxLength={80} />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Endpoint URL</label>
                                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.acme.com/hooks/qc" />
                            </div>
                        </div>

                        <div>
                            <p className="mb-2 text-sm font-medium text-slate-700">Events</p>
                            {PARTNER_EVENTS.map(event => (
                                <label key={event} className="flex cursor-pointer items-start gap-2 py-0.5">
                                    <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={events.includes(event)}
                                        onChange={() => toggleEvent(event)}
                                    />
                                    <span className="text-sm text-slate-700">
                                        <code className="text-xs">{event}</code>
                                        <span className="block text-xs text-slate-500">
                                            {PARTNER_EVENT_DESCRIPTIONS[event]}
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <Button type="button" onClick={handleCreate} disabled={creating}>
                                {creating ? "Creating…" : "Create webhook"}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button type="button" variant="outline" onClick={() => setShowForm(true)}>
                        <Plus className="mr-1 h-4 w-4" />
                        New webhook
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}

/** Recent delivery attempts — what to check when a reseller says an event never arrived. */
function Deliveries({ webhookId }: { webhookId: number }) {
    const [deliveries, setDeliveries] = useState<PartnerWebhookDelivery[] | null>(null)
    const [loading, setLoading] = useState(false)

    async function load() {
        setLoading(true)
        try {
            const data = await listPartnerWebhookDeliveries(webhookId)
            setDeliveries(data.deliveries)
        } catch {
            setDeliveries([])
        } finally {
            setLoading(false)
        }
    }

    if (!deliveries) {
        return (
            <button
                type="button"
                onClick={load}
                disabled={loading}
                className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
                <History className="h-3 w-3" />
                {loading ? "Loading…" : "Recent deliveries"}
            </button>
        )
    }

    if (deliveries.length === 0) {
        return <p className="mt-1 text-xs text-slate-500">No deliveries yet.</p>
    }

    return (
        <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
            {deliveries.slice(0, 5).map(d => (
                <li key={d.id}>
                    <span
                        className={
                            d.status === "delivered"
                                ? "text-green-600"
                                : d.status === "failed"
                                    ? "text-red-600"
                                    : "text-amber-600"
                        }
                    >
                        {d.status}
                    </span>{" "}
                    <span className="font-mono">{d.event}</span>
                    {d.responseCode ? ` · HTTP ${d.responseCode}` : ""}
                    {d.attempts > 1 ? ` · ${d.attempts} attempts` : ""}
                    {d.createdAt ? ` · ${formatDateTimeDMY(d.createdAt)}` : ""}
                </li>
            ))}
        </ul>
    )
}
