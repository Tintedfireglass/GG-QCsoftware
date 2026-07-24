"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    getAdminCustomer, updateAdminCustomer, deleteAdminCustomer,
    CustomerDetailResponse,
} from "@/lib/api"
import {
    ArrowLeft, Loader2, Globe, Smartphone, Pencil, Save, X,
    Power, PowerOff, Trash2, ShoppingCart, Key, LifeBuoy,
} from "lucide-react"
import { formatDateDMY, formatDateTimeDMY } from "@/lib/utils"

const ORDER_STATUS_STYLES: Record<string, string> = {
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    failed: "border-rose-200 bg-rose-50 text-rose-700",
    refunded: "border-slate-200 bg-slate-100 text-slate-600",
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
            <span className="text-sm text-slate-500">{label}</span>
            <span className="text-sm text-slate-900 text-right break-all">{children}</span>
        </div>
    )
}

interface EditForm { full_name: string; company: string; phone: string; email: string }

export default function CustomerDetailPage() {
    const { user } = useAuth()
    const router = useRouter()
    const params = useParams()
    const id = parseInt(String(params.id), 10)

    const [data, setData] = useState<CustomerDetailResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState<EditForm>({ full_name: "", company: "", phone: "", email: "" })
    const [saving, setSaving] = useState(false)
    const [toggling, setToggling] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const fetchCustomer = useCallback(async () => {
        try {
            setLoading(true)
            const res = await getAdminCustomer(id)
            setData(res)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load customer")
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        if (!user) { router.push("/login"); return }
        if (user.role !== "SuperAdmin") { router.push("/dashboard"); return }
        if (!isNaN(id)) fetchCustomer()
    }, [user, router, id, fetchCustomer])

    const c = data?.customer

    const startEdit = () => {
        if (!c) return
        setForm({
            full_name: c.full_name || "",
            company: c.company || "",
            phone: c.phone || "",
            email: c.email || "",
        })
        setEditing(true)
    }

    const saveEdit = async () => {
        try {
            setSaving(true)
            const res = await updateAdminCustomer(id, {
                full_name: form.full_name.trim() || null,
                company: form.company.trim() || null,
                phone: form.phone.trim() || null,
                email: form.email.trim() || null,
            })
            setData(res)
            setEditing(false)
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to save")
        } finally {
            setSaving(false)
        }
    }

    const toggleActive = async () => {
        if (!c) return
        try {
            setToggling(true)
            const res = await updateAdminCustomer(id, { is_active: !c.is_active })
            setData(res)
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to update")
        } finally {
            setToggling(false)
        }
    }

    const handleDelete = async () => {
        if (!c) return
        const counts = `${c.order_count} order(s), ${c.license_count} license(s)`
        if (!confirm(`Permanently delete ${c.full_name || c.email || `customer #${c.id}`}?\n\nThis also deletes their ${counts}, app reports, devices and support tickets. This cannot be undone.`)) return
        try {
            setDeleting(true)
            await deleteAdminCustomer(id)
            router.push("/dashboard/customers")
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete")
            setDeleting(false)
        }
    }

    const fmtPrice = (cents: number, cur: string) => `${cur} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    const fmtDate = (v?: string | null) => formatDateTimeDMY(v)
    const fmtDateShort = (v?: string | null) => formatDateDMY(v)

    if (loading) {
        return <div className="p-12 text-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
    }
    if (error || !c) {
        return (
            <div className="space-y-4 max-w-[900px]">
                <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/customers")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />Back to customers
                </Button>
                <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{error || "Customer not found."}</div>
            </div>
        )
    }

    const orders = data?.orders ?? []
    const licenses = (data?.licenses ?? []) as Array<Record<string, unknown>>
    const tickets = data?.tickets ?? []

    return (
        <div className="space-y-6 max-w-[900px]">
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/customers")}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back to customers
            </Button>

            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">{c.full_name || c.email || `Customer #${c.id}`}</h1>
                    <div className="flex items-center gap-2 mt-2">
                        {c.has_password ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-medium">
                                <Globe className="h-3 w-3" />Web account
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-teal-200 bg-teal-50 text-teal-700 text-xs font-medium">
                                <Smartphone className="h-3 w-3" />App account
                            </span>
                        )}
                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium ${c.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
                            {c.is_active ? "Active" : "Inactive"}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={toggleActive} disabled={toggling}>
                        {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : c.is_active ? <PowerOff className="h-4 w-4 mr-2" /> : <Power className="h-4 w-4 mr-2" />}
                        {c.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleting}
                        className="text-rose-600 border-rose-200 hover:bg-rose-50">
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        Delete
                    </Button>
                </div>
            </div>

            {/* Profile */}
            <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-6 flex items-center justify-between border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">Profile</h2>
                    {!editing ? (
                        <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4 mr-2" />Edit</Button>
                    ) : (
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}><X className="h-4 w-4 mr-2" />Cancel</Button>
                            <Button size="sm" onClick={saveEdit} disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Save
                            </Button>
                        </div>
                    )}
                </div>
                <div className="px-6 py-2">
                    {!editing ? (
                        <>
                            <Row label="Full name">{c.full_name || "—"}</Row>
                            <Row label="Email">{c.email || "—"}</Row>
                            <Row label="Phone">{c.phone || "—"}</Row>
                            <Row label="Company">{c.company || "—"}</Row>
                            <Row label="Country">{c.country_code || "—"}</Row>
                            <Row label="Date of birth">{fmtDateShort(c.date_of_birth)}</Row>
                            <Row label="Customer ID">{c.id}</Row>
                            <Row label="Joined">{fmtDate(c.created_at)}</Row>
                        </>
                    ) : (
                        <div className="py-4 space-y-4">
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">Full name</label>
                                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">Email</label>
                                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">Phone</label>
                                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">Company</label>
                                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Orders */}
            <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-6 flex items-center gap-2 border-b border-slate-100">
                    <ShoppingCart className="h-5 w-5 text-slate-400" />
                    <h2 className="text-lg font-bold text-slate-900">Orders ({orders.length})</h2>
                </div>
                {orders.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">No orders.</p>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="border-b border-slate-200">
                            <tr>
                                <th className="h-11 px-6 font-medium text-slate-900">#</th>
                                <th className="h-11 px-4 font-medium text-slate-900">Plan</th>
                                <th className="h-11 px-4 font-medium text-slate-900 text-center">Amount</th>
                                <th className="h-11 px-4 font-medium text-slate-900 text-center">Status</th>
                                <th className="h-11 px-4 font-medium text-slate-900 text-center">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((o) => (
                                <tr key={o.id} onClick={() => router.push(`/dashboard/orders/${o.id}`)}
                                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 cursor-pointer">
                                    <td className="py-3 px-6 text-slate-500">{o.id}</td>
                                    <td className="py-3 px-4 text-slate-700">{o.plan_name || o.plan || "—"}</td>
                                    <td className="py-3 px-4 text-center text-slate-700 whitespace-nowrap">{fmtPrice(o.amount_cents, o.currency)}</td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium capitalize ${ORDER_STATUS_STYLES[o.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>{o.status}</span>
                                    </td>
                                    <td className="py-3 px-4 text-center text-slate-500 text-xs whitespace-nowrap">{fmtDateShort(o.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Licenses */}
            <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-6 flex items-center gap-2 border-b border-slate-100">
                    <Key className="h-5 w-5 text-slate-400" />
                    <h2 className="text-lg font-bold text-slate-900">Licenses ({licenses.length})</h2>
                </div>
                {licenses.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">No licenses.</p>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="border-b border-slate-200">
                            <tr>
                                <th className="h-11 px-6 font-medium text-slate-900">Key</th>
                                <th className="h-11 px-4 font-medium text-slate-900">Plan</th>
                                <th className="h-11 px-4 font-medium text-slate-900 text-center">Active</th>
                                <th className="h-11 px-4 font-medium text-slate-900 text-center">Expires</th>
                            </tr>
                        </thead>
                        <tbody>
                            {licenses.map((l, i) => (
                                <tr key={(l.id as number) ?? i} className="border-b border-slate-100 last:border-0">
                                    <td className="py-3 px-6 font-mono text-xs text-slate-700">{String(l.key ?? "—")}</td>
                                    <td className="py-3 px-4 text-slate-700">{String(l.plan ?? "—")}</td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${l.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
                                            {l.is_active ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-center text-slate-500 text-xs whitespace-nowrap">{fmtDateShort(l.expires_at as string | null)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Support tickets */}
            <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-6 flex items-center gap-2 border-b border-slate-100">
                    <LifeBuoy className="h-5 w-5 text-slate-400" />
                    <h2 className="text-lg font-bold text-slate-900">Support tickets ({tickets.length})</h2>
                </div>
                {tickets.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">No support tickets.</p>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="border-b border-slate-200">
                            <tr>
                                <th className="h-11 px-6 font-medium text-slate-900">Ticket</th>
                                <th className="h-11 px-4 font-medium text-slate-900">Subject</th>
                                <th className="h-11 px-4 font-medium text-slate-900 text-center">Status</th>
                                <th className="h-11 px-4 font-medium text-slate-900 text-center">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tickets.map((t) => (
                                <tr key={t.id} onClick={() => router.push(`/dashboard/support`)}
                                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 cursor-pointer">
                                    <td className="py-3 px-6 font-mono text-xs text-slate-600">{t.ticket_id}</td>
                                    <td className="py-3 px-4 text-slate-700">{t.subject}</td>
                                    <td className="py-3 px-4 text-center text-slate-600 capitalize">{t.status.replace("_", " ")}</td>
                                    <td className="py-3 px-4 text-center text-slate-500 text-xs whitespace-nowrap">{fmtDateShort(t.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
