"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth-provider"
import { useBranding } from "@/components/branding-provider"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Pagination } from "@/components/ui/pagination"
import { getAdminContacts, updateContactStatus, deleteContact, ContactDTO } from "@/lib/api"
import { Loader2, Mail, X, Trash2, Check, Archive, Inbox } from "lucide-react"
import { formatDateTimeDMY } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
    new: "border-emerald-200 bg-emerald-50 text-emerald-700",
    read: "border-slate-200 bg-slate-50 text-slate-600",
    archived: "border-amber-200 bg-amber-50 text-amber-700",
}

const FILTERS = [
    { key: "", label: "All" },
    { key: "new", label: "New" },
    { key: "read", label: "Read" },
    { key: "archived", label: "Archived" },
]

export default function ContactsPage() {
    const { siteName } = useBranding()
    const { user } = useAuth()
    const router = useRouter()

    const [contacts, setContacts] = useState<ContactDTO[]>([])
    const [newCount, setNewCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [status, setStatus] = useState("")
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [selected, setSelected] = useState<ContactDTO | null>(null)
    const [busyId, setBusyId] = useState<number | null>(null)

    const fetchContacts = useCallback(async () => {
        try {
            setLoading(true)
            const data = await getAdminContacts({ status: status || undefined, page, limit: 20 })
            setContacts(data.contacts)
            setNewCount(data.newCount)
            setTotalPages(data.pagination.totalPages)
            setTotal(data.pagination.total)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load contacts")
        } finally {
            setLoading(false)
        }
    }, [status, page])

    useEffect(() => {
        if (!user) { router.push("/login"); return }
        if (user.role !== "SuperAdmin") { router.push("/dashboard"); return }
        fetchContacts()
    }, [user, router, fetchContacts])

    const open = async (c: ContactDTO) => {
        setSelected(c)
        // Auto-mark new submissions as read when opened.
        if (c.status === "new") {
            try { await updateContactStatus(c.id, "read"); fetchContacts() } catch { /* ignore */ }
        }
    }

    const changeStatus = async (c: ContactDTO, next: "new" | "read" | "archived") => {
        try {
            setBusyId(c.id)
            await updateContactStatus(c.id, next)
            if (selected?.id === c.id) setSelected({ ...c, status: next })
            fetchContacts()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to update")
        } finally {
            setBusyId(null)
        }
    }

    const remove = async (c: ContactDTO) => {
        if (!confirm(`Delete submission from ${c.name}? This cannot be undone.`)) return
        try {
            setBusyId(c.id)
            await deleteContact(c.id)
            if (selected?.id === c.id) setSelected(null)
            fetchContacts()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete")
        } finally {
            setBusyId(null)
        }
    }

    const fmtDate = (v?: string | null) => formatDateTimeDMY(v)

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contact submissions</h1>
                    <p className="text-slate-500 text-sm mt-1">Partnership / contact enquiries from the store website.{newCount > 0 ? ` ${newCount} new.` : ""}</p>
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                    {FILTERS.map((f) => (
                        <button key={f.key} onClick={() => { setStatus(f.key); setPage(1) }}
                            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${status === f.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{error}</div>}

            <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-5 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">{total} submission{total === 1 ? "" : "s"}</h2>
                </div>

                <div className="relative w-full overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="border-b border-slate-200 bg-white">
                            <tr>
                                <th className="h-12 px-4 font-medium text-slate-900">Name</th>
                                <th className="h-12 px-4 font-medium text-slate-900">Company</th>
                                <th className="h-12 px-4 font-medium text-slate-900">Contact</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Status</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Date</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center w-[140px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
                            ) : contacts.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-500"><Inbox className="h-6 w-6 mx-auto mb-2 text-slate-300" />No submissions found.</td></tr>
                            ) : contacts.map((c) => (
                                <tr key={c.id} onClick={() => open(c)} className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer">
                                    <td className="py-4 px-4">
                                        <div className={`text-slate-900 ${c.status === "new" ? "font-semibold" : ""}`}>{c.name}</div>
                                        <div className="text-xs text-slate-400">{c.service || siteName}</div>
                                    </td>
                                    <td className="py-4 px-4 text-slate-600">{c.company_name || "—"}</td>
                                    <td className="py-4 px-4">
                                        <div className="text-slate-700">{c.email}</div>
                                        <div className="text-xs text-slate-400">{c.phone || "—"}</div>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium capitalize ${STATUS_STYLES[c.status] || ""}`}>{c.status}</span>
                                    </td>
                                    <td className="py-4 px-4 text-center text-slate-500 text-xs whitespace-nowrap">{fmtDate(c.created_at)}</td>
                                    <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-center gap-1">
                                            {c.status !== "archived" ? (
                                                <button title="Archive" onClick={() => changeStatus(c, "archived")} disabled={busyId === c.id}
                                                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-50">
                                                    <Archive className="h-4 w-4" />
                                                </button>
                                            ) : (
                                                <button title="Mark read" onClick={() => changeStatus(c, "read")} disabled={busyId === c.id}
                                                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                                                    <Check className="h-4 w-4" />
                                                </button>
                                            )}
                                            <button title="Delete" onClick={() => remove(c)} disabled={busyId === c.id}
                                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                                                {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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

            {/* Detail modal */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
                    <div className="bg-white w-full max-w-[520px] max-h-[90vh] overflow-y-auto p-8 rounded-2xl shadow-xl relative" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setSelected(null)} className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100">
                            <X className="h-5 w-5" />
                        </button>
                        <div className="flex items-center gap-3 mb-5">
                            <div className="h-11 w-11 rounded-xl bg-purple-50 flex items-center justify-center">
                                <Mail className="h-5 w-5 text-[var(--brand-purple)]" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">{selected.name}</h2>
                                <span className={`inline-flex items-center px-3 py-0.5 mt-1 rounded-full border text-xs font-medium capitalize ${STATUS_STYLES[selected.status] || ""}`}>{selected.status}</span>
                            </div>
                        </div>
                        <div className="space-y-3 text-sm">
                            <Field label="Company" value={selected.company_name} />
                            <Field label="Email" value={selected.email} />
                            <Field label="Phone" value={selected.phone} />
                            <Field label="Service" value={selected.service} />
                            <Field label="Submitted" value={fmtDate(selected.created_at)} />
                            <div>
                                <div className="text-slate-500 mb-1">Description</div>
                                <div className="text-slate-900 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 border border-slate-100">{selected.description || "—"}</div>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <a href={`mailto:${selected.email}`} className="flex-1">
                                <Button className="w-full bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white">Reply by email</Button>
                            </a>
                            {selected.status !== "archived" ? (
                                <Button variant="outline" onClick={() => changeStatus(selected, "archived")}>Archive</Button>
                            ) : (
                                <Button variant="outline" onClick={() => changeStatus(selected, "read")}>Unarchive</Button>
                            )}
                            <Button variant="outline" className="text-rose-600" onClick={() => remove(selected)}>Delete</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-900 text-right break-all">{value || "—"}</span>
        </div>
    )
}
