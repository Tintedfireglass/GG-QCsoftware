"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings, Shield, CheckCircle2, Mail, FileText, Image as ImageIcon, Upload, Trash2 } from "lucide-react"
import Link from "next/link"
import { formatDateTimeDMY } from "@/lib/utils"

interface GeneralSettings {
    siteName: string
    supportEmail: string
    companyName: string
    companyAddress: string
    websiteUrl: string
}

const FIELDS: { key: keyof GeneralSettings; label: string; placeholder: string; help?: string }[] = [
    { key: "siteName", label: "Site / Brand name", placeholder: "Pramaan", help: "Used everywhere the product is named — UI, reports, PDFs, emails and payment checkouts." },
    { key: "supportEmail", label: "Support email", placeholder: "support@pramaan.gadgetguruz.com", help: "Where customers are told to reach you." },
    { key: "companyName", label: "Company (legal) name", placeholder: "GadgetGuruz Pvt. Ltd." },
    { key: "companyAddress", label: "Company address", placeholder: "City, State, Country" },
    { key: "websiteUrl", label: "Public website URL", placeholder: "https://example.com", help: "Separate marketing/store site, linked from the customer login and checkout pages. This dashboard's own URL is not configurable here — it comes from the deployment." },
]

const empty: GeneralSettings = { siteName: "", supportEmail: "", companyName: "", companyAddress: "", websiteUrl: "" }

type AssetKind = "logo" | "favicon" | "loginImage"

const ASSETS: { kind: AssetKind; label: string; help: string }[] = [
    { kind: "logo", label: "Logo / wordmark", help: "Sidebar, login screens and report headers. PNG or JPEG (SVG works in the UI but not in exported PDFs)." },
    { kind: "favicon", label: "Favicon", help: "Browser tab icon. PNG or ICO, square." },
    { kind: "loginImage", label: "Login illustration", help: "Artwork beside the login and register forms." },
]

interface BrandingState {
    storageConfigured: boolean
    assets: Record<AssetKind, string>
}

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

    const [branding, setBranding] = useState<BrandingState | null>(null)
    const [uploading, setUploading] = useState<AssetKind | null>(null)

    async function load() {
        setLoading(true)
        setError(null)
        try {
            const token = localStorage.getItem("qc_token")
            const [sRes, lRes, bRes] = await Promise.all([
                fetch("/api/admin/settings", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/admin/legal", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/admin/branding", { headers: { Authorization: `Bearer ${token}` } }),
            ])
            if (!sRes.ok) throw new Error("Failed to load settings")
            const data = await sRes.json()
            setForm({ ...empty, ...data.settings })
            if (lRes.ok) {
                const ldata = await lRes.json()
                setLegal({ ...emptyLegal, ...ldata.legal })
            }
            if (bRes.ok) setBranding(await bRes.json())
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

    /** Upload a replacement asset, or pass no file to revert to the bundled default. */
    async function saveAsset(kind: AssetKind, file: File | null) {
        setUploading(kind)
        setError(null)
        try {
            const token = localStorage.getItem("qc_token")
            let res: Response
            if (file) {
                const body = new FormData()
                body.append("kind", kind)
                body.append("file", file)
                res = await fetch("/api/admin/branding", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body,
                })
            } else {
                res = await fetch(`/api/admin/branding?kind=${kind}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                })
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.message || data.error || "Failed to update branding")
            }
            const data = await res.json()
            setBranding((prev) =>
                prev ? { ...prev, assets: { ...prev.assets, [kind]: data.url || "" } } : prev
            )
            // The logo lives in the server-rendered layout, so a reload is what
            // actually swaps it everywhere.
            setTimeout(() => window.location.reload(), 600)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update branding")
        } finally {
            setUploading(null)
        }
    }

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
                        <ImageIcon className="h-5 w-5" />
                        Branding &amp; Artwork
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading...</div>
                    ) : branding && !branding.storageConfigured ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                            Object storage isn&apos;t configured, so artwork can&apos;t be uploaded. Set the
                            <code className="mx-1">SPACES_*</code> environment variables to enable it — the bundled
                            default artwork is used until then.
                        </div>
                    ) : (
                        ASSETS.map((asset) => {
                            const url = branding?.assets[asset.kind] || ""
                            return (
                                <div key={asset.kind} className="flex items-start gap-4">
                                    <div className="h-16 w-24 shrink-0 rounded border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                                        {url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={url} alt={asset.label} className="max-h-full max-w-full object-contain" />
                                        ) : (
                                            <span className="text-[10px] text-slate-400 text-center px-1">Default</span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <label className="block text-sm font-medium text-slate-700">{asset.label}</label>
                                        <p className="text-xs text-slate-500 mt-0.5">{asset.help}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <label className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                                                <Upload className="h-3.5 w-3.5" />
                                                {uploading === asset.kind ? "Uploading..." : "Upload"}
                                                <input
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                                                    className="hidden"
                                                    disabled={uploading !== null}
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0]
                                                        // Reset so re-picking the same file fires change again.
                                                        e.target.value = ""
                                                        if (file) saveAsset(asset.kind, file)
                                                    }}
                                                />
                                            </label>
                                            {url && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={uploading !== null}
                                                    onClick={() => saveAsset(asset.kind, null)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Reset
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })
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
                                    <p className="text-xs text-slate-500 mt-1">Last updated {formatDateTimeDMY(legal.termsUpdatedAt)}</p>
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
                                    <p className="text-xs text-slate-500 mt-1">Last updated {formatDateTimeDMY(legal.privacyUpdatedAt)}</p>
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
