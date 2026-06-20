"use client"

import React, { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getAdminPlans, createPlan, updatePlan, deletePlan, PlanDTO } from "@/lib/api"
import { Plus, X, Package, Pencil, Trash2, Loader2 } from "lucide-react"

const PLATFORMS: { id: string; label: string }[] = [
    { id: "windows", label: "Windows (PC)" },
    { id: "android", label: "Android" },
    { id: "ios", label: "iPhone (iOS)" },
    { id: "mac", label: "Mac" },
]
const PLATFORM_LABELS: Record<string, string> = { windows: "Windows", android: "Android", ios: "iOS", mac: "Mac" }

const DURATION_OPTIONS: { label: string; days: number }[] = [
    { label: "1 month", days: 30 },
    { label: "3 months", days: 90 },
    { label: "6 months", days: 180 },
    { label: "1 year", days: 365 },
    { label: "2 years", days: 730 },
    { label: "3 years", days: 1095 },
]

const durationLabel = (days: number) => {
    const match = DURATION_OPTIONS.find((o) => o.days === days)
    return match ? match.label : `${days}d`
}

type PlatformSel = Record<string, { on: boolean; cap: string }>
const emptySel = (): PlatformSel => ({
    windows: { on: true, cap: "1" },
    android: { on: false, cap: "1" },
    ios: { on: false, cap: "1" },
    mac: { on: false, cap: "1" },
})

