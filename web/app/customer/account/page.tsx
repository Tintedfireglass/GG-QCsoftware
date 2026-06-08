"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCustomerLicenses, getCustomerPlans, PlanDTO, CouponPreview } from "@/lib/api"
import { clearClientCache } from "@/lib/client-cache"
import { trackEvent } from "@/lib/analytics-client"

const PLATFORM_LABELS: Record<string, string> = { windows: "Windows", android: "Android", ios: "iOS", mac: "Mac" }

type CustomerUser = {
    id: number
    email: string
    fullName?: string | null
}

type License = {
    id: number
    key: string
    is_active: boolean
    expires_at: string | null
    created_at: string
    plan: string | null
    payment_reference: string | null
}

export default function CustomerAccountPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
            <CustomerAccountContent />
        </Suspense>
    )
}

function CustomerAccountContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const status = useMemo(() => searchParams.get("status"), [searchParams])
    const message = useMemo(() => searchParams.get("message"), [searchParams])

    const [user, setUser] = useState<CustomerUser | null>(null)
    const [licenses, setLicenses] = useState<License[]>([])
    const [plans, setPlans] = useState<PlanDTO[]>([])
    const [autoRenewSel, setAutoRenewSel] = useState<Record<number, boolean>>({})
    const [couponInput, setCouponInput] = useState<Record<number, string>>({})
    const [couponApplied, setCouponApplied] = useState<Record<number, CouponPreview>>({})
    const [couponError, setCouponError] = useState<Record<number, string>>({})
    const [applyingId, setApplyingId] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)
    const [buyingId, setBuyingId] = useState<number | null>(null)
    const [error, setError] = useState("")

    useEffect(() => {
        const token = localStorage.getItem("qc_customer_token")
        const userRaw = localStorage.getItem("qc_customer_user")
        if (!token || !userRaw) {
            router.push("/customer/login")
            return
        }

        setUser(JSON.parse(userRaw) as CustomerUser)

        async function loadData() {
            try {
                if (status === "success") clearClientCache()
                const [licData, planData] = await Promise.all([getCustomerLicenses(), getCustomerPlans()])
                setLicenses(licData.licenses || [])
                setPlans(planData.plans || [])
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load account")
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [router, status])

    async function applyCoupon(planId: number) {
        const token = localStorage.getItem("qc_customer_token")
        if (!token) { router.push("/customer/login"); return }
        const code = (couponInput[planId] || "").trim()
        if (!code) return

        setApplyingId(planId)
        setCouponError((s) => ({ ...s, [planId]: "" }))
        try {
            const res = await fetch("/api/customer/coupons/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ code, planId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || "Invalid coupon")
            setCouponApplied((s) => ({ ...s, [planId]: data as CouponPreview }))
            trackEvent("coupon_applied", { planId, code })
        } catch (err) {
            setCouponApplied((s) => { const n = { ...s }; delete n[planId]; return n })
            setCouponError((s) => ({ ...s, [planId]: err instanceof Error ? err.message : "Invalid coupon" }))
        } finally {
            setApplyingId(null)
        }
    }

    function removeCoupon(planId: number) {
        setCouponApplied((s) => { const n = { ...s }; delete n[planId]; return n })
        setCouponInput((s) => ({ ...s, [planId]: "" }))
        setCouponError((s) => ({ ...s, [planId]: "" }))
    }

    async function startCheckout(planId: number, autoRenew: boolean) {
        const token = localStorage.getItem("qc_customer_token")
        if (!token) {
            router.push("/customer/login")
            return
        }

        setBuyingId(planId)
        setError("")
        try {
            const couponCode = couponApplied[planId]?.code || null
            trackEvent("checkout_started", { planId, autoRenew, couponCode })
            const res = await fetch("/api/customer/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ planId, autoRenew, couponCode }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || "Unable to start checkout")
            window.location.href = data.redirectUrl
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to start checkout")
            setBuyingId(null)
        }
    }

    const fmtPrice = (cents: number, cur: string) =>
        `${cur} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

    function logout() {
        localStorage.removeItem("qc_customer_token")
        localStorage.removeItem("qc_customer_user")
        router.push("/customer/login")
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Customer Account</h1>
                        <p className="text-slate-600">{user?.fullName || user?.email}</p>
                    </div>
                    <Button variant="outline" onClick={logout}>Logout</Button>
                </div>

                {status === "success" ? (
                    <Card className="border-green-300 bg-green-50">
                        <CardContent className="py-4 text-green-800">Payment successful. Your license key is ready below.</CardContent>
                    </Card>
                ) : null}

                {status === "failed" ? (
                    <Card className="border-red-300 bg-red-50">
                        <CardContent className="py-4 text-red-700">{message || "Payment failed or cancelled."}</CardContent>
                    </Card>
                ) : null}

                {error ? (
                    <Card className="border-red-300 bg-red-50">
                        <CardContent className="py-4 text-red-700">{error}</CardContent>
                    </Card>
                ) : null}

                <div>
                    <h2 className="text-xl font-semibold mb-3">Choose a plan</h2>
                    {loading ? (
                        <p className="text-slate-500">Loading plans...</p>
                    ) : plans.length === 0 ? (
                        <Card><CardContent className="py-6 text-slate-500">No plans are available right now. Please check back later.</CardContent></Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {plans.map((plan) => (
                                <Card key={plan.id} className="flex flex-col">
                                    <CardHeader>
                                        <CardTitle>{plan.name}</CardTitle>
                                        <CardDescription>
                                            {plan.description || "One-time purchase"}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex flex-col flex-1">
                                        <div className="text-2xl font-semibold text-slate-900">
                                            {fmtPrice(plan.price_cents, plan.currency)}
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-3">
                                            {(plan.product_scope || []).map((pl) => (
                                                <span key={pl} className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                    {PLATFORM_LABELS[pl] || pl}{plan.platform_caps?.[pl] ? ` ×${plan.platform_caps[pl]}` : ""}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-2">
                                            {plan.duration_days ? `Valid for ${plan.duration_days} days` : "Perpetual license"}
                                        </div>
                                        {plan.features && plan.features.length > 0 && (
                                            <ul className="mt-3 space-y-1.5">
                                                {plan.features.map((f, i) => (
                                                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                                                        <span className="text-emerald-500 mt-0.5">✓</span>
                                                        <span>{f}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {plan.duration_days != null && plan.allow_auto_renew && (
                                            <label className="flex items-center gap-2 text-xs text-slate-600 mt-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={!!autoRenewSel[plan.id]}
                                                    onChange={(e) => setAutoRenewSel((s) => ({ ...s, [plan.id]: e.target.checked }))}
                                                />
                                                Auto-renew before it expires
                                            </label>
                                        )}

                                        {/* Coupon */}
                                        <div className="mt-3">
                                            {couponApplied[plan.id] ? (
                                                <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-emerald-700">
                                                            {couponApplied[plan.id].code} applied · −{fmtPrice(couponApplied[plan.id].discount_cents, couponApplied[plan.id].currency)}
                                                        </span>
                                                        <button onClick={() => removeCoupon(plan.id)} className="text-slate-400 hover:text-slate-600">Remove</button>
                                                    </div>
                                                    <div className="mt-1 text-emerald-800">You pay {fmtPrice(couponApplied[plan.id].total_cents, couponApplied[plan.id].currency)}</div>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={couponInput[plan.id] || ""}
                                                        onChange={(e) => setCouponInput((s) => ({ ...s, [plan.id]: e.target.value.toUpperCase() }))}
                                                        placeholder="Coupon code"
                                                        className="flex-1 min-w-0 rounded border border-slate-200 px-2 py-1.5 text-xs uppercase focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                    />
                                                    <Button variant="outline" size="sm" className="text-xs" onClick={() => applyCoupon(plan.id)} disabled={applyingId === plan.id || !(couponInput[plan.id] || "").trim()}>
                                                        {applyingId === plan.id ? "..." : "Apply"}
                                                    </Button>
                                                </div>
                                            )}
                                            {couponError[plan.id] && <p className="mt-1 text-xs text-red-600">{couponError[plan.id]}</p>}
                                        </div>

                                        <div className="mt-auto pt-4">
                                            <Button className="w-full" onClick={() => startCheckout(plan.id, !!autoRenewSel[plan.id])} disabled={buyingId !== null}>
                                                {buyingId === plan.id ? "Redirecting..." : "Buy Now"}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Your License Keys</CardTitle>
                        <CardDescription>Use these keys in the desktop app activation dialog.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <p className="text-slate-500">Loading licenses...</p>
                        ) : licenses.length === 0 ? (
                            <p className="text-slate-500">No license keys yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {licenses.map((license) => (
                                    <div key={license.id} className="rounded border border-slate-200 p-3">
                                        <div className="font-mono text-lg tracking-wide">{license.key}</div>
                                        <div className="text-sm text-slate-600 mt-1">
                                            Plan: <span className="capitalize">{(license.plan || "N/A").replace("_", "-")}</span>
                                            {" | "}
                                            Status: {license.is_active ? "Active" : "Inactive"}
                                            {" | "}
                                            Expires: {license.expires_at ? new Date(license.expires_at).toLocaleDateString() : "Never"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
