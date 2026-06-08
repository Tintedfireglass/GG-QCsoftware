"use client"

import React, { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import {
    getSmsProviders,
    saveSmsProvider,
    activateSmsProvider,
    deleteSmsProvider,
    sendTestSms,
    SmsProvider,
} from "@/lib/api"
import { SMS_PROVIDER_SPECS } from "@/lib/shared/sms/provider-specs"
import { Input } from "@/components/ui/input"
import { MessageSquare, Save, RefreshCw, Trash2, CheckCircle2, CircleDashed, Send, AlertTriangle } from "lucide-react"

type FieldValues = Record<string, string>

export default function SmsSettingsPage() {
    const router = useRouter()
    const { user, isLoading: authLoading } = useAuth()

    const [providers, setProviders] = useState<SmsProvider[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    // Per-provider form state, keyed by provider id (e.g. "msg91", "grow_infinity").
    const [form, setForm] = useState<Record<string, FieldValues>>({})
    const [makeActive, setMakeActive] = useState<Record<string, boolean>>({})
    const [savingId, setSavingId] = useState<string | null>(null)

    // Test send
    const [testPhone, setTestPhone] = useState("")
    const [testCc, setTestCc] = useState("91")
    const [testing, setTesting] = useState(false)

    useEffect(() => {
        if (!authLoading && user && user.role !== "SuperAdmin") router.replace("/dashboard")
    }, [authLoading, user, router])

    const findProvider = useCallback(
        (id: string) => providers.find((p) => p.provider === id),
        [providers]
    )

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await getSmsProviders()
            setProviders(data.providers)
            const nextForm: Record<string, FieldValues> = {}
            const nextActive: Record<string, boolean> = {}
            for (const spec of SMS_PROVIDER_SPECS) {
                const existing = data.providers.find((p) => p.provider === spec.id)
                nextForm[spec.id] = {}
                for (const f of spec.fields) {
                    nextForm[spec.id][f.key] = f.secret ? "" : existing?.config?.[f.key] || ""
                }
                nextActive[spec.id] = existing?.isActive ?? false
            }
            setForm(nextForm)
            setMakeActive(nextActive)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load SMS providers")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const setField = (providerId: string, key: string, value: string) =>
        setForm((prev) => ({ ...prev, [providerId]: { ...prev[providerId], [key]: value } }))

    const onSave = async (providerId: string) => {
        setSavingId(providerId)
        setError(null)
        setNotice(null)
        try {
            const cfg = form[providerId] || {}
            // Blank secret fields are dropped so the saved secret is preserved.
            const config: Record<string, string | undefined> = {}
            for (const f of SMS_PROVIDER_SPECS.find((s) => s.id === providerId)?.fields ?? []) {
                const v = cfg[f.key] ?? ""
                if (f.secret && v === "") continue
                config[f.key] = v
            }
            await saveSmsProvider(providerId, config, makeActive[providerId] ?? false)
            setNotice(`${providerId} settings saved.`)
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed")
        } finally {
            setSavingId(null)
        }
    }

    const onActivate = async (id: number) => {
        try {
            await activateSmsProvider(id)
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Activate failed")
        }
    }

    const onDelete = async (id: number) => {
        if (!confirm("Delete this SMS provider configuration?")) return
        try {
            await deleteSmsProvider(id)
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Delete failed")
        }
    }

    const onTest = async (e: React.FormEvent) => {
        e.preventDefault()
        setTesting(true)
        setError(null)
        setNotice(null)
        try {
            await sendTestSms(testPhone.trim(), testCc.trim() || undefined)
            setNotice(`Test OTP sent to ${testPhone}.`)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Test send failed")
        } finally {
            setTesting(false)
        }
    }

    return (
        <div className="p-8 max-w-3xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">SMS Settings</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Providers used to deliver login OTPs to the mobile app. The one marked active is used.
                    </p>
                </div>
                <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-md border border-slate-200">
                    <RefreshCw className="h-4 w-4" /> Refresh
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}
            {notice && (
                <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
                </div>
            )}

            {SMS_PROVIDER_SPECS.map((spec) => {
                const existing = findProvider(spec.id)
                return (
                    <div key={spec.id} className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-[var(--brand-purple)]" /> {spec.label}
                            </h2>
                            {existing ? (
                                existing.isActive ? (
                                    <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                                        <CheckCircle2 className="h-4 w-4" /> Active
                                    </span>
                                ) : (
                                    <button type="button" onClick={() => onActivate(existing.id)} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
                                        <CircleDashed className="h-4 w-4" /> Set active
                                    </button>
                                )
                            ) : (
                                <span className="text-xs text-slate-400">Not configured</span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {spec.fields.map((f) => {
                                const saved = existing?.secretsPresent?.[f.key]
                                return (
                                    <label key={f.key} className="space-y-1 block">
                                        <span className="text-xs font-medium text-slate-600">
                                            {f.label}
                                            {f.secret && saved && <span className="text-slate-400"> (saved — blank keeps it)</span>}
                                            {!f.required && <span className="text-slate-400"> (optional)</span>}
                                        </span>
                                        <Input
                                            type={f.secret ? "password" : "text"}
                                            autoComplete="off"
                                            value={form[spec.id]?.[f.key] ?? ""}
                                            onChange={(e) => setField(spec.id, f.key, e.target.value)}
                                            placeholder={f.secret && saved ? "••••••••" : f.placeholder || ""}
                                        />
                                    </label>
                                )
                            })}
                        </div>

                        {spec.note && <p className="text-xs text-slate-400">{spec.note}</p>}

                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={makeActive[spec.id] ?? false}
                                    onChange={(e) => setMakeActive((prev) => ({ ...prev, [spec.id]: e.target.checked }))}
                                />
                                Use as active SMS provider
                            </label>
                            <div className="flex items-center gap-2">
                                {existing && (
                                    <button type="button" onClick={() => onDelete(existing.id)} className="p-2 rounded text-rose-500 hover:bg-rose-50" title="Delete">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onSave(spec.id)}
                                    disabled={savingId === spec.id}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--brand-purple)] rounded-md disabled:opacity-60"
                                >
                                    {savingId === spec.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    {savingId === spec.id ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })}

            {/* Test send */}
            <form onSubmit={onTest} className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Send a test OTP</h2>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600 block">Country code</span>
                        <Input value={testCc} onChange={(e) => setTestCc(e.target.value)} placeholder="91" className="w-24" />
                    </label>
                    <label className="space-y-1 flex-1 min-w-[200px]">
                        <span className="text-xs font-medium text-slate-600 block">Phone number</span>
                        <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="9876543210" />
                    </label>
                    <button type="submit" disabled={testing || !testPhone.trim()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-md disabled:opacity-60">
                        {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {testing ? "Sending…" : "Send test"}
                    </button>
                </div>
                <p className="text-xs text-slate-400">Sends a throwaway code through the active provider to verify delivery.</p>
            </form>

            {loading && <p className="text-sm text-slate-500">Loading…</p>}
        </div>
    )
}