export default function PlansPage() {
    const { user } = useAuth()
    const router = useRouter()

    const [plans, setPlans] = useState<PlanDTO[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")
    const [deletingId, setDeletingId] = useState<number | null>(null)

    // Form state
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [features, setFeatures] = useState("")   // one feature per line
    const [allowAutoRenew, setAllowAutoRenew] = useState(false)
    const [price, setPrice] = useState("")           // major units (e.g. rupees)
    const [currency, setCurrency] = useState("INR")
    const [platformSel, setPlatformSel] = useState<PlatformSel>(emptySel())
    const [perpetual, setPerpetual] = useState(true)
    const [durationDays, setDurationDays] = useState("365")
    const [isActive, setIsActive] = useState(true)
    const [sortOrder, setSortOrder] = useState("0")

    useEffect(() => {
        if (!user) { router.push("/login"); return }
        if (user.role !== "SuperAdmin") { router.push("/dashboard"); return }
        fetchPlans()
    }, [user, router])

    const fetchPlans = async () => {
        try {
            setLoading(true)
            const data = await getAdminPlans()
            setPlans(data.plans || [])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load plans")
        } finally {
            setLoading(false)
        }
    }

    const openCreate = () => {
        setEditingId(null)
        setName(""); setDescription(""); setFeatures("")
        setPrice(""); setCurrency("INR"); setPlatformSel(emptySel())
        setPerpetual(true); setDurationDays("365"); setAllowAutoRenew(false); setIsActive(true); setSortOrder("0")
        setError(""); setIsModalOpen(true)
    }

    const openEdit = (p: PlanDTO) => {
        setEditingId(p.id)
        setName(p.name); setDescription(p.description || ""); setFeatures((p.features || []).join("\n"))
        setPrice((p.price_cents / 100).toString()); setCurrency(p.currency)
        const sel = emptySel()
        for (const pl of PLATFORMS) sel[pl.id] = { on: false, cap: "1" }
        for (const [k, v] of Object.entries(p.platform_caps || {})) sel[k] = { on: true, cap: String(v) }
        setPlatformSel(sel)
        setPerpetual(p.duration_days == null); setDurationDays(String(p.duration_days ?? 365))
        setAllowAutoRenew(!!p.allow_auto_renew)
        setIsActive(p.is_active); setSortOrder(String(p.sort_order))
        setError(""); setIsModalOpen(true)
    }

    const togglePlatform = (id: string) =>
        setPlatformSel((prev) => ({ ...prev, [id]: { ...prev[id], on: !prev[id].on } }))
    const setCap = (id: string, cap: string) =>
        setPlatformSel((prev) => ({ ...prev, [id]: { ...prev[id], cap } }))

    const handleSave = async () => {
        setError("")
        if (!name.trim()) { setError("Name is required."); return }

        const priceNum = parseFloat(price)
        if (Number.isNaN(priceNum) || priceNum < 0) { setError("Enter a valid price."); return }

        const selected = PLATFORMS.filter((p) => platformSel[p.id].on)
        if (selected.length === 0) { setError("Select at least one platform."); return }
        const platform_caps: Record<string, number> = {}
        for (const p of selected) {
            const cap = parseInt(platformSel[p.id].cap, 10)
            if (Number.isNaN(cap) || cap < 1) { setError(`Device limit for ${p.label} must be 1 or more.`); return }
            platform_caps[p.id] = cap
        }

        let duration: number | null = null
        if (!perpetual) {
            const d = parseInt(durationDays, 10)
            if (Number.isNaN(d) || d < 1) { setError("Enter a valid duration in days."); return }
            duration = d
        }

        const payload = {
            name: name.trim(),
            description: description.trim() || null,
            price_cents: Math.round(priceNum * 100),
            currency: currency.trim().toUpperCase() || "INR",
            product_scope: selected.map((p) => p.id),
            platform_caps,
            duration_days: duration,
            features: features.split("\n").map((f) => f.trim()).filter(Boolean),
            allow_auto_renew: duration != null && allowAutoRenew,
            is_active: isActive,
            sort_order: parseInt(sortOrder, 10) || 0,
        }

        try {
            setSaving(true)
            if (editingId) await updatePlan(editingId, payload)
            else await createPlan(payload)
            setIsModalOpen(false)
            fetchPlans()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save plan.")
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (p: PlanDTO) => {
        if (!confirm(`Delete plan "${p.name}"? This cannot be undone.`)) return
        try {
            setDeletingId(p.id)
            await deletePlan(p.id)
            fetchPlans()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete plan.")
        } finally {
            setDeletingId(null)
        }
    }

    const fmtPrice = (cents: number, cur: string) =>
        `${cur} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

    if (loading) return <div className="p-8 text-center text-slate-500">Loading plans...</div>

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pricing plans</h1>
                    <p className="text-slate-500 text-sm mt-1">Define the plans customers can purchase. Each plan mints a license with its platforms, device caps, and duration.</p>
                </div>
                <Button
                    className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white px-5 h-11 rounded-lg font-medium shadow-sm"
                    onClick={openCreate}
                >
                    <Plus className="mr-2 h-4 w-4" /> New Plan
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200">
                <div className="hidden md:block relative w-full overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="border-b border-slate-200 bg-white">
                            <tr>
                                <th className="h-12 px-4 font-medium text-slate-900">Plan</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Auto-renew</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Price</th>
                                <th className="h-12 px-4 font-medium text-slate-900">Platforms</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Duration</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Status</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center w-[110px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {plans.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-500">No plans yet. Create one above.</td></tr>
                            ) : plans.map((p) => (
                                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                    <td className="py-4 px-4">
                                        <div className="font-medium text-slate-900 flex items-center gap-2">
                                            <Package className="h-4 w-4 text-[var(--brand-purple)]" /> {p.name}
                                        </div>
                                        {p.description ? <div className="text-xs text-slate-400 mt-0.5">{p.description}</div> : null}
                                    </td>
                                    <td className="py-4 px-4 text-center text-slate-600">
                                        {p.allow_auto_renew ? "Yes" : "—"}
                                    </td>
                                    <td className="py-4 px-4 text-center text-slate-700 whitespace-nowrap">{fmtPrice(p.price_cents, p.currency)}</td>
                                    <td className="py-4 px-4">
                                        <div className="flex flex-wrap gap-1">
                                            {(p.product_scope || []).map((pl) => (
                                                <span key={pl} className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                                    {PLATFORM_LABELS[pl] || pl}{p.platform_caps?.[pl] ? ` ×${p.platform_caps[pl]}` : ""}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-center text-slate-600">{p.duration_days ? durationLabel(p.duration_days) : "Perpetual"}</td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium ${p.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                                            {p.is_active ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center justify-center gap-1">
                                            <button title="Edit" onClick={() => openEdit(p)} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-[var(--brand-purple)] hover:bg-purple-50">
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button title="Delete" onClick={() => handleDelete(p)} disabled={deletingId === p.id} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                                                {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile list */}
                <div className="md:hidden flex flex-col gap-3 p-4">
                    {plans.length === 0 ? (
                        <div className="py-8 text-center text-slate-500">No plans yet.</div>
                    ) : plans.map((p) => (
                        <div key={p.id} className="border border-slate-200 rounded-xl p-4">
                            <div className="flex items-center justify-between">
                                <div className="font-medium text-slate-900">{p.name}</div>
                                <span className="text-sm text-slate-700">{fmtPrice(p.price_cents, p.currency)}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                {p.duration_days ? durationLabel(p.duration_days) : "Perpetual"} · {p.allow_auto_renew ? "Auto-renew" : "No renewal"} · {p.is_active ? "Active" : "Inactive"}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                                {(p.product_scope || []).map((pl) => (
                                    <span key={pl} className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                        {PLATFORM_LABELS[pl] || pl}{p.platform_caps?.[pl] ? ` ×${p.platform_caps[pl]}` : ""}
                                    </span>
                                ))}
                            </div>
                            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
                                <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(p)} disabled={deletingId === p.id} className="text-rose-600">Delete</Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* CREATE / EDIT MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-8 rounded-2xl shadow-xl relative">
                        <button onClick={() => setIsModalOpen(false)} className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100">
                            <X className="h-5 w-5" />
                        </button>
                        <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-6">{editingId ? "Edit plan" : "New plan"}</h2>

                        {error && <div className="mb-5 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{error}</div>}

                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">Name</label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Android Pro – 3 devices" className="h-11" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">Description</label>
                                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="h-11" />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">Features</label>
                                <textarea
                                    value={features}
                                    onChange={(e) => setFeatures(e.target.value)}
                                    rows={4}
                                    placeholder={"One feature per line, e.g.\nUnlimited QC reports\nPriority support\nFleet dashboard"}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)]"
                                />
                                <p className="mt-1 text-xs text-slate-500">One bullet per line — shown on the storefront plan card.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">Price</label>
                                    <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="99" className="h-11" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">Currency</label>
                                    <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-11" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">Platforms &amp; device limits</label>
                                <div className="space-y-2">
                                    {PLATFORMS.map((p) => {
                                        const sel = platformSel[p.id]
                                        return (
                                            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                                                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                                    <input type="checkbox" checked={sel.on} onChange={() => togglePlatform(p.id)}
                                                        className="h-4 w-4 rounded border-slate-300 text-[var(--brand-purple)] focus:ring-[var(--brand-purple)]" />
                                                    <span className="text-sm font-medium text-slate-700">{p.label}</span>
                                                </label>
                                                <Input type="number" min={1} step={1} value={sel.cap} onChange={(e) => setCap(p.id, e.target.value)} disabled={!sel.on}
                                                    className="w-24 h-9 text-sm disabled:opacity-50" title="Device limit" />
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">Duration</label>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 text-sm text-slate-700">
                                        <input type="checkbox" checked={perpetual} onChange={(e) => setPerpetual(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-[var(--brand-purple)]" />
                                        Perpetual
                                    </label>
                                    {!perpetual && (
                                        <select
                                            value={durationDays}
                                            onChange={(e) => setDurationDays(e.target.value)}
                                            className="h-10 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)]"
                                        >
                                            {DURATION_OPTIONS.map((o) => (
                                                <option key={o.days} value={String(o.days)}>{o.label}</option>
                                            ))}
                                            {!DURATION_OPTIONS.some((o) => String(o.days) === durationDays) && (
                                                <option value={durationDays}>{durationDays} days (custom)</option>
                                            )}
                                        </select>
                                    )}
                                </div>
                                {!perpetual && (
                                    <label className="flex items-center gap-2 text-sm text-slate-700 mt-3 cursor-pointer">
                                        <input type="checkbox" checked={allowAutoRenew} onChange={(e) => setAllowAutoRenew(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-[var(--brand-purple)]" />
                                        Offer auto-renewal at checkout
                                    </label>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">Sort order</label>
                                    <Input type="number" step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-11" />
                                </div>
                                <div className="flex items-end">
                                    <label className="flex items-center gap-2 text-sm text-slate-700 h-11">
                                        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-[var(--brand-purple)]" />
                                        Active (visible in storefront)
                                    </label>
                                </div>
                            </div>

                            <Button onClick={handleSave} disabled={saving}
                                className="w-full h-12 rounded-xl bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white font-medium">
                                {saving ? "Saving..." : editingId ? "Save changes" : "Create plan"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
