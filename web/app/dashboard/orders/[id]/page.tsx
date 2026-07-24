"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { getAdminOrder, refundOrder, OrderDTO } from "@/lib/api"
import { ArrowLeft, Loader2, RotateCcw, ShoppingCart } from "lucide-react"
import { formatDateTimeDMY } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    failed: "border-rose-200 bg-rose-50 text-rose-700",
    refunded: "border-slate-200 bg-slate-100 text-slate-600",
}

const PLATFORM_LABELS: Record<string, string> = {
    windows: "Windows",
    android: "Android",
    ios: "iOS",
    mac: "Mac",
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
            <span className="text-sm text-slate-500">{label}</span>
            <span className="text-sm text-slate-900 text-right break-all">{children}</span>
        </div>
    )
}

export default function OrderDetailPage() {
    const { user } = useAuth()
    const router = useRouter()
    const params = useParams()
    const id = parseInt(String(params.id), 10)

    const [order, setOrder] = useState<OrderDTO | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [refunding, setRefunding] = useState(false)

    const fetchOrder = useCallback(async () => {
        try {
            setLoading(true)
            const data = await getAdminOrder(id)
            setOrder(data.order)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load order")
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        if (!user) { router.push("/login"); return }
        if (user.role !== "SuperAdmin") { router.push("/dashboard"); return }
        if (Number.isNaN(id)) { setError("Invalid order ID"); setLoading(false); return }
        fetchOrder()
    }, [user, router, id, fetchOrder])

    const handleRefund = async () => {
        if (!order) return
        if (!confirm(`Refund order #${order.id} (${order.currency} ${(order.amount_cents / 100).toFixed(2)})? This also deactivates the issued license key.`)) return
        try {
            setRefunding(true)
            await refundOrder(order.id)
            fetchOrder()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Refund failed")
        } finally {
            setRefunding(false)
        }
    }

    const fmtPrice = (cents: number, cur: string) => `${cur} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    const fmtDate = (v?: string | null) => formatDateTimeDMY(v)

    if (loading) return <div className="p-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>

    if (error || !order) {
        return (
            <div className="space-y-6 max-w-[800px]">
                <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/orders")}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to orders
                </Button>
                <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{error || "Order not found."}</div>
            </div>
        )
    }

    const subtotal = order.subtotal_cents ?? order.amount_cents
    const discount = order.discount_cents ?? 0

    return (
        <div className="space-y-6 max-w-[800px]">
            <div className="flex items-center justify-between gap-4">
                <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/orders")}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                {order.status === "paid" && (
                    <Button variant="outline" size="sm" onClick={handleRefund} disabled={refunding} className="text-rose-600 hover:text-rose-700">
                        {refunding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                        Refund order
                    </Button>
                )}
            </div>

            <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-purple-50 flex items-center justify-center">
                    <ShoppingCart className="h-5 w-5 text-[var(--brand-purple)]" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Order #{order.id}</h1>
                    <span className={`inline-flex items-center px-3 py-0.5 mt-1 rounded-full border text-xs font-medium capitalize ${STATUS_STYLES[order.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                        {order.status}
                    </span>
                </div>
            </div>

            {/* Payment summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-2">Payment</h2>
                <Row label="Subtotal">{fmtPrice(subtotal, order.currency)}</Row>
                {discount > 0 && (
                    <Row label={`Discount${order.coupon_code ? ` (${order.coupon_code})` : ""}`}>
                        <span className="text-emerald-600">−{fmtPrice(discount, order.currency)}</span>
                    </Row>
                )}
                <Row label="Total charged"><span className="font-semibold">{fmtPrice(order.amount_cents, order.currency)}</span></Row>
                {order.coupon_code && <Row label="Coupon">{order.coupon_code}</Row>}
                <Row label="Auto-renew">{order.auto_renew ? "Yes" : "No"}</Row>
                {order.is_renewal ? <Row label="Type">Renewal charge</Row> : null}
            </div>

            {/* Customer */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-2">Customer</h2>
                <Row label="Name">{order.customer_name || "—"}</Row>
                <Row label="Email">{order.customer_email || "—"}</Row>
            </div>

            {/* Plan & license */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-2">Plan & license</h2>
                <Row label="Plan">{order.plan_name || order.plan || "—"}</Row>
                {order.platform_caps && Object.keys(order.platform_caps).length > 0 ? (
                    <Row label="Platforms & devices">
                        <div className="flex flex-wrap gap-1 justify-end">
                            {Object.entries(order.platform_caps).map(([p, n]) => (
                                <span key={p} className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                                    {PLATFORM_LABELS[p] || p} ×{n}
                                </span>
                            ))}
                            <span className="inline-flex items-center rounded bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-[var(--brand-purple)]">
                                {Object.values(order.platform_caps).reduce((a, b) => a + b, 0)} devices
                            </span>
                        </div>
                    </Row>
                ) : order.quantity && order.quantity > 1 ? (
                    <Row label="Quantity">{order.quantity}</Row>
                ) : null}
                <Row label="License key">
                    {order.license_key ? <span className="font-mono">{order.license_key}</span> : "—"}
                </Row>
                {order.license_key && (
                    <Row label="License status">{order.license_active ? "Active" : "Inactive"}</Row>
                )}
            </div>

            {/* Payment references */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-2">References</h2>
                <Row label="Payment reference">{order.payment_reference || "—"}</Row>
                <Row label="Gateway reference">{order.gateway_reference || "—"}</Row>
                <Row label="Created">{fmtDate(order.created_at)}</Row>
                <Row label="Updated">{fmtDate(order.updated_at)}</Row>
            </div>
        </div>
    )
}
