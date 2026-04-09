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
import { ArrowLeft, ExternalLink, Monitor } from "lucide-react"
import { isMachineActive, NOW_TICK_MS, POLL_INTERVAL_MS } from "@/lib/machine-status"

type MachineDetail = {
    machine: any
    test_history: any[]
    machine_history?: any[]
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
                                    Report #{test.report_id} â€¢ {test.overall_pass ? "PASS" : "FAIL"}
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

            <Card className="border border-slate-200 shadow-none">
                <CardHeader className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg text-slate-900">Machine History</CardTitle>
                        <p className="text-sm text-slate-500 mt-1">
                            {machine_history.length} record{machine_history.length === 1 ? "" : "s"} recorded.
                        </p>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                    {machine_history.map((entry: any) => {
                        const grades = typeof entry.component_grades === "string"
                            ? JSON.parse(entry.component_grades)
                            : entry.component_grades || {};
                        const components = Object.keys(grades);
                        return (
                            <div
                                key={entry.id}
                                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                            >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-900">
                                            {formatDbDateTime(entry.timestamp)}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Source: {entry.source || "unknown"} {entry.app_version ? `• v${entry.app_version}` : ""}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {components.length === 0 && (
                                        <span className="text-xs text-slate-500">No component grades recorded.</span>
                                    )}
                                    {components.map((key) => {
                                        const grade = grades[key]?.grade || "-";
                                        const score = grades[key]?.score;
                                        const style = getGradeStyle(grade);
                                        return (
                                            <span
                                                key={key}
                                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${style.bg} ${style.text}`}
                                            >
                                                <span className="uppercase">{key}</span>
                                                <span>{grade}{score != null ? ` (${score})` : ""}</span>
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {machine_history.length === 0 && (
                        <div className="text-center text-slate-500 py-8">
                            No machine history recorded for this device yet.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
