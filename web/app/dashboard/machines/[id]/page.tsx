"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { getMachine } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDbDateTime } from "@/lib/utils"
import { getGradeStyle } from "@/lib/grades"
import { ArrowLeft, ExternalLink, Monitor, TrendingUp, TrendingDown, Minus, Package } from "lucide-react"
import { isMachineActive, NOW_TICK_MS, POLL_INTERVAL_MS } from "@/lib/machine-status"

type MachineDetail = {
    machine: any
    test_history: any[]
    machine_history?: any[]
}

// Ordered from best to worst for comparison
const GRADE_ORDER: Record<string, number> = {
    "A+": 0,
    "A": 1,
    "B": 2,
    "C": 3,
    "D": 4,
    "E": 5,
    "F": 6,
    "Reject": 7,
}

function gradeRank(grade: string | undefined): number {
    if (!grade) return 99
    return GRADE_ORDER[grade] ?? 99
}

type ChangeType = "improved" | "degraded" | "same" | "new"

interface ComponentChange {
    key: string
    previousGrade?: string
    currentGrade: string
    currentScore?: number
    changeType: ChangeType
}

function diffSnapshots(
    current: Record<string, { grade: string; score?: number }>,
    previous: Record<string, { grade: string; score?: number }> | null
): ComponentChange[] {
    const allKeys = new Set([...Object.keys(current), ...(previous ? Object.keys(previous) : [])])
    const changes: ComponentChange[] = []

    for (const key of allKeys) {
        const cur = current[key]
        const prev = previous ? previous[key] : undefined

        if (!cur) continue // component removed — skip

        const changeType: ChangeType = !prev
            ? "new"
            : gradeRank(cur.grade) < gradeRank(prev.grade)
            ? "improved"
            : gradeRank(cur.grade) > gradeRank(prev.grade)
            ? "degraded"
            : "same"

        changes.push({
            key,
            previousGrade: prev?.grade,
            currentGrade: cur.grade,
            currentScore: cur.score,
            changeType,
        })
    }

    // Sort: changed items first (improved, degraded, new), then same
    const order: Record<ChangeType, number> = { improved: 0, degraded: 1, new: 2, same: 3 }
    return changes.sort((a, b) => order[a.changeType] - order[b.changeType])
}

function ChangeIndicator({ type }: { type: ChangeType }) {
    if (type === "improved")
        return (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                <TrendingUp className="h-3 w-3" /> Improved
            </span>
        )
    if (type === "degraded")
        return (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                <TrendingDown className="h-3 w-3" /> Degraded
            </span>
        )
    if (type === "new")
        return (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                <Package className="h-3 w-3" /> New
            </span>
        )
    return (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            <Minus className="h-3 w-3" /> No change
        </span>
    )
}

