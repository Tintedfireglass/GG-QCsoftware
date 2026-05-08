"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { getAdminFreeTrials, AdminFreeTrialRow } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { RefreshCw, Search } from "lucide-react"

type TrialStatus = "Active" | "Expired" | "Revoked"

function getTrialStatus(t: AdminFreeTrialRow, now: number): TrialStatus {
    if (!t.is_active) return "Revoked"
    const endMs = new Date(t.trial_end_utc).getTime()
    if (!Number.isFinite(endMs) || endMs <= now) return "Expired"
    return "Active"
}

function formatDate(value: string | null | undefined) {
    if (!value) return "—"
    const d = new Date(value)
    if (!Number.isFinite(d.getTime())) return "—"
    return d.toLocaleString()
}

function statusPill(status: TrialStatus) {
    const base = "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
    if (status === "Active") return `${base} bg-emerald-100 text-emerald-700`
    if (status === "Expired") return `${base} bg-amber-100 text-amber-800`
    return `${base} bg-rose-100 text-rose-700`
}

export default function FreeTrialsPage() {
    const { user, isSuperAdmin } = useAuth()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<AdminFreeTrialRow[]>([])
    const [search, setSearch] = useState("")
    const [error, setError] = useState("")
    const [refreshing, setRefreshing] = useState(false)

    useEffect(() => {
        if (!user) {
            router.push("/login")
            return
        }
        if (!isSuperAdmin()) {
            router.push("/dashboard")
            return
        }
        void load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, router])

    const load = async () => {
        try {
            setError("")
            setLoading(true)
            const data = await getAdminFreeTrials()
            setRows(Array.isArray(data?.trials) ? data.trials : [])
        } catch (e) {
            setError(e instanceof Error ? e.message : "Server error")
        } finally {
            setLoading(false)
        }
    }

    const onRefresh = async () => {
        try {
            setRefreshing(true)
            await load()
        } finally {
            setRefreshing(false)
        }
    }

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return rows
        return rows.filter((r) => {
            const hay = [
                r.email,
                r.machine_serial,
                r.mac_address || "",
                r.computer_name || "",
                r.machine_identifier || "",
            ]
                .join(" ")
                .toLowerCase()
            return hay.includes(q)
        })
    }, [rows, search])

    const now = Date.now()

    if (loading) return <div className="p-8 text-center text-slate-500">Loading free trials...</div>

    return (
        <div className="w-full max-w-full">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Free trial activations</h1>
                    <p className="text-slate-600 mt-1">Lists device trials that started from the app.</p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search email, serial, machine..."
                            className="pl-9 w-[280px] h-11 rounded-xl border border-slate-200 focus-visible:ring-2 focus-visible:ring-[var(--brand-purple)]"
                        />
                    </div>

                    <button
                        onClick={onRefresh}
                        disabled={refreshing}
                        className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        title="Refresh"
                    >
                        <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
                    {error}
                </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="h-12 px-6 text-left align-middle font-medium text-slate-900 whitespace-nowrap">Status</th>
                                <th className="h-12 px-6 text-left align-middle font-medium text-slate-900 whitespace-nowrap">Email</th>
                                <th className="h-12 px-6 text-left align-middle font-medium text-slate-900 whitespace-nowrap">Machine</th>
                                <th className="h-12 px-6 text-left align-middle font-medium text-slate-900 whitespace-nowrap">Trial start</th>
                                <th className="h-12 px-6 text-left align-middle font-medium text-slate-900 whitespace-nowrap">Trial end</th>
                                <th className="h-12 px-6 text-left align-middle font-medium text-slate-900 whitespace-nowrap">Revoked</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-10 text-center text-slate-500">
                                        No free trials found
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((t) => {
                                    const status = getTrialStatus(t, now)
                                    const machineLabel =
                                        t.machine_identifier ||
                                        (typeof t.machine_id === "number" ? `#${t.machine_id}` : null) ||
                                        (t.computer_name ? t.computer_name : null) ||
                                        "—"
                                    const revokedLabel = t.revoked_at ? formatDate(t.revoked_at) : "—"
                                    return (
                                        <tr key={t.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-4 align-middle whitespace-nowrap">
                                                <span className={statusPill(status)}>{status}</span>
                                            </td>
                                            <td className="px-6 py-4 align-middle text-slate-900 whitespace-nowrap">
                                                {t.email}
                                            </td>
                                            <td className="px-6 py-4 align-middle text-slate-700">
                                                <div className="font-medium text-slate-900">{machineLabel}</div>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    Serial: {t.machine_serial || "—"}
                                                    {t.mac_address ? ` • MAC: ${t.mac_address}` : ""}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 align-middle text-slate-700 whitespace-nowrap">
                                                {formatDate(t.trial_start_utc)}
                                            </td>
                                            <td className="px-6 py-4 align-middle text-slate-700 whitespace-nowrap">
                                                {formatDate(t.trial_end_utc)}
                                            </td>
                                            <td className="px-6 py-4 align-middle text-slate-700">
                                                <div className="whitespace-nowrap">{revokedLabel}</div>
                                                {t.revoke_reason ? (
                                                    <div className="text-xs text-slate-500 mt-1">{t.revoke_reason}</div>
                                                ) : null}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

