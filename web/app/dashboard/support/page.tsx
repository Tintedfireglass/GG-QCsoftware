"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    getAdminSupportTickets, updateSupportTicket, deleteSupportTicket,
    getSupportTicketMessages, sendSupportTicketReply,
    SupportTicketDTO, SupportTicketMessageDTO, TicketStatus, TicketPriority,
} from "@/lib/api"
import { Loader2, LifeBuoy, X, Trash2, Inbox, Search, Send } from "lucide-react"

const STATUS_STYLES: Record<string, string> = {
    open: "border-emerald-200 bg-emerald-50 text-emerald-700",
    in_progress: "border-blue-200 bg-blue-50 text-blue-700",
    resolved: "border-slate-200 bg-slate-50 text-slate-600",
    closed: "border-slate-200 bg-slate-100 text-slate-500",
}
const STATUS_LABELS: Record<string, string> = {
    open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
}
const PRIORITY_STYLES: Record<string, string> = {
    high: "border-rose-200 bg-rose-50 text-rose-700",
    normal: "border-slate-200 bg-slate-50 text-slate-600",
    low: "border-slate-200 bg-slate-50 text-slate-400",
}

const FILTERS = [
    { key: "", label: "All" },
    { key: "open", label: "Open" },
    { key: "in_progress", label: "In Progress" },
    { key: "resolved", label: "Resolved" },
    { key: "closed", label: "Closed" },
]

const STATUS_OPTIONS: TicketStatus[] = ["open", "in_progress", "resolved", "closed"]
const PRIORITY_OPTIONS: TicketPriority[] = ["low", "normal", "high"]