function ComponentChangePill({
    change,
    showUnchanged,
}: {
    change: ComponentChange
    showUnchanged: boolean
}) {
    if (change.changeType === "same" && !showUnchanged) return null

    const style = getGradeStyle(change.currentGrade)
    const prevStyle = change.previousGrade ? getGradeStyle(change.previousGrade) : null

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide w-24 shrink-0">
                {change.key}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
                {change.previousGrade && change.changeType !== "new" && (
                    <>
                        <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${prevStyle?.bg ?? "bg-slate-100"} ${prevStyle?.text ?? "text-slate-600"} opacity-60`}
                        >
                            {change.previousGrade}
                        </span>
                        <span className="text-slate-300 text-xs">→</span>
                    </>
                )}
                <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style.bg} ${style.text}`}
                >
                    {change.currentGrade}
                    {change.currentScore != null ? ` (${change.currentScore})` : ""}
                </span>
                <ChangeIndicator type={change.changeType} />
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
    const [showUnchanged, setShowUnchanged] = useState(false)

    useEffect(() => {
        let mounted = true

        async function load(showLoading: boolean) {
            if (!id) return
            if (showLoading) {
                setLoading(true)
                setError(null)
            }
            try {
                const result = await getMachine(id as string)
                if (!mounted) return
                setData(result)
                setCustomName(result.machine?.custom_name || "")
            } catch (err) {
                console.error(err)
                if (showLoading) {
                    setError(err instanceof Error ? err.message : "Failed to load machine history")
                }
            } finally {
                if (showLoading) setLoading(false)
            }
        }

        load(true)
        const poll = setInterval(() => load(false), POLL_INTERVAL_MS)
        return () => {
            mounted = false
            clearInterval(poll)
        }
    }, [id])

    useEffect(() => {
        const t = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS)
        return () => clearInterval(t)
    }, [])

    if (loading) return <div className="p-8 text-center text-slate-500">Loading machine history...</div>
    if (error) return <div className="p-8 text-center text-rose-600">{error}</div>
    if (!data) return <div className="p-8 text-center text-slate-500">Machine not found.</div>

    const { machine, test_history, machine_history = [] } = data

    // Build diffs — entries come DESC from API, so oldest is last
    // We want to compare each entry to the one before it (chronologically)
    const chronological = [...machine_history].reverse()

    interface DiffEntry {
        entry: typeof machine_history[0]
        changes: ComponentChange[]
        isFirst: boolean
    }

    const diffEntries: DiffEntry[] = chronological.map((entry, i) => {
        const currentGrades: Record<string, { grade: string; score?: number }> =
            typeof entry.component_grades === "string"
                ? JSON.parse(entry.component_grades)
                : entry.component_grades || {}

        const previousEntry = i > 0 ? chronological[i - 1] : null
        const previousGrades: Record<string, { grade: string; score?: number }> | null = previousEntry
            ? typeof previousEntry.component_grades === "string"
                ? JSON.parse(previousEntry.component_grades)
                : previousEntry.component_grades || {}
            : null

        return {
            entry,
            changes: diffSnapshots(currentGrades, previousGrades),
            isFirst: i === 0,
        }
    })

    // Re-reverse so newest is at top
    diffEntries.reverse()

    const hasAnyChange = diffEntries.some((d) =>
        d.changes.some((c) => c.changeType !== "same")
    )

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

            <Card className="border border-slate-200 shadow-none">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        {(() => {
                            const latestGrade = test_history.length > 0 ? test_history[0].overall_grade : undefined;
                            const style = getGradeStyle(latestGrade);
                            return (
                                <div className={`h-10 w-10 rounded-full ${style.bg} flex items-center justify-center shrink-0`}>
                                    <Monitor className={`h-5 w-5 ${style.text}`} />
                                </div>
                            );
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
                                            <span
                                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}
                                            >
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
                                onChange={(e) => setCustomName(e.target.value)}
                                placeholder="Add a custom name"
                            />
                            <Button
                                variant="outline"
                                className="rounded-full border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9 text-sm font-medium"
                                disabled={savingName}
                                onClick={async () => {
                                    if (!id) return
                                    setSavingName(true)
                                    setSaveError(null)
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
                            <div className="text-xs text-slate-400">
                                Device name: {machine.computer_name}
                            </div>
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
                    {test_history.map((test) => (
                        <div
                            key={test.id}
                            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between"
                        >
                            <div>
                                <div className="text-sm font-semibold text-slate-900">
                                    {formatDbDateTime(test.timestamp)}
                                </div>
                                <div className="text-xs text-slate-500">
                                    Report #{test.report_id} • {test.overall_pass ? "PASS" : "FAIL"}
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                                <div className="text-xs text-slate-500 truncate">
                                    Serial: {test.system_serial || "-"}
                                </div>
                                <Link href={`/dashboard/results/${test.id}`} className="shrink-0">
                                    <Button
                                        variant="outline"
                                        className="w-full sm:w-auto rounded-full border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9 text-sm font-medium"
                                    >
                                        View Report
                                        <ExternalLink className="ml-1.5 shrink-0 h-3.5 w-3.5" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ))}

                    {test_history.length === 0 && (
                        <div className="text-center text-slate-500 py-8">
                            No tests recorded for this machine yet.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Machine History — Component Change Timeline */}
            <Card className="border border-slate-200 shadow-none">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg text-slate-900">Component History</CardTitle>
                        <p className="text-sm text-slate-500 mt-1">
                            {machine_history.length} snapshot{machine_history.length === 1 ? "" : "s"} recorded.
                            {hasAnyChange && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                    Component changes detected
                                </span>
                            )}
                        </p>
                    </div>
                    {machine_history.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 h-8 text-xs rounded-full border-slate-200"
                            onClick={() => setShowUnchanged((v) => !v)}
                        >
                            {showUnchanged ? "Hide unchanged" : "Show unchanged"}
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="grid gap-0">
                    {diffEntries.length === 0 && (
                        <div className="text-center text-slate-500 py-8">
                            No component history recorded for this device yet.
                        </div>
                    )}

                    {diffEntries.map((d, idx) => {
                        const hasChanges = d.changes.some((c) => c.changeType !== "same")
                        const visibleChanges = showUnchanged ? d.changes : d.changes.filter((c) => c.changeType !== "same")
                        const isLast = idx === diffEntries.length - 1

                        return (
                            <div key={d.entry.id} className="flex gap-4">
                                {/* Timeline line */}
                                <div className="flex flex-col items-center">
                                    <div
                                        className={`mt-3.5 h-3 w-3 rounded-full shrink-0 border-2 ${
                                            hasChanges
                                                ? "border-amber-400 bg-amber-100"
                                                : d.isFirst
                                                ? "border-blue-400 bg-blue-100"
                                                : "border-slate-300 bg-white"
                                        }`}
                                    />
                                    {!isLast && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                                </div>

                                {/* Entry content */}
                                <div className={`flex-1 pb-6 ${isLast ? "pb-2" : ""}`}>
                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                        <span className="text-sm font-semibold text-slate-900">
                                            {formatDbDateTime(d.entry.timestamp)}
                                        </span>
                                        <span className="text-xs text-slate-400">
                                            {d.entry.source || "unknown"}
                                            {d.entry.app_version ? ` · v${d.entry.app_version}` : ""}
                                        </span>
                                        {d.isFirst && (
                                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                                Initial snapshot
                                            </span>
                                        )}
                                        {!d.isFirst && !hasChanges && (
                                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                                No component changes
                                            </span>
                                        )}
                                        {!d.isFirst && hasChanges && (
                                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                                {d.changes.filter((c) => c.changeType !== "same").length} component{d.changes.filter((c) => c.changeType !== "same").length === 1 ? "" : "s"} changed
                                            </span>
                                        )}
                                    </div>

                                    {/* Component changes */}
                                    {(d.isFirst || showUnchanged || hasChanges) && (
                                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 grid gap-2">
                                            {d.isFirst ? (
                                                // First snapshot — show all as initial
                                                d.changes.map((change) => {
                                                    const style = getGradeStyle(change.currentGrade)
                                                    return (
                                                        <div key={change.key} className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide w-24 shrink-0">
                                                                {change.key}
                                                            </span>
                                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style.bg} ${style.text}`}>
                                                                {change.currentGrade}
                                                                {change.currentScore != null ? ` (${change.currentScore})` : ""}
                                                            </span>
                                                        </div>
                                                    )
                                                })
                                            ) : visibleChanges.length === 0 ? (
                                                <p className="text-xs text-slate-400 italic">All components unchanged.</p>
                                            ) : (
                                                visibleChanges.map((change) => (
                                                    <ComponentChangePill
                                                        key={change.key}
                                                        change={change}
                                                        showUnchanged={showUnchanged}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </CardContent>
            </Card>
        </div>
    )
}
