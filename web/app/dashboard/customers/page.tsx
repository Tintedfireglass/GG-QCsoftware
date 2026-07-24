"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Pagination } from "@/components/ui/pagination"
import { Input } from "@/components/ui/input"
import { getAdminCustomers, updateAdminCustomer, CustomerDTO } from "@/lib/api"
import { Search, Loader2, Users, Globe, Smartphone, Power, PowerOff, Eye } from "lucide-react"
import { formatDateDMY } from "@/lib/utils"

export default function CustomersPage() {
    const { user } = useAuth()
    const router = useRouter()

    const [customers, setCustomers] = useState<CustomerDTO[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [status, setStatus] = useState("")
    const [type, setType] = useState("")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [togglingId, setTogglingId] = useState<number | null>(null)

    const fetchCustomers = useCallback(async () => {
        try {
            setLoading(true)
            const data = await getAdminCustomers({
                status: status || undefined,
                type: type || undefined,
                search: search.trim() || undefined,
                page,
                limit: 20,
            })
            setCustomers(data.customers)
            setTotalPages(data.pagination.totalPages)
            setTotal(data.pagination.total)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load customers")
        } finally {
            setLoading(false)
        }
    }, [status, type, search, page])

    useEffect(() => {
        if (!user) { router.push("/login"); return }
        if (user.role !== "SuperAdmin") { router.push("/dashboard"); return }
        fetchCustomers()
    }, [user, router, fetchCustomers])

    const handleToggleActive = async (c: CustomerDTO) => {
        try {
            setTogglingId(c.id)
            await updateAdminCustomer(c.id, { is_active: !c.is_active })
            setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: !c.is_active } : x)))
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to update customer")
        } finally {
            setTogglingId(null)
        }
    }

    const fmtDate = (v?: string | null) => formatDateDMY(v)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Customers</h1>
                <p className="text-slate-500 text-sm mt-1">Store &amp; app customer accounts, their orders and licenses.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 gap-4 sm:gap-0">
                    <h2 className="text-xl font-bold text-slate-900">{total} customer{total === 1 ? "" : "s"}</h2>
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchCustomers() }} className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input placeholder="Search name / email / phone / company" value={search} onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 w-full sm:w-[280px]" />
                        </form>
                        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)]">
                            <option value="">All types</option>
                            <option value="web">Web (email + password)</option>
                            <option value="app">App (phone + OTP)</option>
                        </select>
                        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)]">
                            <option value="">All statuses</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
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
                                <th className="h-12 px-4 font-medium text-slate-900">Phone</th>
                                <th className="h-12 px-4 font-medium text-slate-900">Company</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Type</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Orders</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Licenses</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Status</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Joined</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center w-[110px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={10} className="p-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
                            ) : customers.length === 0 ? (
                                <tr><td colSpan={10} className="p-8 text-center text-slate-500"><Users className="h-6 w-6 mx-auto mb-2 text-slate-300" />No customers found.</td></tr>
                            ) : customers.map((c) => (
                                <tr key={c.id} onClick={() => router.push(`/dashboard/customers/${c.id}`)}
                                    className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer">
                                    <td className="py-4 px-4 text-slate-500">{c.id}</td>
                                    <td className="py-4 px-4">
                                        <div className="text-slate-900">{c.full_name || "—"}</div>
                                        <div className="text-xs text-slate-400">{c.email || "—"}</div>
                                    </td>
                                    <td className="py-4 px-4 text-slate-600 whitespace-nowrap">{c.phone || "—"}</td>
                                    <td className="py-4 px-4 text-slate-600">{c.company || "—"}</td>
                                    <td className="py-4 px-4 text-center">
                                        {c.has_password ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-medium">
                                                <Globe className="h-3 w-3" />Web
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-teal-200 bg-teal-50 text-teal-700 text-xs font-medium">
                                                <Smartphone className="h-3 w-3" />App
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-4 px-4 text-center text-slate-700">{c.order_count}</td>
                                    <td className="py-4 px-4 text-center text-slate-700">{c.license_count}</td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium ${c.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
                                            {c.is_active ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-center text-slate-500 text-xs whitespace-nowrap">{fmtDate(c.created_at)}</td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                title="View details"
                                                onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/customers/${c.id}`) }}
                                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-[var(--brand-purple)] hover:bg-purple-50">
                                                <Eye className="h-4 w-4" />
                                            </button>
                                            <button
                                                title={c.is_active ? "Deactivate" : "Activate"}
                                                onClick={(e) => { e.stopPropagation(); handleToggleActive(c) }}
                                                disabled={togglingId === c.id}
                                                className={`inline-flex items-center justify-center h-8 w-8 rounded-lg disabled:opacity-50 ${c.is_active ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50" : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"}`}>
                                                {togglingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : c.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                                            </button>
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
