"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Pagination } from "@/components/ui/pagination"
import { Building2, Plus, X, Search, CheckCircle2, Clock, XCircle, AlertCircle, Edit2 } from "lucide-react"
import { formatDateDMY } from "@/lib/utils"

interface Lead {
    id: number
    reseller_id: number
    company_name: string
    contact_name: string | null
    contact_email: string | null
    contact_phone: string | null
    notes: string | null
    status: 'active' | 'converted' | 'lost' | 'expired'
    created_at: string
    updated_at: string
}

const STATUS_OPTIONS = [
    { value: 'active', label: 'Active', icon: Clock, color: 'bg-blue-100 text-blue-800' },
    { value: 'converted', label: 'Converted', icon: CheckCircle2, color: 'bg-green-100 text-green-800' },
    { value: 'lost', label: 'Lost', icon: XCircle, color: 'bg-red-100 text-red-800' },
    { value: 'expired', label: 'Expired', icon: AlertCircle, color: 'bg-slate-100 text-slate-600' },
]

const emptyForm = {
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    notes: '',
    status: 'active' as Lead['status'],
}

export default function LeadsPage() {
    const { user } = useAuth()
    const router = useRouter()
    const isSuperAdmin = user?.role === 'SuperAdmin'
    const isReseller = user?.role === 'Reseller'

    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const PAGE_SIZE = 20

    const [showForm, setShowForm] = useState(false)
    const [editingLead, setEditingLead] = useState<Lead | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    useEffect(() => {
        if (!user) { router.push('/login'); return }
        if (!isSuperAdmin && !isReseller) { router.push('/dashboard'); return }
    }, [user, router, isSuperAdmin, isReseller])

    const fetchLeads = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
                ...(search ? { search } : {}),
                ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
            })
            const token = localStorage.getItem('qc_token')
            const res = await fetch(`/api/reseller/leads?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) throw new Error('Failed to load leads')
            const data = await res.json()
            setLeads(data.leads)
            setTotal(data.pagination.total)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }, [page, search, statusFilter])

    useEffect(() => {
        if (user && (isSuperAdmin || isReseller)) fetchLeads()
    }, [user, fetchLeads, isSuperAdmin, isReseller])

    const openNew = () => {
        setEditingLead(null)
        setForm(emptyForm)
        setError('')
        setSuccess('')
        setShowForm(true)
    }

    const openEdit = (lead: Lead) => {
        setEditingLead(lead)
        setForm({
            company_name: lead.company_name,
            contact_name: lead.contact_name || '',
            contact_email: lead.contact_email || '',
            contact_phone: lead.contact_phone || '',
            notes: lead.notes || '',
            status: lead.status,
        })
        setError('')
        setSuccess('')
        setShowForm(true)
    }

    const handleSave = async () => {
        if (!form.company_name.trim()) { setError('Company name is required'); return }
        setSaving(true)
        setError('')
        try {
            const token = localStorage.getItem('qc_token')
            const url = editingLead
                ? `/api/reseller/leads?id=${editingLead.id}`
                : '/api/reseller/leads'
            const res = await fetch(url, {
                method: editingLead ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    company_name: form.company_name.trim(),
                    contact_name: form.contact_name.trim() || undefined,
                    contact_email: form.contact_email.trim() || undefined,
                    contact_phone: form.contact_phone.trim() || undefined,
                    notes: form.notes.trim() || undefined,
                    status: form.status,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || 'Failed to save lead')
            setSuccess(editingLead ? 'Lead updated successfully' : 'Lead registered successfully')
            setShowForm(false)
            fetchLeads()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Server error')
        } finally {
            setSaving(false)
        }
    }

    const getStatusMeta = (status: Lead['status']) =>
        STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0]

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Lead Registry</h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        {isSuperAdmin
                            ? 'All corporate leads registered by resellers — protected from direct outreach'
                            : 'Register companies you are actively pursuing to protect them from direct GG sales'}
                    </p>
                </div>
                {isReseller && (
                    <Button
                        onClick={openNew}
                        className="flex items-center gap-2 bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white"
                    >
                        <Plus className="h-4 w-4" />
                        Register Lead
                    </Button>
                )}
            </div>

            {success && (
                <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-md text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> {success}
                </div>
            )}

            {/* Policy notice */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <Building2 className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                    <p className="font-semibold mb-0.5">Conflict of Interest Protection</p>
                    <p className="text-amber-700">
                        Companies registered here are marked as reseller-owned leads. The GG sales team will not approach these companies directly.
                        {isSuperAdmin && ' You can view all reseller-claimed companies below.'}
                    </p>
                </div>
            </div>

            {/* Filters + Table */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            Leads ({total})
                        </CardTitle>
                        <div className="flex w-full md:w-auto items-center gap-2 ml-auto">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search company, contact..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && (setPage(1), fetchLeads())}
                                    className="pl-9 w-64"
                                />
                            </div>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                                className="h-10 px-3 border border-slate-200 rounded-md text-sm"
                            >
                                <option value="all">All Status</option>
                                {STATUS_OPTIONS.map(s => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </select>
                            <Button size="icon" onClick={() => { setPage(1); fetchLeads() }} className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white">
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-12 text-slate-500">Loading leads...</div>
                    ) : leads.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                            <p className="font-medium">No leads found</p>
                            {isReseller && <p className="text-sm mt-1">Register your first corporate lead to protect it from direct GG outreach.</p>}
                        </div>
                    ) : (
                        <>
                            {/* Mobile cards */}
                            <div className="md:hidden flex flex-col gap-3">
                                {leads.map((lead) => {
                                    const sm = getStatusMeta(lead.status)
                                    return (
                                        <div key={lead.id} className="border border-slate-200 rounded-xl p-4">
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="font-semibold text-slate-900">{lead.company_name}</div>
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${sm.color}`}>
                                                    {lead.status}
                                                </span>
                                            </div>
                                            {lead.contact_name && <div className="text-sm text-slate-600">{lead.contact_name}</div>}
                                            {lead.contact_email && <div className="text-xs text-slate-500">{lead.contact_email}</div>}
                                            {lead.contact_phone && <div className="text-xs text-slate-500">{lead.contact_phone}</div>}
                                            {lead.notes && <div className="text-xs text-slate-500 mt-1 italic">{lead.notes}</div>}
                                            <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                                                <span>Registered {formatDateDMY(lead.created_at)}</span>
                                                {isReseller && (
                                                    <Button variant="ghost" size="sm" onClick={() => openEdit(lead)} className="h-7 px-2">
                                                        <Edit2 className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Desktop table */}
                            <div className="hidden md:block overflow-auto">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr className="border-b border-slate-200">
                                            <th className="h-12 px-4 font-medium text-slate-500">Company</th>
                                            <th className="h-12 px-4 font-medium text-slate-500">Contact</th>
                                            <th className="h-12 px-4 font-medium text-slate-500">Status</th>
                                            <th className="h-12 px-4 font-medium text-slate-500">Notes</th>
                                            <th className="h-12 px-4 font-medium text-slate-500 whitespace-nowrap">Registered</th>
                                            {isReseller && <th className="h-12 px-4 font-medium text-slate-500 text-right">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leads.map((lead) => {
                                            const sm = getStatusMeta(lead.status)
                                            return (
                                                <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                                    <td className="p-4 font-medium text-slate-900">{lead.company_name}</td>
                                                    <td className="p-4 text-slate-600">
                                                        {lead.contact_name && <div>{lead.contact_name}</div>}
                                                        {lead.contact_email && <div className="text-xs text-slate-500">{lead.contact_email}</div>}
                                                        {lead.contact_phone && <div className="text-xs text-slate-500">{lead.contact_phone}</div>}
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${sm.color}`}>
                                                            {lead.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-slate-500 text-xs max-w-[200px] truncate">{lead.notes || '—'}</td>
                                                    <td className="p-4 text-slate-500 whitespace-nowrap">{formatDateDMY(lead.created_at)}</td>
                                                    {isReseller && (
                                                        <td className="p-4 text-right">
                                                            <Button variant="ghost" size="sm" onClick={() => openEdit(lead)}>
                                                                <Edit2 className="h-4 w-4" />
                                                            </Button>
                                                        </td>
                                                    )}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                    <p className="text-sm text-slate-500">
                                        Showing {((page - 1) * PAGE_SIZE) + 1} to {Math.min(page * PAGE_SIZE, total)} of {total} leads
                                    </p>
                                    <Pagination page={page} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Create/Edit Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-lg p-8 rounded-2xl shadow-xl relative animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setShowForm(false)}
                            className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="mb-6">
                            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                                {editingLead ? 'Update Lead' : 'Register Corporate Lead'}
                            </h2>
                            <p className="text-slate-500 text-sm mt-1">
                                {editingLead ? 'Update the details for this lead.' : 'Register a company you are actively pursuing. GG will not approach them directly.'}
                            </p>
                        </div>

                        {error && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Company Name <span className="text-rose-500">*</span>
                                </label>
                                <Input
                                    value={form.company_name}
                                    onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))}
                                    placeholder="Acme Technologies Pvt. Ltd."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                                    <Input
                                        value={form.contact_name}
                                        onChange={(e) => setForm(f => ({ ...f, contact_name: e.target.value }))}
                                        placeholder="Rajesh Kumar"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                    <Input
                                        value={form.contact_phone}
                                        onChange={(e) => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                                        placeholder="+91 98765 43210"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                                <Input
                                    type="email"
                                    value={form.contact_email}
                                    onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))}
                                    placeholder="rajesh@acme.com"
                                />
                            </div>
                            {editingLead && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                    <select
                                        value={form.status}
                                        onChange={(e) => setForm(f => ({ ...f, status: e.target.value as Lead['status'] }))}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm"
                                    >
                                        {STATUS_OPTIONS.map(s => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                <textarea
                                    value={form.notes}
                                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Meeting scheduled, demo sent, follow-up on..."
                                    rows={3}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)] resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-6">
                            <Button
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white"
                            >
                                {saving ? 'Saving...' : editingLead ? 'Update Lead' : 'Register Lead'}
                            </Button>
                            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
