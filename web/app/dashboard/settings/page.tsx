"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings, Shield, CheckCircle2, Mail, FileText } from "lucide-react"
import Link from "next/link"

interface GeneralSettings {
    siteName: string
    supportEmail: string
    companyName: string
    companyAddress: string
    loginUrl: string
}

const FIELDS: { key: keyof GeneralSettings; label: string; placeholder: string; help?: string }[] = [
    { key: "siteName", label: "Site / Brand name", placeholder: "Pramaan", help: "Shown in emails and across the UI." },
    { key: "supportEmail", label: "Support email", placeholder: "support@pramaan.gadgetguruz.com", help: "Where customers are told to reach you." },
    { key: "companyName", label: "Company (legal) name", placeholder: "GadgetGuruz Pvt. Ltd." },
    { key: "companyAddress", label: "Company address", placeholder: "City, State, Country" },
    { key: "loginUrl", label: "Customer portal URL", placeholder: "https://app.pramaan.com/customer/account", help: "Account link used in purchase emails." },
]

const empty: GeneralSettings = { siteName: "", supportEmail: "", companyName: "", companyAddress: "", loginUrl: "" }

interface LegalContent {
    termsContent: string
    privacyContent: string
    termsUpdatedAt: string | null
    privacyUpdatedAt: string | null
}

const emptyLegal: LegalContent = { termsContent: "", privacyContent: "", termsUpdatedAt: null, privacyUpdatedAt: null }

export default function SystemSettingsPage() {
    const { isSuperAdmin } = useAuth()
    const [form, setForm] = useState<GeneralSettings>(empty)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    const [legal, setLegal] = useState<LegalContent>(emptyLegal)
    const [savingLegal, setSavingLegal] = useState(false)
    const [savedLegal, setSavedLegal] = useState(false)

    async function load() {
        setLoading(true)
        setError(null)
        try {
            const token = localStorage.getItem("qc_token")
            const [sRes, lRes] = await Promise.all([
                fetch("/api/admin/settings", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/admin/legal", { headers: { Authorization: `Bearer ${token}` } }),
            ])
            if (!sRes.ok) throw new Error("Failed to load settings")
            const data = await sRes.json()
            setForm({ ...empty, ...data.settings })
            if (lRes.ok) {
                const ldata = await lRes.json()
                setLegal({ ...emptyLegal, ...ldata.legal })
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load settings")
        } finally {
            setLoading(false)
        }
    }

    async function saveLegal() {
        setSavingLegal(true)
        setError(null)
        setSavedLegal(false)
        try {
            const token = localStorage.getItem("qc_token")
            const res = await fetch("/api/admin/legal", {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ termsContent: legal.termsContent, privacyContent: legal.privacyContent }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || "Failed to save legal content")
            }
            const data = await res.json()
            setLegal({ ...emptyLegal, ...data.legal })
            setSavedLegal(true)
            setTimeout(() => setSavedLegal(false), 2500)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save legal content")
        } finally {
            setSavingLegal(false)
        }
    }

    useEffect(() => {
        if (isSuperAdmin()) load()
    }, [])

    async function save() {
        setSaving(true)
        setError(null)
        setSaved(false)
        try {
            const token = localStorage.getItem("qc_token")
            const res = await fetch("/api/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(form),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || "Failed to save settings")
            }
            const data = await res.json()
            setForm({ ...empty, ...data.settings })
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save settings")
        } finally {
            setSaving(false)
        }
    }

    if (!isSuperAdmin()) {
        return (
            <div className="p-8 text-center">
                <Shield className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
                <p className="text-slate-600 mt-2">Only Super Admins can manage system settings.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
                <p className="text-slate-500 mt-1">General branding, company details, and legal content used across emails, the storefront, and the mobile app.</p>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        General
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading settings...</div>
                    ) : (
                        <>
                            {FIELDS.map((f) => (
                                <div key={f.key}>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
                                    <Input
                                        type="text"
                                        placeholder={f.placeholder}
                                        value={form[f.key]}
                                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                                    />
                                    {f.help && <p className="text-xs text-slate-500 mt-1">{f.help}</p>}
                                </div>
                            ))}
                            <div className="flex items-center gap-3 pt-2">
                                <Button
                                    onClick={save}
                                    disabled={saving}
                                    className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white"
                                >
                                    {saving ? "Saving..." : "Save Settings"}
                                </Button>
                                {saved && (
                                    <span className="inline-flex items-center gap-1 text-sm text-green-600">
                                        <CheckCircle2 className="h-4 w-4" /> Saved
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Legal Content
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading...</div>
                    ) : (
                        <>
                            <p className="text-xs text-slate-500">
                                Served to the mobile app at <code>/api/mobile/legal</code> and shown in-app under Terms &amp; Privacy.
                            </p>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Terms &amp; Conditions</label>
                                <textarea
                                    className="flex min-h-[180px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder="Terms & Conditions text or HTML…"
                                    value={legal.termsContent}
                                    onChange={(e) => setLegal({ ...legal, termsContent: e.target.value })}
                                />
                                {legal.termsUpdatedAt && (
                                    <p className="text-xs text-slate-500 mt-1">Last updated {new Date(legal.termsUpdatedAt).toLocaleString()}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Privacy Policy</label>
                                <textarea
                                    className="flex min-h-[180px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder="Privacy Policy text or HTML…"
                                    value={legal.privacyContent}
                                    onChange={(e) => setLegal({ ...legal, privacyContent: e.target.value })}
                                />
                                {legal.privacyUpdatedAt && (
                                    <p className="text-xs text-slate-500 mt-1">Last updated {new Date(legal.privacyUpdatedAt).toLocaleString()}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-3 pt-2">
                                <Button
                                    onClick={saveLegal}
                                    disabled={savingLegal}
                                    className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white"
                                >
                                    {savingLegal ? "Saving..." : "Save Legal Content"}
                                </Button>
                                {savedLegal && (
                                    <span className="inline-flex items-center gap-1 text-sm text-green-600">
                                        <CheckCircle2 className="h-4 w-4" /> Saved
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <Card className="border-slate-200 bg-slate-50">
                <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                        <Mail className="h-5 w-5 text-slate-400" />
                        Looking for email providers &amp; templates?
                    </div>
                    <Link href="/dashboard/email">
                        <Button variant="outline" size="sm">Email Settings</Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    )
}
