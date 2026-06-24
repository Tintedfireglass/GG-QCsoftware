"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Pagination } from "@/components/ui/pagination"
import { Input } from "@/components/ui/input"
import { getAdminOrders, refundOrder, OrderDTO } from "@/lib/api"
import { Search, Loader2, RotateCcw, ShoppingCart, Eye } from "lucide-react"

const STATUS_STYLES: Record<string, string> = {
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    failed: "border-rose-200 bg-rose-50 text-rose-700",
    refunded: "border-slate-200 bg-slate-100 text-slate-600",
}

export default function OrdersPage() {
    const { user } = useAuth()
    const router = useRouter()

    const [orders, setOrders] = useState<OrderDTO[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [status, setStatus] = useState("")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [refundingId, setRefundingId] = useState<number | null>(null)

    const fetchOrders = useCallback(async () => {
        try {
            setLoading(true)
            const data = await getAdminOrders({ status: status || undefined, search: search.trim() || undefined, page, limit: 20 })
            setOrders(data.orders)
            setTotalPages(data.pagination.totalPages)
            setTotal(data.pagination.total)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load orders")
        } finally {
            setLoading(false)
        }
    }, [status, search, page])

    useEffect(() => {
        if (!user) { router.push("/login"); return }
        if (user.role !== "SuperAdmin") { router.push("/dashboard"); return }
        fetchOrders()
    }, [user, router, fetchOrders])

    const handleRefund = async (o: OrderDTO) => {
        if (!confirm(`Refund order #${o.id} (${o.currency} ${(o.amount_cents / 100).toFixed(2)})? This also deactivates the issued license key.`)) return
        try {
            setRefundingId(o.id)
            await refundOrder(o.id)
            fetchOrders()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Refund failed")
        } finally {
            setRefundingId(null)
        }
    }

    const fmtPrice = (cents: number, cur: string) => `${cur} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—")

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Orders</h1>
                <p className="text-slate-500 text-sm mt-1">Customer purchases, payment status, and refunds.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 gap-4 sm:gap-0">
                    <h2 className="text-xl font-bold text-slate-900">{total} order{total === 1 ? "" : "s"}</h2>
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchOrders() }} className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input placeholder="Search email / payment ref" value={search} onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 w-full sm:w-[260px]" />
                        </form>
                        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)]">
                            <option value="">All statuses</option>
                            <option value="paid">Paid</option>
                            <option value="pending">Pending</option>
                            <option value="failed">Failed</option>
                            <option value="refunded">Refunded</option>
                        </select>
                    </div>
                </div>

                {error && <div className="m-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{error}</div>}

                <div className="relative w-full overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="border-b border-slate-200 bg-white">
                            <tr>
                                <th className="h-12 px-4 font-medium text-slate-900">#</th>
                                <th className="h-12 px-4 font-medium text-slate-900">Customer</th>
                                <th className="h-12 px-4 font-medium text-slate-900">Plan</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Amount</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Status</th>
                                <th className="h-12 px-4 font-medium text-slate-900">License Key</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Date</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center w-[110px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
                            ) : orders.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-500"><ShoppingCart className="h-6 w-6 mx-auto mb-2 text-slate-300" />No orders found.</td></tr>
                            ) : orders.map((o) => (
                                <tr key={o.id} onClick={() => router.push(`/dashboard/orders/${o.id}`)}
                                    className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer">
                                    <td className="py-4 px-4 text-slate-500">{o.id}</td>
                                    <td className="py-4 px-4">
                                        <div className="text-slate-900">{o.customer_name || "—"}</div>
                                        <div className="text-xs text-slate-400">{o.customer_email || "—"}</div>
                                    </td>
                                    <td className="py-4 px-4 text-slate-600">{o.plan_name || o.plan || "—"}</td>
                                    <td className="py-4 px-4 text-center text-slate-700 whitespace-nowrap">{fmtPrice(o.amount_cents, o.currency)}</td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium capitalize ${STATUS_STYLES[o.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                                            {o.status}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 font-mono text-xs text-slate-600">{o.license_key || "—"}</td>
                                    <td className="py-4 px-4 text-center text-slate-500 text-xs whitespace-nowrap">{fmtDate(o.created_at)}</td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center justify-center gap-1">
                                            <button title="View order" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/orders/${o.id}`) }}
                                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-[var(--brand-purple)] hover:bg-purple-50">
                                                <Eye className="h-4 w-4" />
                                            </button>
                                            {o.status === "paid" ? (
                                                <button title="Refund order" onClick={(e) => { e.stopPropagation(); handleRefund(o) }} disabled={refundingId === o.id}
                                                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                                                    {refundingId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                                </button>
                                            ) : null}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-slate-100">
                        <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
                        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
                    </div>
                )}
            </div>
        </div>
    )
}
