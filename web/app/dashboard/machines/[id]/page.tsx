"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { getMachine } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDbDateTime, formatBytes } from "@/lib/utils"
import { getGradeStyle } from "@/lib/grades"
import { ArrowLeft, ExternalLink, Monitor, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { isMachineActive, NOW_TICK_MS, POLL_INTERVAL_MS } from "@/lib/machine-status"

type MachineDetail = {
    machine: any
    test_history: any[]
    machine_history?: any[]
}

// ── Hardware snapshot extraction ──────────────────────────────────────────────

function getRamGB(test: any): number | null {
    if (test.ram_total && test.ram_total > 0)
        return Math.round(test.ram_total / (1024 ** 3))
    return null
}

function getStorageLabel(test: any): string | null {
    try {
        const s = typeof test.storage_details_json === "string"
            ? JSON.parse(test.storage_details_json)
            : test.storage_details_json
        if (!s) return null
        // Sum volume totalBytes
        const volumes: any[] = Array.isArray(s.volumes) ? s.volumes : []
        const totalBytes = volumes.reduce((acc: number, v: any) =>
            acc + (typeof v.totalBytes === "number" ? v.totalBytes : 0), 0)
        if (totalBytes > 0) return formatBytes(totalBytes)
        if (s.totalCapacityGB) return `${Math.round(s.totalCapacityGB)} GB`
    } catch { /* ignore */ }
    return null
}

function getBatteryBrand(test: any): string | null {
    try {
        const b = typeof test.battery_details_json === "string"
            ? JSON.parse(test.battery_details_json)
            : test.battery_details_json
        if (!b || b.isTampered) return null
        return b.manufactureName || b.name || b.partNumber || null
    } catch { /* ignore */ }
    return null
}

function getRamModules(test: any): string | null {
    try {
        const r = typeof test.ram_details_json === "string"
            ? JSON.parse(test.ram_details_json)
            : test.ram_details_json
        if (!r) return null
        const modules: any[] = Array.isArray(r.modules) ? r.modules : []
        if (modules.length === 0) return null
        // e.g. "2× 8 GB DDR4"
        const parts = modules
            .filter((m: any) => m.capacityBytes || m.capacityGb)
            .map((m: any) => {
                const gb = m.capacityGb ?? Math.round((m.capacityBytes ?? 0) / 1024 ** 3)
                return `${gb} GB${m.speed ? ` ${m.speed}MHz` : ""}${m.type ? ` ${m.type}` : ""}`
            })
        return parts.length > 0 ? `${modules.length}× ${parts[0]}` : null
    } catch { /* ignore */ }
    return null
}

interface HwSnapshot {
    cpu: string | null
    ramGB: number | null
    ramModules: string | null
    storage: string | null
    battery: string | null
    serial: string | null
}

function extractSnapshot(test: any): HwSnapshot {
    return {
        cpu: test.cpu_model || null,
        ramGB: getRamGB(test),
        ramModules: getRamModules(test),
        storage: getStorageLabel(test),
        battery: getBatteryBrand(test),
        serial: test.system_serial || null,
    }
}

type ChangeType = "changed" | "same" | "unknown"

interface FieldDiff {
    label: string
    prev: string | null
    curr: string | null
    change: ChangeType
}

function diffSnapshots(prev: HwSnapshot | null, curr: HwSnapshot): FieldDiff[] {
    const fields: Array<{ label: string; prevVal: string | null; currVal: string | null }> = [
        { label: "CPU", prevVal: prev?.cpu ?? null, currVal: curr.cpu },
        {
            label: "RAM",
            prevVal: prev ? (prev.ramModules ?? (prev.ramGB != null ? `${prev.ramGB} GB` : null)) : null,
            currVal: curr.ramModules ?? (curr.ramGB != null ? `${curr.ramGB} GB` : null),
        },
        { label: "Storage", prevVal: prev?.storage ?? null, currVal: curr.storage },
        { label: "Battery", prevVal: prev?.battery ?? null, currVal: curr.battery },
        { label: "Serial", prevVal: prev?.serial ?? null, currVal: curr.serial },
    ]

    return fields.map(({ label, prevVal, currVal }): FieldDiff => {
        if (!prev) return { label, prev: null, curr: currVal, change: "unknown" }
        if (prevVal === null && currVal === null) return { label, prev: null, curr: null, change: "unknown" }
        if (prevVal === currVal) return { label, prev: prevVal, curr: currVal, change: "same" }
        return { label, prev: prevVal, curr: currVal, change: "changed" }
    })
}

// ── Components ────────────────────────────────────────────────────────────────

function FieldChangePill({ diff }: { diff: FieldDiff }) {
    if (diff.change === "unknown" || (diff.curr === null && diff.prev === null)) return null

    const isChanged = diff.change === "changed"

    return (
        <div className="flex items-start gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide w-16 shrink-0 mt-0.5">
                {diff.label}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
                {diff.prev !== null && diff.prev !== diff.curr && (
                    <>
                        <span className="text-xs text-slate-400 line-through">{diff.prev}</span>
                        <span className="text-slate-300 text-xs">→</span>
                    </>
                )}
                <span className={`text-xs font-medium ${isChanged ? "text-slate-900" : "text-slate-600"}`}>
                    {diff.curr ?? "—"}
                </span>
                {isChanged && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                        <TrendingUp className="h-3 w-3" /> Changed
                    </span>
                )}
            </div>
        </div>
    )
}