export default function SupportPage() {
    const { user } = useAuth()
    const router = useRouter()

    const [tickets, setTickets] = useState<SupportTicketDTO[]>([])
    const [openCount, setOpenCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [status, setStatus] = useState("")
    const [searchInput, setSearchInput] = useState("")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [selected, setSelected] = useState<SupportTicketDTO | null>(null)
    const [busyId, setBusyId] = useState<number | null>(null)
    const [savingNote, setSavingNote] = useState(false)
    const [noteDraft, setNoteDraft] = useState("")
    const [messages, setMessages] = useState<SupportTicketMessageDTO[]>([])
    const [loadingMessages, setLoadingMessages] = useState(false)
    const [replyDraft, setReplyDraft] = useState("")
    const [sendingReply, setSendingReply] = useState(false)

    const fetchTickets = useCallback(async () => {
        try {
            setLoading(true)
            const data = await getAdminSupportTickets({ status: status || undefined, search: search || undefined, page, limit: 20 })
            setTickets(data.tickets)
            setOpenCount(data.openCount)
            setTotalPages(data.pagination.totalPages)
            setTotal(data.pagination.total)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load tickets")
        } finally {
            setLoading(false)
        }
    }, [status, search, page])

    useEffect(() => {
        if (!user) { router.push("/login"); return }
        if (user.role !== "SuperAdmin") { router.push("/dashboard"); return }
        fetchTickets()
    }, [user, router, fetchTickets])

    const openTicket = (t: SupportTicketDTO) => {
        setSelected(t)
        setNoteDraft(t.adminNote || "")
        setReplyDraft("")
    }

    const selectedId = selected?.id ?? null
    useEffect(() => {
        if (selectedId === null) { setMessages([]); return }
        let cancelled = false
        setLoadingMessages(true)
        getSupportTicketMessages(selectedId)
            .then((r) => { if (!cancelled) setMessages(r.messages) })
            .catch(() => { if (!cancelled) setMessages([]) })
            .finally(() => { if (!cancelled) setLoadingMessages(false) })
        return () => { cancelled = true }
    }, [selectedId])

    const sendReply = async () => {
        if (!selected || !replyDraft.trim()) return
        try {
            setSendingReply(true)
            await sendSupportTicketReply(selected.id, replyDraft.trim())
            setReplyDraft("")
            const r = await getSupportTicketMessages(selected.id)
            setMessages(r.messages)
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to send reply")
        } finally {
            setSendingReply(false)
        }
    }

    const patch = async (t: SupportTicketDTO, body: { status?: TicketStatus; priority?: TicketPriority; adminNote?: string | null }) => {
        try {
            setBusyId(t.id)
            await updateSupportTicket(t.id, body)
            if (selected?.id === t.id) setSelected({ ...t, ...body, adminNote: body.adminNote !== undefined ? (body.adminNote || null) : t.adminNote })
            fetchTickets()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to update")
        } finally {
            setBusyId(null)
        }
    }

    const saveNote = async () => {
        if (!selected) return
        try {
            setSavingNote(true)
            await updateSupportTicket(selected.id, { adminNote: noteDraft })
            setSelected({ ...selected, adminNote: noteDraft || null })
            fetchTickets()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to save note")
        } finally {
            setSavingNote(false)
        }
    }

    const remove = async (t: SupportTicketDTO) => {
        if (!confirm(`Delete ticket ${t.ticketId}? This cannot be undone.`)) return
        try {
            setBusyId(t.id)
            await deleteSupportTicket(t.id)
            if (selected?.id === t.id) setSelected(null)
            fetchTickets()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete")
        } finally {
            setBusyId(null)
        }
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        setPage(1)
        setSearch(searchInput.trim())
    }

    const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—")

    return (
        <div className="space-y-6 max-w-[1200px]">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <LifeBuoy className="h-7 w-7 text-[var(--brand-purple)]" /> Support Tickets
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Tickets raised from the mobile app.{openCount > 0 ? ` ${openCount} open.` : ""}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <Input
                            placeholder="Search subject, ticket, customer..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full sm:w-[260px] border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                        />
                        <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white shrink-0">
                            <Search className="h-4 w-4" />
                        </Button>
                    </form>
                    <div className="flex gap-1 bg-slate-100 rounded-lg p-1 flex-wrap">
                        {FILTERS.map((f) => (
                            <button key={f.key} onClick={() => { setStatus(f.key); setPage(1) }}
                                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${status === f.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{error}</div>}

            <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-5 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">{total} ticket{total === 1 ? "" : "s"}</h2>
                </div>

                <div className="relative w-full overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="border-b border-slate-200 bg-white">
                            <tr>
                                <th className="h-12 px-4 font-medium text-slate-900">Subject</th>
                                <th className="h-12 px-4 font-medium text-slate-900">Customer</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Status</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Priority</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center">Date</th>
                                <th className="h-12 px-4 font-medium text-slate-900 text-center w-[80px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
                            ) : tickets.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-500"><Inbox className="h-6 w-6 mx-auto mb-2 text-slate-300" />No tickets found.</td></tr>
                            ) : tickets.map((t) => (
                                <tr key={t.id} onClick={() => openTicket(t)} className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer">
                                    <td className="py-4 px-4">
                                        <div className="text-slate-900 font-medium">{t.subject}</div>
                                        <div className="text-xs text-slate-400 font-mono">{t.ticketId}{t.category ? ` · ${t.category}` : ""}</div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="text-slate-700">{t.customer.name || "—"}</div>
                                        <div className="text-xs text-slate-400">{t.customer.phone || t.customer.email || "—"}</div>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium ${STATUS_STYLES[t.status] || ""}`}>{STATUS_LABELS[t.status] || t.status}</span>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium capitalize ${PRIORITY_STYLES[t.priority] || ""}`}>{t.priority}</span>
                                    </td>
                                    <td className="py-4 px-4 text-center text-slate-500 text-xs whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                                    <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-center">
                                            <button title="Delete" onClick={() => remove(t)} disabled={busyId === t.id}
                                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                                                {busyId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail modal */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
                    <div className="bg-white w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-8 rounded-2xl shadow-xl relative" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setSelected(null)} className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100">
                            <X className="h-5 w-5" />
                        </button>
                        <div className="flex items-center gap-3 mb-5">
                            <div className="h-11 w-11 rounded-xl bg-purple-50 flex items-center justify-center">
                                <LifeBuoy className="h-5 w-5 text-[var(--brand-purple)]" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">{selected.subject}</h2>
                                <span className="text-xs text-slate-400 font-mono">{selected.ticketId}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <label className="text-sm">
                                <span className="block text-slate-500 mb-1">Status</span>
                                <select
                                    value={selected.status}
                                    onChange={(e) => patch(selected, { status: e.target.value as TicketStatus })}
                                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                                >
                                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                </select>
                            </label>
                            <label className="text-sm">
                                <span className="block text-slate-500 mb-1">Priority</span>
                                <select
                                    value={selected.priority}
                                    onChange={(e) => patch(selected, { priority: e.target.value as TicketPriority })}
                                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 capitalize"
                                >
                                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </label>
                        </div>

                        <div className="space-y-3 text-sm">
                            <Field label="Customer" value={selected.customer.name} />
                            <Field label="Phone" value={selected.customer.phone} />
                            <Field label="Email" value={selected.customer.email} />
                            <Field label="Device" value={selected.deviceId} />
                            <Field label="App version" value={selected.appVersion} />
                            <Field label="Category" value={selected.category} />
                            <Field label="Submitted" value={fmtDate(selected.createdAt)} />
                            <div>
                                <div className="text-slate-500 mb-1">Message</div>
                                <div className="text-slate-900 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 border border-slate-100">{selected.message || "—"}</div>
                            </div>
                            <div>
                                <div className="text-slate-500 mb-1">Conversation</div>
                                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2 max-h-[260px] overflow-y-auto">
                                    {loadingMessages ? (
                                        <div className="text-center text-slate-400 py-2"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
                                    ) : messages.length === 0 ? (
                                        <div className="text-center text-xs text-slate-400 py-2">No replies yet. Messages you send here are visible to the customer in the app.</div>
                                    ) : messages.map((m) => (
                                        <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.sender === "admin" ? "ml-auto bg-[var(--brand-purple)] text-white" : "mr-auto bg-white border border-slate-200 text-slate-900"}`}>
                                            {m.message}
                                            <div className={`text-[10px] mt-1 ${m.sender === "admin" ? "text-white/70" : "text-slate-400"}`}>
                                                {m.sender === "admin" ? "Support" : selected.customer.name || "Customer"} · {fmtDate(m.createdAt)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <Input
                                        value={replyDraft}
                                        onChange={(e) => setReplyDraft(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendReply() } }}
                                        placeholder="Reply to the customer…"
                                        className="border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                                    />
                                    <Button size="sm" onClick={sendReply} disabled={sendingReply || !replyDraft.trim()}
                                        className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white shrink-0 h-10 px-4">
                                        {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                            <div>
                                <div className="text-slate-500 mb-1">Internal note</div>
                                <textarea
                                    value={noteDraft}
                                    onChange={(e) => setNoteDraft(e.target.value)}
                                    placeholder="Notes visible to admins only…"
                                    className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                                />
                                <div className="flex justify-end mt-2">
                                    <Button size="sm" variant="outline" onClick={saveNote} disabled={savingNote || noteDraft === (selected.adminNote || "")}>
                                        {savingNote ? "Saving..." : "Save note"}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-6">
                            {selected.customer.email && (
                                <a href={`mailto:${selected.customer.email}?subject=Re: ${encodeURIComponent(selected.subject)}`} className="flex-1">
                                    <Button className="w-full bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white">Reply by email</Button>
                                </a>
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
