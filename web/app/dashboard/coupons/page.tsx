"use client"

import React, { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getAdminCoupons, createCoupon, updateCoupon, deleteCoupon, getAdminPlans, CouponDTO, PlanDTO } from "@/lib/api"
import { Plus, X, Ticket, Pencil, Trash2, Loader2 } from "lucide-react"

type DiscountType = "percent" | "fixed"

// ISO string → value for a <input type="datetime-local"> (local time, no seconds).
function toLocalInput(iso: string | null): string {
    if (!iso) return ""
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CouponsPage() {
    const { user } = useAuth()
    const router = useRouter()

    const [coupons, setCoupons] = useState<CouponDTO[]>([])
    const [plans, setPlans] = useState<PlanDTO[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")
    const [deletingId, setDeletingId] = useState<number | null>(null)

    // Form state
    const [code, setCode] = useState("")
    const [description, setDescription] = useState("")
    const [discountType, setDiscountType] = useState<DiscountType>("percent")
    const [discountValue, setDiscountValue] = useState("")     // percent: 1-100 | fixed: major units
    const [maxDiscount, setMaxDiscount] = useState("")         // percent only, major units
    const [currency, setCurrency] = useState("INR")            // fixed only
    const [minOrder, setMinOrder] = useState("")               // major units
    const [maxRedemptions, setMaxRedemptions] = useState("")   // empty = unlimited
    const [perCustomerLimit, setPerCustomerLimit] = useState("1") // empty = unlimited
    const [planIds, setPlanIds] = useState<number[]>([])       // empty = all plans
    const [validFrom, setValidFrom] = useState("")
    const [validUntil, setValidUntil] = useState("")
    const [isActive, setIsActive] = useState(true)
    const [isPublic, setIsPublic] = useState(false)

    useEffect(() => {
        if (!user) { router.push("/login"); return }
        if (user.role !== "SuperAdmin") { router.push("/dashboard"); return }
        fetchData()
    }, [user, router])

    const fetchData = async () => {
        try {
            setLoading(true)
            const [cData, pData] = await Promise.all([getAdminCoupons(), getAdminPlans()])
            setCoupons(cData.coupons || [])
            setPlans(pData.plans || [])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load coupons")
        } finally {
            setLoading(false)
        }
    }

    const openCreate = () => {
        setEditingId(null)
        setCode(""); setDescription(""); setDiscountType("percent"); setDiscountValue("")
        setMaxDiscount(""); setCurrency("INR"); setMinOrder(""); setMaxRedemptions("")
        setPerCustomerLimit("1"); setPlanIds([]); setValidFrom(""); setValidUntil(""); setIsActive(true); setIsPublic(false)
        setError(""); setIsModalOpen(true)
    }

    const openEdit = (c: CouponDTO) => {
        setEditingId(c.id)
        setCode(c.code); setDescription(c.description || ""); setDiscountType(c.discount_type)
        setDiscountValue(c.discount_type === "fixed" ? (c.discount_value / 100).toString() : String(c.discount_value))
        setMaxDiscount(c.max_discount_cents != null ? (c.max_discount_cents / 100).toString() : "")
        setCurrency(c.currency || "INR")
        setMinOrder(c.min_order_cents ? (c.min_order_cents / 100).toString() : "")
        setMaxRedemptions(c.max_redemptions != null ? String(c.max_redemptions) : "")
        setPerCustomerLimit(c.per_customer_limit != null ? String(c.per_customer_limit) : "")
        setPlanIds(c.applicable_plan_ids || [])
        setValidFrom(toLocalInput(c.valid_from)); setValidUntil(toLocalInput(c.valid_until))
        setIsActive(c.is_active); setIsPublic(!!c.is_public)
        setError(""); setIsModalOpen(true)
    }

    const togglePlan = (id: number) =>
        setPlanIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id])

    const handleSave = async () => {
        setError("")
        if (!code.trim()) { setError("Code is required."); return }

        const valNum = parseFloat(discountValue)
        if (Number.isNaN(valNum) || valNum <= 0) { setError("Enter a valid discount value."); return }
        if (discountType === "percent" && (valNum < 1 || valNum > 100)) { setError("Percent must be between 1 and 100."); return }

        const discount_value = discountType === "percent" ? Math.round(valNum) : Math.round(valNum * 100)

        let max_discount_cents: number | null = null
        if (discountType === "percent" && maxDiscount.trim()) {
            const m = parseFloat(maxDiscount)
            if (Number.isNaN(m) || m < 0) { setError("Enter a valid max discount."); return }
            max_discount_cents = Math.round(m * 100)
        }

        const min_order_cents = minOrder.trim() ? Math.round(parseFloat(minOrder) * 100) : 0
        if (Number.isNaN(min_order_cents) || min_order_cents < 0) { setError("Enter a valid minimum order."); return }

        const payload: Record<string, unknown> = {
            code: code.trim().toUpperCase(),
            description: description.trim() || null,
            discount_type: discountType,
            discount_value,
            max_discount_cents,
            currency: discountType === "fixed" ? (currency.trim().toUpperCase() || null) : null,
            min_order_cents,
            max_redemptions: maxRedemptions.trim() ? parseInt(maxRedemptions, 10) : null,
            per_customer_limit: perCustomerLimit.trim() ? parseInt(perCustomerLimit, 10) : null,
            applicable_plan_ids: planIds.length > 0 ? planIds : null,
            valid_from: validFrom ? new Date(validFrom).toISOString() : null,
            valid_until: validUntil ? new Date(validUntil).toISOString() : null,
            is_active: isActive,
            is_public: isPublic,
        }

        if (payload.valid_from && payload.valid_until && new Date(payload.valid_from as string) > new Date(payload.valid_until as string)) {
            setError("Start date must be before end date."); return
        }

        try {
            setSaving(true)
            if (editingId) await updateCoupon(editingId, payload)
            else await createCoupon(payload)
            setIsModalOpen(false)
            fetchData()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save coupon.")
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (c: CouponDTO) => {
        if (!confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return
        try {
            setDeletingId(c.id)
            await deleteCoupon(c.id)
            fetchData()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete coupon.")
        } finally {
            setDeletingId(null)
        }
    }

    const fmtDiscount = (c: CouponDTO) =>
        c.discount_type === "percent"
            ? `${c.discount_value}%${c.max_discount_cents != null ? ` (max ${(c.max_discount_cents / 100).toLocaleString()})` : ""}`
            : `${c.currency || ""} ${(c.discount_value / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

    const fmtUsage = (c: CouponDTO) =>
        c.max_redemptions != null ? `${c.times_redeemed}/${c.max_redemptions}` : `${c.times_redeemed}`

    const planName = (id: number) => plans.find((p) => p.id === id)?.name || `#${id}`

    if (loading) return <div className="p-8 text-center text-slate-500">Loading coupons...</div>

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Discount coupons</h1>
                    <p className="text-slate-500 text-sm mt-1">Create codes customers can apply at checkout. Discounts apply to the first purchase only; auto-renewals charge the full price.</p>
                </div>
                <Button
                    className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white px-5 h-11 rounded-lg font-medium shadow-sm"
                    onClick={openCreate}
                >
                    <Plus className="mr-2 h-4 w-4" /> New Coupon
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200">
                <div className="hidden md:block relative w-full overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="border-b border-slate-200 bg-white">
                            <tr>
                                <th className="h-12 px-4 font-medium text-slate-900">Code</th>
                                <th className="h-12 px-4 font-medium text-slate-900">Discount</th>
                                <th className="h-12 px-4 font-medium text-slate-900">Applies to</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Used</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Validity</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Status</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center w-[110px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {coupons.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-500">No coupons yet. Create one above.</td></tr>
                            ) : coupons.map((c) => (
                                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                    <td className="py-4 px-4">
                                        <div className="font-mono font-medium text-slate-900 flex items-center gap-2">
                                            <Ticket className="h-4 w-4 text-[var(--brand-purple)]" /> {c.code}
                                        </div>
                                        {c.description ? <div className="text-xs text-slate-400 mt-0.5">{c.description}</div> : null}
                                    </td>
                                    <td className="py-4 px-4 text-slate-700 whitespace-nowrap">{fmtDiscount(c)}</td>
                                    <td className="py-4 px-4">
                                        {c.applicable_plan_ids && c.applicable_plan_ids.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {c.applicable_plan_ids.map((id) => (
                                                    <span key={id} className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{planName(id)}</span>
                                                ))}
                                            </div>
                                        ) : <span className="text-xs text-slate-500">All plans</span>}
                                    </td>
                                    <td className="py-4 px-4 text-center text-slate-600">{fmtUsage(c)}</td>
                                    <td className="py-4 px-4 text-center text-slate-600 text-xs whitespace-nowrap">
                                        {c.valid_until ? `until ${new Date(c.valid_until).toLocaleDateString()}` : "No expiry"}
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium ${c.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                                            {c.is_active ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center justify-center gap-1">
                                            <button title="Edit" onClick={() => openEdit(c)} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-[var(--brand-purple)] hover:bg-purple-50">
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button title="Delete" onClick={() => handleDelete(c)} disabled={deletingId === c.id} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                                                {deletingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                    {coupons.length === 0 ? (
                        <div className="py-8 text-center text-slate-500">No coupons yet.</div>
                    ) : coupons.map((c) => (
                        <div key={c.id} className="border border-slate-200 rounded-xl p-4">
                            <div className="flex items-center justify-between">
                                <div className="font-mono font-medium text-slate-900">{c.code}</div>
                                <span className="text-sm text-slate-700">{fmtDiscount(c)}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                Used {fmtUsage(c)} · {c.valid_until ? `until ${new Date(c.valid_until).toLocaleDateString()}` : "No expiry"} · {c.is_active ? "Active" : "Inactive"}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                {c.applicable_plan_ids && c.applicable_plan_ids.length > 0 ? c.applicable_plan_ids.map(planName).join(", ") : "All plans"}
                            </div>
                            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
                                <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>Edit</Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(c)} disabled={deletingId === c.id} className="text-rose-600">Delete</Button>
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
                        <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-6">{editingId ? "Edit coupon" : "New coupon"}</h2>

                        {error && <div className="mb-5 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{error}</div>}

                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">Code</label>
                                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" className="h-11 font-mono" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">Description</label>
                                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional (internal note)" className="h-11" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">Discount type</label>
                                    <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                                        className="w-full h-11 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)]">
                                        <option value="percent">Percentage (%)</option>
                                        <option value="fixed">Fixed amount</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">{discountType === "percent" ? "Percent off" : "Amount off"}</label>
                                    <Input type="number" min={0} step={discountType === "percent" ? 1 : 0.01} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === "percent" ? "10" : "100"} className="h-11" />
                                </div>
                            </div>

                            {discountType === "percent" ? (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">Max discount (optional)</label>
                                    <Input type="number" min={0} step="0.01" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} placeholder="Cap the rupee value, e.g. 500" className="h-11" />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">Currency</label>
                                    <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="INR" className="h-11" />
                                    <p className="mt-1 text-xs text-slate-500">Must match the plan currency to apply.</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">Min order (optional)</label>
                                    <Input type="number" min={0} step="0.01" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="0" className="h-11" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">Total uses (optional)</label>
                                    <Input type="number" min={1} step={1} value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} placeholder="Unlimited" className="h-11" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">Per-customer limit</label>
                                <Input type="number" min={1} step={1} value={perCustomerLimit} onChange={(e) => setPerCustomerLimit(e.target.value)} placeholder="Unlimited" className="h-11" />
                                <p className="mt-1 text-xs text-slate-500">Leave blank for unlimited uses per customer.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">Applies to plans</label>
                                <div className="space-y-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-3">
                                    {plans.length === 0 ? (
                                        <p className="text-xs text-slate-500">No plans yet.</p>
                                    ) : plans.map((p) => (
                                        <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={planIds.includes(p.id)} onChange={() => togglePlan(p.id)}
                                                className="h-4 w-4 rounded border-slate-300 text-[var(--brand-purple)] focus:ring-[var(--brand-purple)]" />
                                            <span className="text-sm text-slate-700">{p.name}</span>
                                        </label>
                                    ))}
                                </div>
                                <p className="mt-1 text-xs text-slate-500">Select none to apply to all plans.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">Valid from (optional)</label>
                                    <Input type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="h-11" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-2">Valid until (optional)</label>
                                    <Input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-11" />
                                </div>
                            </div>

                            <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-[var(--brand-purple)]" />
                                Active (can be redeemed)
                            </label>

                            <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-[var(--brand-purple)]" />
                                Show on storefront (advertise this code at checkout)
                            </label>

                            <Button onClick={handleSave} disabled={saving}
                                className="w-full h-12 rounded-xl bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white font-medium">
                                {saving ? "Saving..." : editingId ? "Save changes" : "Create coupon"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