export default function MachineDetailPage() {
    const { id } = useParams()
    const [data, setData] = useState<MachineDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [customName, setCustomName] = useState("")
    const [savingName, setSavingName] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [nowMs, setNowMs] = useState(() => Date.now())
    const [showAll, setShowAll] = useState(false)

    useEffect(() => {
        let mounted = true
        async function load(showLoading: boolean) {
            if (!id) return
            if (showLoading) { setLoading(true); setError(null) }
            try {
                const result = await getMachine(id as string)
                if (!mounted) return
                setData(result)
                setCustomName(result.machine?.custom_name || "")
            } catch (err) {
                console.error(err)
                if (showLoading)
                    setError(err instanceof Error ? err.message : "Failed to load machine details")
            } finally {
                if (showLoading) setLoading(false)
            }
        }
        load(true)
        const poll = setInterval(() => load(false), POLL_INTERVAL_MS)
        return () => { mounted = false; clearInterval(poll) }
    }, [id])

    useEffect(() => {
        const t = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS)
        return () => clearInterval(t)
    }, [])

    if (loading) return <div className="p-8 text-center text-slate-500">Loading machine history...</div>
    if (error) return <div className="p-8 text-center text-rose-600">{error}</div>
    if (!data) return <div className="p-8 text-center text-slate-500">Machine not found.</div>

    const { machine, test_history } = data

    // Build hardware diff timeline — test_history is DESC, we need chronological order to diff
    const chronological = [...test_history].reverse()
    const diffs = chronological.map((test, i) => {
        const snap = extractSnapshot(test)
        const prevSnap = i > 0 ? extractSnapshot(chronological[i - 1]) : null
        const fieldDiffs = diffSnapshots(prevSnap, snap)
        const hasChanges = i > 0 && fieldDiffs.some(f => f.change === "changed")
        return { test, snap, fieldDiffs, hasChanges, isFirst: i === 0 }
    }).reverse() // back to newest-first for display

    const totalChanges = diffs.filter(d => d.hasChanges).length

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <Link href="/dashboard/machines">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Machines
                    </Button>
                </Link>
            </div>

            {/* Machine Info Card */}
            <Card className="border border-slate-200 shadow-none">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        {(() => {
                            const latestGrade = test_history.length > 0 ? test_history[0].overall_grade : undefined
                            const style = getGradeStyle(latestGrade)
                            return (
                                <div className={`h-10 w-10 rounded-full ${style.bg} flex items-center justify-center shrink-0`}>
                                    <Monitor className={`h-5 w-5 ${style.text}`} />
                                </div>
                            )
                        })()}
                        <div>
                            <CardTitle className="text-lg font-semibold text-slate-900">
                                Device ID: {machine.id}
                            </CardTitle>
                            <div className="text-xs text-slate-500 mt-0.5">
                                Last seen {machine.last_seen ? formatDbDateTime(machine.last_seen) : "-"}
                                <span className="ml-2">
                                    {(() => {
                                        const active = isMachineActive(machine.last_seen, nowMs)
                                        return (
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                                                {active ? "Active" : "Inactive"}
                                            </span>
                                        )
                                    })()}
                                </span>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-4 grid gap-4 text-sm">
                    <div className="flex flex-col gap-2">
                        <span className="text-slate-500">Custom Name</span>
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                value={customName}
                                onChange={e => setCustomName(e.target.value)}
                                placeholder="Add a custom name"
                            />
                            <Button
                                variant="outline"
                                className="rounded-full border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9 text-sm font-medium"
                                disabled={savingName}
                                onClick={async () => {
                                    if (!id) return
                                    setSavingName(true); setSaveError(null)
                                    try {
                                        const token = localStorage.getItem("qc_token")
                                        const res = await fetch(`/api/machines/${id}`, {
                                            method: "PATCH",
                                            headers: {
                                                "Content-Type": "application/json",
                                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                            },
                                            body: JSON.stringify({ customName }),
                                        })
                                        if (!res.ok) {
                                            const err = await res.json()
                                            throw new Error(err.message || "Failed to save name")
                                        }
                                        const updated = await res.json()
                                        setData({ machine: updated.machine, test_history })
                                        setCustomName(updated.machine?.custom_name || "")
                                    } catch (err) {
                                        setSaveError(err instanceof Error ? err.message : "Failed to save name")
                                    } finally {
                                        setSavingName(false)
                                    }
                                }}
                            >
                                {savingName ? "Saving..." : "Save"}
                            </Button>
                        </div>
                        {saveError && <div className="text-xs text-rose-600">{saveError}</div>}
                        {machine.computer_name && (
                            <div className="text-xs text-slate-400">Device name: {machine.computer_name}</div>
                        )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">Machine ID</span>
                            <span className="font-medium text-slate-900">{machine.machine_id}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">Serial</span>
                            <span className="font-medium text-slate-900">{machine.serial_number || "N/A"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">Manufacturer</span>
                            <span className="font-medium text-slate-900">{machine.manufacturer || "Unknown"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">Model</span>
                            <span className="font-medium text-slate-900">{machine.model || "Unknown"}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Test History */}
            <Card className="border border-slate-200 shadow-none">
                <CardHeader className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg text-slate-900">Test History</CardTitle>
                        <p className="text-sm text-slate-500 mt-1">
                            {test_history.length} test{test_history.length === 1 ? "" : "s"} recorded.
                        </p>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                    {test_history.map(test => (
                        <div key={test.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <div className="text-sm font-semibold text-slate-900">{formatDbDateTime(test.timestamp)}</div>
                                <div className="text-xs text-slate-500">
                                    Report #{test.report_id} • {test.overall_pass ? "PASS" : "FAIL"}
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                                <div className="text-xs text-slate-500 truncate">Serial: {test.system_serial || "-"}</div>
                                <Link href={`/dashboard/results/${test.id}`} className="shrink-0">
                                    <Button variant="outline" className="w-full sm:w-auto rounded-full border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9 text-sm font-medium">
                                        View Report
                                        <ExternalLink className="ml-1.5 shrink-0 h-3.5 w-3.5" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ))}
                    {test_history.length === 0 && (
                        <div className="text-center text-slate-500 py-8">No tests recorded for this machine yet.</div>
                    )}
                </CardContent>
            </Card>

            {/* Hardware Change Timeline */}
            {test_history.length > 0 && (
                <Card className="border border-slate-200 shadow-none">
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                            <CardTitle className="text-lg text-slate-900">Hardware History</CardTitle>
                            <p className="text-sm text-slate-500 mt-1">
                                Comparing hardware specs across {test_history.length} QC report{test_history.length === 1 ? "" : "s"}.
                                {totalChanges > 0 ? (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                        {totalChanges} part change{totalChanges === 1 ? "" : "s"} detected
                                    </span>
                                ) : test_history.length > 1 ? (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                        No part changes detected
                                    </span>
                                ) : null}
                            </p>
                        </div>
                        {diffs.length > 1 && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0 h-8 text-xs rounded-full border-slate-200"
                                onClick={() => setShowAll(v => !v)}
                            >
                                {showAll ? "Show changes only" : "Show all snapshots"}
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent className="grid gap-0">
                        {diffs.map((d, idx) => {
                            const isLast = idx === diffs.length - 1
                            // By default only show: first entry, entries with changes
                            // When showAll = true show everything
                            const shouldShow = showAll || d.isFirst || d.hasChanges
                            if (!shouldShow) return null

                            const visibleFields = d.isFirst
                                ? d.fieldDiffs.filter(f => f.curr !== null)
                                : d.fieldDiffs.filter(f => f.change === "changed")

                            return (
                                <div key={d.test.id} className="flex gap-4">
                                    {/* Timeline dot + line */}
                                    <div className="flex flex-col items-center">
                                        <div className={`mt-3.5 h-3 w-3 rounded-full shrink-0 border-2 ${
                                            d.hasChanges
                                                ? "border-amber-400 bg-amber-100"
                                                : d.isFirst
                                                ? "border-blue-400 bg-blue-100"
                                                : "border-emerald-400 bg-emerald-50"
                                        }`} />
                                        {!isLast && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                                    </div>

                                    {/* Entry content */}
                                    <div className={`flex-1 ${isLast ? "pb-2" : "pb-6"}`}>
                                        <div className="flex items-center gap-2 flex-wrap mb-2">
                                            <span className="text-sm font-semibold text-slate-900">
                                                {formatDbDateTime(d.test.timestamp)}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                Report #{d.test.report_id}
                                            </span>
                                            {d.isFirst && (
                                                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                                    Baseline
                                                </span>
                                            )}
                                            {!d.isFirst && d.hasChanges && (
                                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                                    <TrendingUp className="h-3 w-3" />
                                                    {visibleFields.length} part{visibleFields.length === 1 ? "" : "s"} changed
                                                </span>
                                            )}
                                            {!d.isFirst && !d.hasChanges && (
                                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                    <Minus className="h-3 w-3" /> No changes
                                                </span>
                                            )}
                                        </div>

                                        {(d.isFirst || d.hasChanges) && (
                                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 grid gap-2.5">
                                                {visibleFields.length === 0 ? (
                                                    <p className="text-xs text-slate-400 italic">No hardware data available for this report.</p>
                                                ) : (
                                                    visibleFields.map(f => (
                                                        <FieldChangePill key={f.label} diff={f} />
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}

                        {test_history.length === 1 && (
                            <div className="flex gap-4">
                                <div className="flex flex-col items-center">
                                    <div className="mt-3.5 h-3 w-3 rounded-full shrink-0 border-2 border-blue-400 bg-blue-100" />
                                </div>
                                <div className="flex-1 pb-2">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-sm font-semibold text-slate-900">{formatDbDateTime(diffs[0]?.test.timestamp)}</span>
                                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Baseline</span>
                                    </div>
                                    <p className="text-xs text-slate-400">Only one report — run another QC to detect hardware changes.</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
