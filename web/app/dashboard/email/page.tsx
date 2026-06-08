"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Mail, Shield, Plus, CheckCircle2, Trash2, Pencil, Eye, EyeOff,
    Send, FileText, Server, RotateCcw,
} from "lucide-react"
import { formatDbDateTime } from "@/lib/utils"

type Tab = "providers" | "templates" | "test"

// ── shared helpers ─────────────────────────────────────────────────────────────
function authFetch(url: string, init?: RequestInit) {
    const token = localStorage.getItem("qc_token")
    return fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    })
}

// ── Providers ──────────────────────────────────────────────────────────────────
interface Provider {
    id: number
    provider: string
    isActive: boolean
    senderEmail: string
    senderName: string
    host: string
    port: number | string
    secure: boolean
    user: string
    hasApiKey: boolean
    hasPass: boolean
    createdAt: string
}

const emptyForm = {
    provider: "brevo",
    apiKey: "",
    host: "",
    port: "587",
    secure: false,
    user: "",
    pass: "",
    senderEmail: "",
    senderName: "",
    isActive: false,
}
type FormState = typeof emptyForm

function ProvidersTab() {
    const [providers, setProviders] = useState<Provider[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [editId, setEditId] = useState<number | null>(null)
    const [form, setForm] = useState<FormState>(emptyForm)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [deleteId, setDeleteId] = useState<number | null>(null)
    const [showSecret, setShowSecret] = useState(false)

    async function load() {
        setLoading(true)
        try {
            const res = await authFetch("/api/admin/email/providers")
            if (!res.ok) throw new Error("Failed to load providers")
            setProviders((await res.json()).providers || [])
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load providers")
        } finally {
            setLoading(false)
        }
    }
    useEffect(() => { load() }, [])

    function reset() {
        setShowForm(false); setEditId(null); setForm(emptyForm); setFormError(null); setShowSecret(false)
    }

    function openEdit(p: Provider) {
        // Secrets are never returned; leave blank to keep existing.
        setEditId(p.id)
        setForm({
            provider: p.provider,
            apiKey: "",
            host: p.host || "",
            port: String(p.port || "587"),
            secure: !!p.secure,
            user: p.user || "",
            pass: "",
            senderEmail: p.senderEmail || "",
            senderName: p.senderName || "",
            isActive: p.isActive,
        })
        setShowForm(true)
    }

    async function save() {
        setSaving(true); setFormError(null)
        try {
            const config: Record<string, unknown> = {
                senderEmail: form.senderEmail,
                senderName: form.senderName,
            }
            if (form.provider === "brevo") {
                config.apiKey = form.apiKey
            } else {
                config.host = form.host
                config.port = form.port
                config.secure = form.secure
                config.user = form.user
                config.pass = form.pass
            }
            const res = await authFetch(
                editId ? `/api/admin/email/providers/${editId}` : "/api/admin/email/providers",
                {
                    method: editId ? "PATCH" : "POST",
                    body: JSON.stringify(
                        editId
                            ? { config, isActive: form.isActive }
                            : { provider: form.provider, config, isActive: form.isActive }
                    ),
                }
            )
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to save provider")
            reset(); load()
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Failed to save provider")
        } finally {
            setSaving(false)
        }
    }

    async function activate(id: number) {
        const res = await authFetch(`/api/admin/email/providers/${id}`, { method: "PATCH", body: JSON.stringify({ activate: true }) })
        if (res.ok) load(); else setError("Failed to activate provider")
    }
    async function remove(id: number) {
        const res = await authFetch(`/api/admin/email/providers/${id}`, { method: "DELETE" })
        if (res.ok) { setDeleteId(null); load() } else setError("Failed to delete provider")
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Configure how transactional emails are sent. Only one provider is active at a time.</p>
                <Button onClick={() => (showForm ? reset() : setShowForm(true))} className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white">
                    <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "Add Provider"}
                </Button>
            </div>

            {!loading && providers.length > 0 && !providers.some(p => p.isActive) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                    No active provider — emails fall back to environment variables (if configured) or are skipped.
                </div>
            )}
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>}

            {showForm && (
                <Card className="border-2 border-[var(--brand-purple)]">
                    <CardHeader><CardTitle>{editId ? "Edit Provider" : "Add Provider"}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
                            <select
                                value={form.provider}
                                disabled={!!editId}
                                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                                className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm disabled:bg-slate-100"
                            >
                                <option value="brevo">Brevo (transactional API)</option>
                                <option value="smtp">SMTP (any server)</option>
                            </select>
                        </div>

                        {form.provider === "brevo" ? (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Brevo API Key</label>
                                <div className="relative">
                                    <Input
                                        type={showSecret ? "text" : "password"}
                                        placeholder={editId ? "Leave blank to keep current" : "xkeysib-..."}
                                        value={form.apiKey}
                                        onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                                    />
                                    <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">From Brevo → SMTP &amp; API → API Keys.</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2 sm:col-span-1">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Host</label>
                                        <Input type="text" placeholder="smtp-relay.brevo.com" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Port</label>
                                        <Input type="text" placeholder="587" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                                    Use TLS/SSL (secure) — enable for port 465
                                </label>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Username</label>
                                    <Input type="text" placeholder="apikey or username" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Password</label>
                                    <div className="relative">
                                        <Input type={showSecret ? "text" : "password"} placeholder={editId ? "Leave blank to keep current" : "password"} value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} />
                                        <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Sender Email</label>
                                <Input type="text" placeholder="no-reply@pramaan.com" value={form.senderEmail} onChange={(e) => setForm({ ...form, senderEmail: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Sender Name <span className="text-slate-400">(optional)</span></label>
                                <Input type="text" placeholder="Pramaan" value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} />
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                            Make this the active provider (deactivates others)
                        </label>

                        {formError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{formError}</div>}
                        <div className="flex gap-2 pt-1">
                            <Button onClick={save} disabled={saving} className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white">
                                {saving ? "Saving..." : editId ? "Update Provider" : "Save Provider"}
                            </Button>
                            <Button variant="outline" onClick={reset}>Cancel</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" /> Configured Providers</CardTitle></CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading...</div>
                    ) : providers.length === 0 ? (
                        <div className="text-center py-12">
                            <Mail className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-500">No email providers configured</p>
                            <p className="text-sm text-slate-400">Add Brevo or an SMTP server to send transactional emails.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {providers.map((p) => (
                                <div key={p.id} className={`flex items-center justify-between p-4 rounded-lg border-2 ${p.isActive ? "border-green-200 bg-green-50" : "border-slate-200"}`}>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-slate-900 capitalize">{p.provider}</h3>
                                            {p.isActive && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"><CheckCircle2 className="h-3 w-3" /> Active</span>}
                                            {(p.hasApiKey || p.hasPass) && <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Credentials ✓</span>}
                                        </div>
                                        <p className="text-sm text-slate-500">
                                            {p.senderName ? `${p.senderName} <${p.senderEmail}>` : p.senderEmail || "No sender set"} • Added {formatDbDateTime(p.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!p.isActive && (
                                            <Button variant="outline" size="sm" onClick={() => activate(p.id)} className="text-green-600 hover:border-green-600">
                                                <CheckCircle2 className="h-4 w-4 mr-1" /> Activate
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                                        {deleteId === p.id ? (
                                            <div className="flex items-center gap-1">
                                                <Button variant="destructive" size="sm" onClick={() => remove(p.id)}>Confirm</Button>
                                                <Button variant="ghost" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
                                            </div>
                                        ) : (
                                            <Button variant="ghost" size="sm" onClick={() => setDeleteId(p.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

// ── Templates ──────────────────────────────────────────────────────────────────
interface TemplateListItem { key: string; name: string; description: string; customized: boolean; updatedAt: string | null }
interface TemplateVar { name: string; description: string; sample: string }
interface TemplateDetail {
    key: string; name: string; description: string; variables: TemplateVar[]; customized: boolean
    subject: string; html: string; text: string
    default: { subject: string; html: string; text: string }
}

function TemplatesTab() {
    const [list, setList] = useState<TemplateListItem[]>([])
    const [active, setActive] = useState<string | null>(null)
    const [detail, setDetail] = useState<TemplateDetail | null>(null)
    const [draft, setDraft] = useState<{ subject: string; html: string; text: string }>({ subject: "", html: "", text: "" })
    const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function loadList() {
        setLoading(true)
        try {
            const res = await authFetch("/api/admin/email/templates")
            setList((await res.json()).templates || [])
        } finally { setLoading(false) }
    }
    useEffect(() => { loadList() }, [])

    async function open(key: string) {
        setActive(key); setPreview(null); setError(null)
        const res = await authFetch(`/api/admin/email/templates/${key}`)
        const d: TemplateDetail = (await res.json()).template
        setDetail(d)
        setDraft({ subject: d.subject, html: d.html, text: d.text })
    }

    async function runPreview() {
        if (!active) return
        const res = await authFetch(`/api/admin/email/templates/${active}/preview`, { method: "POST", body: JSON.stringify(draft) })
        setPreview((await res.json()).preview)
    }

    async function save() {
        if (!active) return
        setSaving(true); setError(null)
        try {
            const res = await authFetch(`/api/admin/email/templates/${active}`, { method: "PUT", body: JSON.stringify(draft) })
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to save template")
            const d: TemplateDetail = (await res.json()).template
            setDetail(d); setDraft({ subject: d.subject, html: d.html, text: d.text })
            loadList()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save template")
        } finally { setSaving(false) }
    }

    async function resetDefault() {
        if (!active) return
        const res = await authFetch(`/api/admin/email/templates/${active}`, { method: "DELETE" })
        const d: TemplateDetail = (await res.json()).template
        setDetail(d); setDraft({ subject: d.subject, html: d.html, text: d.text }); setPreview(null); loadList()
    }

    if (active && detail) {
        const dirty = draft.subject !== detail.subject || draft.html !== detail.html || draft.text !== detail.text
        return (
            <div className="space-y-4">
                <button onClick={() => { setActive(null); setDetail(null); setPreview(null) }} className="text-sm text-[var(--brand-purple)] hover:underline">← All templates</button>
                <div>
                    <h2 className="text-xl font-bold text-slate-900">{detail.name}</h2>
                    <p className="text-sm text-slate-500">{detail.description}</p>
                </div>
                {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}

                <div className="grid lg:grid-cols-2 gap-4">
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                            <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">HTML body</label>
                            <textarea value={draft.html} onChange={(e) => setDraft({ ...draft, html: e.target.value })}
                                className="w-full h-64 px-3 py-2 border border-slate-200 rounded-md text-sm font-mono" spellCheck={false} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Plain-text body</label>
                            <textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                                className="w-full h-32 px-3 py-2 border border-slate-200 rounded-md text-sm font-mono" spellCheck={false} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={save} disabled={saving || !dirty} className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white">
                                {saving ? "Saving..." : "Save Template"}
                            </Button>
                            <Button variant="outline" onClick={runPreview}><Eye className="h-4 w-4 mr-1" /> Preview</Button>
                            {detail.customized && (
                                <Button variant="ghost" onClick={resetDefault} className="text-slate-600"><RotateCcw className="h-4 w-4 mr-1" /> Reset to default</Button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Card className="bg-slate-50 border-slate-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm">Variables</CardTitle></CardHeader>
                            <CardContent className="space-y-1">
                                <p className="text-xs text-slate-500 mb-2">
                                    Insert with <code className="bg-slate-200 px-1 rounded">{"{{name}}"}</code>. Conditionals:{" "}
                                    <code className="bg-slate-200 px-1 rounded">{"{{#if var}}…{{/if}}"}</code>,{" "}
                                    <code className="bg-slate-200 px-1 rounded">{"{{#unless var}}…{{/unless}}"}</code>.
                                </p>
                                {detail.variables.map((v) => (
                                    <div key={v.name} className="text-xs flex gap-2">
                                        <code className="bg-white border border-slate-200 px-1 rounded text-[var(--brand-purple)] shrink-0">{`{{${v.name}}}`}</code>
                                        <span className="text-slate-500">{v.description}</span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        {preview && (
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm">Preview (sample data)</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-xs text-slate-500 mb-1">Subject</p>
                                    <p className="text-sm font-medium mb-3">{preview.subject}</p>
                                    <p className="text-xs text-slate-500 mb-1">Body</p>
                                    <iframe title="preview" srcDoc={preview.html} className="w-full h-80 border border-slate-200 rounded bg-white" />
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500">Edit the subject and body of transactional emails. Unedited templates use the built-in default.</p>
            {loading ? (
                <div className="text-center py-8 text-slate-500">Loading templates...</div>
            ) : (
                <div className="space-y-3">
                    {list.map((t) => (
                        <div key={t.key} className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-[var(--brand-purple)] transition-colors">
                            <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-slate-400" />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-slate-900">{t.name}</h3>
                                        {t.customized
                                            ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">Customized</span>
                                            : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Default</span>}
                                    </div>
                                    <p className="text-sm text-slate-500">{t.description}</p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => open(t.key)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Test ───────────────────────────────────────────────────────────────────────
function TestTab() {
    const [to, setTo] = useState("")
    const [sending, setSending] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

    async function send() {
        setSending(true); setResult(null)
        try {
            const res = await authFetch("/api/admin/email/test", { method: "POST", body: JSON.stringify({ to }) })
            if (res.ok) setResult({ ok: true, msg: `Test email sent to ${to}. Check the inbox (and spam).` })
            else setResult({ ok: false, msg: (await res.json().catch(() => ({}))).error || "Failed to send test email" })
        } catch {
            setResult({ ok: false, msg: "Failed to send test email" })
        } finally { setSending(false) }
    }

    return (
        <Card className="max-w-xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Send a test email</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-slate-500">Sends a test message through the currently active provider to verify your configuration.</p>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Recipient</label>
                    <Input type="email" placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <Button onClick={send} disabled={sending || !to} className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white">
                    {sending ? "Sending..." : "Send Test"}
                </Button>
                {result && (
                    <div className={`rounded-lg p-3 text-sm border ${result.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                        {result.msg}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// ── Page ────────────────────────────────────────────────────────────────────────
export default function EmailSettingsPage() {
    const { isSuperAdmin } = useAuth()
    const [tab, setTab] = useState<Tab>("providers")

    if (!isSuperAdmin()) {
        return (
            <div className="p-8 text-center">
                <Shield className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
                <p className="text-slate-600 mt-2">Only Super Admins can manage email settings.</p>
            </div>
        )
    }

    const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { id: "providers", label: "Providers", icon: Server },
        { id: "templates", label: "Templates", icon: FileText },
        { id: "test", label: "Test", icon: Send },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Email Settings</h1>
                <p className="text-slate-500 mt-1">Manage your email provider and the templates customers receive.</p>
            </div>

            <div className="flex gap-1 border-b border-slate-200">
                {tabs.map((t) => {
                    const Icon = t.icon
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                                tab === t.id
                                    ? "border-[var(--brand-purple)] text-[var(--brand-purple)]"
                                    : "border-transparent text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            <Icon className="h-4 w-4" /> {t.label}
                        </button>
                    )
                })}
            </div>

            {tab === "providers" && <ProvidersTab />}
            {tab === "templates" && <TemplatesTab />}
            {tab === "test" && <TestTab />}
        </div>
    )
}
