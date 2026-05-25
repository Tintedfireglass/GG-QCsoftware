"use client"

import React, { useEffect, useMemo, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import {
    getAdminFreeTrials,
    getTrialMachineAutoQCRuns,
    AdminFreeTrialRow,
    AutoQCRun,
    AutoQCComponentGrade,
} from "@/lib/api"
import { Input } from "@/components/ui/input"
import { RefreshCw, Search, FlaskConical, X, ChevronDown, ChevronRight } from "lucide-react"
import { getGradeStyle, gradeHeroColor } from "@/lib/grades"

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

function formatDateShort(value: string | null | undefined) {
    if (!value) return "—"
    const d = new Date(value)
    if (!Number.isFinite(d.getTime())) return "—"
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatTime(value: string | null | undefined) {
    if (!value) return ""
    const d = new Date(value)
    if (!Number.isFinite(d.getTime())) return ""
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

function statusPill(status: TrialStatus) {
    const base = "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
    if (status === "Active") return `${base} bg-emerald-100 text-emerald-700`
    if (status === "Expired") return `${base} bg-amber-100 text-amber-800`
    return `${base} bg-rose-100 text-rose-700`
}

// Pretty-print the component name from the key
function componentLabel(key: string): string {
    const map: Record<string, string> = {
        CPU: "CPU",
        RAM: "RAM",
        Storage: "Storage",
        Battery: "Battery",
        SMART: "SMART (Disk)",
    }
    return map[key] ?? key
}

// ── Component grade row ────────────────────────────────────────────────────────
function ComponentGradeRow({
    name,
    cg,
}: {
    name: string
    cg: AutoQCComponentGrade
}) {
    const gs = getGradeStyle(cg.grade)
    const scoreColor =
        cg.score >= 85
            ? "text-emerald-600"
            : cg.score >= 70
            ? "text-amber-600"
            : "text-rose-600"

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
            <div className="flex-1 text-sm font-medium text-slate-800">{componentLabel(name)}</div>
            <span className={`tabular-nums font-bold text-sm ${scoreColor}`}>{cg.score}</span>
            <span
                className={`w-9 text-center text-xs font-bold rounded px-1.5 py-0.5 ${gs.bg} ${gs.text}`}
            >
                {cg.grade}
            </span>
        </div>
    )
}

// ── Auto QC run card ──────────────────────────────────────────────────────────
function AutoQCRunCard({ run }: { run: AutoQCRun }) {
    const [expanded, setExpanded] = useState(false)
    const components = Object.entries(run.component_grades ?? {})

    // Derive an overall grade from the component grades (worst grade wins)
    const gradeOrder = ["A+", "A", "B", "C", "D", "E", "F", "Reject"]
    const worstGrade = components.reduce((worst, [, cg]) => {
        const wi = gradeOrder.indexOf(worst)
        const ci = gradeOrder.indexOf(cg.grade)
        return ci > wi ? cg.grade : worst
    }, "A+")

    const gs = getGradeStyle(worstGrade)

    return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs text-slate-400 font-mono">#{run.id}</span>
                        <span className="text-xs text-slate-500">{formatDateShort(run.timestamp)}</span>
                        <span className="text-xs text-slate-400">{formatTime(run.timestamp)}</span>
                        <span className="text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 font-mono">
                            {run.source}
                        </span>
                    </div>
                    {(run.manufacturer || run.model) && (
                        <div className="font-semibold text-slate-900 text-sm leading-tight">
                            {run.manufacturer} {run.model}
                        </div>
                    )}
                    {run.computer_name && (
                        <div className="text-xs text-slate-500 mt-0.5">{run.computer_name}</div>
                    )}
                </div>

                {/* Worst-component grade badge */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className={`text-xl font-black ${gradeHeroColor(worstGrade)}`}>
                        {worstGrade}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${gs.bg} ${gs.text}`}>
                        worst component
                    </span>
                </div>
            </div>

            {/* Toggle row */}
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 transition-colors text-xs text-slate-500 font-medium"
            >
                <span>{components.length} component{components.length !== 1 ? "s" : ""} tested</span>
                {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                )}
            </button>

            {/* Component grade breakdown */}
            {expanded && components.length > 0 && (
                <div className="border-t border-slate-100">
                    <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-50 border-b border-slate-100">
                        <div className="flex-1 text-xs text-slate-400 font-medium">Component</div>
                        <div className="text-xs text-slate-400 font-medium w-9 text-right">Score</div>
                        <div className="w-9 text-center text-xs text-slate-400 font-medium">Grade</div>
                    </div>
                    {components.map(([name, cg]) => (
                        <ComponentGradeRow key={name} name={name} cg={cg} />
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Slide-over drawer ──────────────────────────────────────────────────────────
interface QCDrawerProps {
    trial: AdminFreeTrialRow
    onClose: () => void
}

function QCDrawer({ trial, onClose }: QCDrawerProps) {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [runs, setRuns] = useState<AutoQCRun[]>([])

    const machineLabel =
        trial.machine_identifier ||
        (typeof trial.machine_id === "number" ? `#${trial.machine_id}` : null) ||
        trial.computer_name ||
        trial.machine_serial

    useEffect(() => {
        let cancelled = false
        async function load() {
            try {
                setError("")
                setLoading(true)
                const data = await getTrialMachineAutoQCRuns(trial.machine_serial)
                if (!cancelled) setRuns(data.results)
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load results")
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        void load()
        return () => { cancelled = true }
    }, [trial.machine_serial])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        document.addEventListener("keydown", handler)
        return () => document.removeEventListener("keydown", handler)
    }, [onClose])

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Drawer panel */}
            <div
                className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-lg bg-white shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-label="Auto QC results"
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200 bg-slate-50 shrink-0">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <FlaskConical className="h-4 w-4 text-[var(--brand-purple)]" />
                            <span className="text-xs font-semibold text-[var(--brand-purple)] uppercase tracking-wider">
                                Auto QC Runs
                            </span>
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 leading-tight truncate">
                            {machineLabel}
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {trial.email} · Serial: {trial.machine_serial}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            Background component health checks run weekly by the app
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
                            <RefreshCw className="h-6 w-6 animate-spin" />
                            <span className="text-sm">Loading auto QC runs…</span>
                        </div>
                    ) : error ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 text-sm">
                            {error}
                        </div>
                    ) : runs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
                            <FlaskConical className="h-8 w-8 opacity-40" />
                            <div className="text-center">
                                <p className="text-sm font-medium text-slate-600">No auto QC runs yet</p>
                                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                                    The app submits weekly background checks automatically. Results will appear here once the device has been active long enough.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-slate-500">
                                {runs.length} auto QC run{runs.length !== 1 ? "s" : ""} recorded for this device
                            </p>
                            {runs.map((run) => (
                                <AutoQCRunCard key={run.id} run={run} />
                            ))}
                        </>
                    )}
                </div>
            </div>
        </>
    )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function FreeTrialsPage() {
    const { user, isSuperAdmin } = useAuth()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<AdminFreeTrialRow[]>([])
    const [search, setSearch] = useState("")
    const [error, setError] = useState("")
    const [refreshing, setRefreshing] = useState(false)
    const [selectedTrial, setSelectedTrial] = useState<AdminFreeTrialRow | null>(null)

    useEffect(() => {
        if (!user) { router.push("/login"); return }
        if (!isSuperAdmin()) { router.push("/dashboard"); return }
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
        try { setRefreshing(true); await load() }
        finally { setRefreshing(false) }
    }

    const handleCloseDrawer = useCallback(() => setSelectedTrial(null), [])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return rows
        return rows.filter((r) =>
            [r.email, r.machine_serial, r.mac_address || "", r.computer_name || "", r.machine_identifier || ""]
                .join(" ").toLowerCase().includes(q)
        )
    }, [rows, search])

    const now = Date.now()

    if (loading) return <div className="p-8 text-center text-slate-500">Loading free trials...</div>

    return (
        <>
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
                                    <th className="h-12 px-6 text-center align-middle font-medium text-slate-900 whitespace-nowrap">Auto QC</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-10 text-center text-slate-500">
                                            No free trials found
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((t) => {
                                        const status = getTrialStatus(t, now)
                                        const machineLabel =
                                            t.machine_identifier ||
                                            (typeof t.machine_id === "number" ? `#${t.machine_id}` : null) ||
                                            t.computer_name ||
                                            "—"
                                        const revokedLabel = t.revoked_at ? formatDate(t.revoked_at) : "—"
                                        const qcCount = t.qc_result_count ?? 0

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
                                                <td className="px-6 py-4 align-middle text-center">
                                                    <button
                                                        id={`trial-autoqc-btn-${t.id}`}
                                                        onClick={() => setSelectedTrial(t)}
                                                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                                            qcCount > 0
                                                                ? "bg-[var(--brand-purple)]/10 text-[var(--brand-purple)] hover:bg-[var(--brand-purple)]/20"
                                                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                                        }`}
                                                        title={`View ${qcCount} auto QC run${qcCount !== 1 ? "s" : ""}`}
                                                    >
                                                        <FlaskConical className="h-3.5 w-3.5" />
                                                        {qcCount > 0 ? (
                                                            <span>{qcCount} run{qcCount !== 1 ? "s" : ""}</span>
                                                        ) : (
                                                            <span>No runs yet</span>
                                                        )}
                                                    </button>
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

            {/* Auto QC Drawer */}
            {selectedTrial && (
                <QCDrawer trial={selectedTrial} onClose={handleCloseDrawer} />
            )}
        </>
    )
}
