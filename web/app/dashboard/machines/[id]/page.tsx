"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { getMachine, updateMachineCustomName } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDbDateTime, formatBytes } from "@/lib/utils"
import { getGradeStyle } from "@/lib/platforms/windows/grades"
import { ArrowLeft, ExternalLink, Monitor, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { isMachineActive, NOW_TICK_MS, POLL_INTERVAL_MS } from "@/lib/platforms/windows/machine-status"

type MachineDetail = {
    machine: any
    test_history: any[]
    machine_history?: any[]
}

// ── JSON parse helpers ────────────────────────────────────────────────────────

function parseJson(val: any): any {
    if (!val) return null
    try { return typeof val === "string" ? JSON.parse(val) : val } catch { return null }
}

// ── Storage: diff by drive serial number ─────────────────────────────────────

interface DriveSnap {
    serial: string       // unique key
    model: string
    sizeGB: number
    isSsd: boolean
    mediaType: string
}

function extractDrives(test: any): DriveSnap[] {
    const s = parseJson(test.storage_details_json)
    if (!s) return []
    const devices: any[] = Array.isArray(s.devices) ? s.devices : []
    return devices
        .filter((d: any) => d.serialNumber || d.model) // must have at least one identifier
        .map((d: any) => ({
            serial: (d.serialNumber || "").trim(),
            model: (d.model || "Unknown").trim(),
            sizeGB: d.sizeGB ?? 0,
            isSsd: !!d.isSsd,
            mediaType: d.mediaType || "",
        }))
}

function driveLabel(d: DriveSnap): string {
    const size = d.sizeGB > 0 ? ` ${Math.round(d.sizeGB)} GB` : ""
    const type = d.isSsd ? " SSD" : d.mediaType ? ` ${d.mediaType}` : " HDD"
    const serial = d.serial ? ` [${d.serial}]` : ""
    return `${d.model}${size}${type}${serial}`
}

type DriveChange =
    | { kind: "added"; drive: DriveSnap }
    | { kind: "removed"; drive: DriveSnap }
    | { kind: "same"; drive: DriveSnap }

function diffDrives(prev: DriveSnap[], curr: DriveSnap[]): DriveChange[] {
    // Use serial as key when available, fall back to model+size
    const identity = (d: DriveSnap) => d.serial || `${d.model}|${Math.round(d.sizeGB)}`

    const prevMap = new Map(prev.map(d => [identity(d), d]))
    const currMap = new Map(curr.map(d => [identity(d), d]))

    const changes: DriveChange[] = []

    for (const [key, d] of currMap) {
        if (prevMap.has(key)) changes.push({ kind: "same", drive: d })
        else changes.push({ kind: "added", drive: d })
    }
    for (const [key, d] of prevMap) {
        if (!currMap.has(key)) changes.push({ kind: "removed", drive: d })
    }

    // Sort: added, removed, same
    const order = { added: 0, removed: 1, same: 2 }
    return changes.sort((a, b) => order[a.kind] - order[b.kind])
}

// ── RAM: diff by slot + capacityGB (no reliable serial numbers from firmware) ──

interface RamModuleSnap {
    slot: number
    capacityGB: number
    speedMHz: number
    memoryType: string
    partNumber: string
}

function extractRamModules(test: any): { modules: RamModuleSnap[]; totalGB: number; usedSlots: number; totalSlots: number } {
    const r = parseJson(test.ram_details_json)
    const totalGB = test.ram_total ? Math.round(test.ram_total / (1024 ** 3)) : (r?.totalCapacityGB ?? 0)

    if (!r) return { modules: [], totalGB, usedSlots: 0, totalSlots: 0 }

    const rawModules: any[] = Array.isArray(r.modules) ? r.modules : []
    const modules: RamModuleSnap[] = rawModules.map((m: any, i: number) => ({
        slot: typeof m.slot === "number" ? m.slot : i,
        capacityGB: m.capacityGB ?? m.capacityGb ?? Math.round((m.capacityBytes ?? 0) / (1024 ** 3)),
        speedMHz: m.speedMHz ?? m.speed ?? 0,
        memoryType: m.memoryType ?? m.type ?? "",
        partNumber: (m.partNumber || "").trim(),
    }))

    return {
        modules,
        totalGB,
        usedSlots: r.usedSlots ?? modules.length,
        totalSlots: r.totalSlots ?? 0,
    }
}

function slotLabel(m: RamModuleSnap): string {
    const type = m.memoryType ? ` ${m.memoryType}` : ""
    const speed = m.speedMHz ? ` ${m.speedMHz}MHz` : ""
    const pn = m.partNumber ? ` (${m.partNumber})` : ""
    return `Slot ${m.slot}: ${m.capacityGB} GB${type}${speed}${pn}`
}

type RamChange =
    | { kind: "added"; module: RamModuleSnap }
    | { kind: "removed"; module: RamModuleSnap }
    | { kind: "changed"; prev: RamModuleSnap; curr: RamModuleSnap }
    | { kind: "same"; module: RamModuleSnap }

function diffRam(prevInfo: ReturnType<typeof extractRamModules>, currInfo: ReturnType<typeof extractRamModules>): RamChange[] {
    // Key by slot number
    const prevBySlot = new Map(prevInfo.modules.map(m => [m.slot, m]))
    const currBySlot = new Map(currInfo.modules.map(m => [m.slot, m]))

    const changes: RamChange[] = []
    const allSlots = new Set([...prevBySlot.keys(), ...currBySlot.keys()])

    for (const slot of allSlots) {
        const p = prevBySlot.get(slot)
        const c = currBySlot.get(slot)
        if (p && c) {
            if (p.capacityGB !== c.capacityGB || (p.partNumber && c.partNumber && p.partNumber !== c.partNumber))
                changes.push({ kind: "changed", prev: p, curr: c })
            else
                changes.push({ kind: "same", module: c })
        } else if (c) {
            changes.push({ kind: "added", module: c })
        } else if (p) {
            changes.push({ kind: "removed", module: p })
        }
    }

    const order = { added: 0, removed: 1, changed: 2, same: 3 }
    return changes.sort((a, b) => order[a.kind] - order[b.kind])
}

// ── Battery: diff by serial number ───────────────────────────────────────────

interface BatterySnap {
    serial: string
    brand: string
    partNumber: string
}

function extractBattery(test: any): BatterySnap | null {
    const b = parseJson(test.battery_details_json)
    if (!b || b.isTampered || !b.isPresent) return null
    return {
        serial: (b.serialNumber || "").trim(),
        brand: (b.manufactureName || b.name || "").trim(),
        partNumber: (b.partNumber || "").trim(),
    }
}

function batteryLabel(bat: BatterySnap): string {
    const parts = [bat.brand, bat.partNumber].filter(Boolean)
    const id = bat.serial ? ` [S/N: ${bat.serial}]` : ""
    return (parts.join(" ") || "Unknown battery") + id
}

// ── Change summary types ──────────────────────────────────────────────────────

interface HwChangeSummary {
    cpu: { prev: string | null; curr: string | null; changed: boolean }
    drives: DriveChange[]
    ram: { changes: RamChange[]; countChanged: boolean; totalGBChanged: boolean; prevGB: number; currGB: number; prevCount: number; currCount: number }
    battery: { prev: BatterySnap | null; curr: BatterySnap | null; changed: boolean }
    systemSerial: { prev: string | null; curr: string | null; changed: boolean }
    hasAnyChange: boolean
}

function computeHwDiff(prev: any | null, curr: any): HwChangeSummary {
    const currDrives = extractDrives(curr)
    const prevDrives = prev ? extractDrives(prev) : []
    const driveChanges = prev ? diffDrives(prevDrives, currDrives) : currDrives.map(d => ({ kind: "same" as const, drive: d }))

    const currRam = extractRamModules(curr)
    const prevRam = prev ? extractRamModules(prev) : { modules: [], totalGB: 0, usedSlots: 0, totalSlots: 0 }
    const ramChanges = prev ? diffRam(prevRam, currRam) : currRam.modules.map(m => ({ kind: "same" as const, module: m }))

    const currBat = extractBattery(curr)
    const prevBat = prev ? extractBattery(prev) : null
    const batteryChanged = !!(prev && prevBat !== null && currBat !== null && (
        (prevBat.serial && currBat.serial && prevBat.serial !== currBat.serial) ||
        (prevBat.partNumber && currBat.partNumber && prevBat.partNumber !== currBat.partNumber)
    ))

    const currCpu = curr.cpu_model || null
    const prevCpu = prev?.cpu_model || null
    const cpuChanged = !!prev && !!prevCpu && !!currCpu && prevCpu !== currCpu

    const currSerial = curr.system_serial || null
    const prevSerial = prev?.system_serial || null
    const serialChanged = !!prev && !!prevSerial && !!currSerial && prevSerial !== currSerial

    const driveHasChanges = driveChanges.some(c => c.kind !== "same")
    const ramHasChanges = ramChanges.some(c => c.kind !== "same")

    return {
        cpu: { prev: prevCpu, curr: currCpu, changed: cpuChanged },
        drives: driveChanges,
        ram: {
            changes: ramChanges,
            countChanged: prev ? prevRam.usedSlots !== currRam.usedSlots : false,
            totalGBChanged: prev ? prevRam.totalGB !== currRam.totalGB : false,
            prevGB: prevRam.totalGB,
            currGB: currRam.totalGB,
            prevCount: prevRam.usedSlots,
            currCount: currRam.usedSlots,
        },
        battery: { prev: prevBat, curr: currBat, changed: batteryChanged },
        systemSerial: { prev: prevSerial, curr: currSerial, changed: serialChanged },
        hasAnyChange: cpuChanged || driveHasChanges || ramHasChanges || batteryChanged || serialChanged,
    }
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

    // Build hardware diff timeline — test_history is DESC, reverse to get chronological
    const chronological = [...test_history].reverse()
    const diffs = chronological.map((test, i) => {
        const prevTest = i > 0 ? chronological[i - 1] : null
        const diff = computeHwDiff(prevTest, test)
        return { test, diff, isFirst: i === 0 }
    }).reverse() // newest-first for display

    const totalChanges = diffs.filter(d => d.diff.hasAnyChange).length

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
                                        const updated = await updateMachineCustomName(String(id), customName)
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
                            const shouldShow = showAll || d.isFirst || d.diff.hasAnyChange
                            if (!shouldShow) return null

                            const driveChanges = d.diff.drives
                            const ramChanges = d.diff.ram.changes
                            const changedDrives = driveChanges.filter(c => c.kind !== "same")
                            const changedRam = ramChanges.filter(c => c.kind !== "same")
                            const numChanges = changedDrives.length + changedRam.length +
                                (d.diff.cpu.changed ? 1 : 0) + (d.diff.battery.changed ? 1 : 0) +
                                (d.diff.systemSerial.changed ? 1 : 0)

                            return (
                                <div key={d.test.id} className="flex gap-4">
                                    <div className="flex flex-col items-center">
                                        <div className={`mt-3.5 h-3 w-3 rounded-full shrink-0 border-2 ${
                                            d.diff.hasAnyChange ? "border-amber-400 bg-amber-100"
                                            : d.isFirst ? "border-blue-400 bg-blue-100"
                                            : "border-emerald-400 bg-emerald-50"
                                        }`} />
                                        {!isLast && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                                    </div>

                                    <div className={`flex-1 ${isLast ? "pb-2" : "pb-6"}`}>
                                        <div className="flex items-center gap-2 flex-wrap mb-2">
                                            <span className="text-sm font-semibold text-slate-900">
                                                {formatDbDateTime(d.test.timestamp)}
                                            </span>
                                            <span className="text-xs text-slate-400">Report #{d.test.report_id}</span>
                                            {d.isFirst && (
                                                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Baseline</span>
                                            )}
                                            {!d.isFirst && d.diff.hasAnyChange && (
                                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                                    ⚠ {numChanges} change{numChanges === 1 ? "" : "s"} detected
                                                </span>
                                            )}
                                            {!d.isFirst && !d.diff.hasAnyChange && (
                                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                    <Minus className="h-3 w-3" /> No changes
                                                </span>
                                            )}
                                        </div>

                                        {(d.isFirst || d.diff.hasAnyChange) && (
                                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 grid gap-3">

                                                {/* CPU */}
                                                {d.diff.cpu.curr && (d.isFirst || d.diff.cpu.changed) && (
                                                    <div className="flex items-start gap-2 flex-wrap">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide w-16 shrink-0 mt-0.5">CPU</span>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {!d.isFirst && d.diff.cpu.prev && (
                                                                <><span className="text-xs text-slate-400 line-through">{d.diff.cpu.prev}</span><span className="text-slate-300">→</span></>
                                                            )}
                                                            <span className="text-xs font-medium text-slate-900">{d.diff.cpu.curr}</span>
                                                            {d.diff.cpu.changed && <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Changed</span>}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Drives */}
                                                {(d.isFirst ? driveChanges : changedDrives).length > 0 && (
                                                    <div className="flex items-start gap-2">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide w-16 shrink-0 mt-0.5">Storage</span>
                                                        <div className="grid gap-1 flex-1">
                                                            {(d.isFirst ? driveChanges : changedDrives).map((dc, i) => (
                                                                <div key={i} className="flex items-center gap-1.5 flex-wrap">
                                                                    {dc.kind === "added" && !d.isFirst && (
                                                                        <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">Added</span>
                                                                    )}
                                                                    {dc.kind === "removed" && (
                                                                        <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">Removed</span>
                                                                    )}
                                                                    <span className={`text-xs ${dc.kind === "removed" ? "line-through text-slate-400" : "font-medium text-slate-900"}`}>
                                                                        {driveLabel(dc.drive)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* RAM */}
                                                {(d.isFirst ? ramChanges : changedRam).length > 0 && (
                                                    <div className="flex items-start gap-2">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide w-16 shrink-0 mt-0.5">RAM</span>
                                                        <div className="grid gap-1 flex-1">
                                                            {/* Show GB/count change summary if applicable */}
                                                            {!d.isFirst && (d.diff.ram.totalGBChanged || d.diff.ram.countChanged) && (
                                                                <div className="text-xs text-slate-500 mb-1">
                                                                    {d.diff.ram.totalGBChanged && `Total: ${d.diff.ram.prevGB} GB → ${d.diff.ram.currGB} GB`}
                                                                    {d.diff.ram.countChanged && ` · Sticks: ${d.diff.ram.prevCount} → ${d.diff.ram.currCount}`}
                                                                </div>
                                                            )}
                                                            {(d.isFirst ? ramChanges : changedRam).map((rc, i) => (
                                                                <div key={i} className="flex items-center gap-1.5 flex-wrap">
                                                                    {rc.kind === "added" && !d.isFirst && (
                                                                        <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">Added</span>
                                                                    )}
                                                                    {rc.kind === "removed" && (
                                                                        <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">Removed</span>
                                                                    )}
                                                                    {rc.kind === "changed" && (
                                                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Changed</span>
                                                                    )}
                                                                    {rc.kind === "changed" ? (
                                                                        <><span className="text-xs text-slate-400 line-through">{slotLabel(rc.prev)}</span><span className="text-slate-300">→</span><span className="text-xs font-medium text-slate-900">{slotLabel(rc.curr)}</span></>
                                                                    ) : rc.kind === "removed" ? (
                                                                        <span className="text-xs line-through text-slate-400">{slotLabel(rc.module)}</span>
                                                                    ) : (
                                                                        <span className="text-xs font-medium text-slate-900">{slotLabel(rc.module)}</span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Battery */}
                                                {d.diff.battery.curr && (d.isFirst || d.diff.battery.changed) && (
                                                    <div className="flex items-start gap-2 flex-wrap">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide w-16 shrink-0 mt-0.5">Battery</span>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {!d.isFirst && d.diff.battery.prev && (
                                                                <><span className="text-xs text-slate-400 line-through">{batteryLabel(d.diff.battery.prev)}</span><span className="text-slate-300">→</span></>
                                                            )}
                                                            <span className="text-xs font-medium text-slate-900">{batteryLabel(d.diff.battery.curr)}</span>
                                                            {d.diff.battery.changed && <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Replaced</span>}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* System Serial */}
                                                {d.diff.systemSerial.curr && (d.isFirst || d.diff.systemSerial.changed) && (
                                                    <div className="flex items-start gap-2 flex-wrap">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide w-16 shrink-0 mt-0.5">S/N</span>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {!d.isFirst && d.diff.systemSerial.prev && (
                                                                <><span className="text-xs text-slate-400 line-through">{d.diff.systemSerial.prev}</span><span className="text-slate-300">→</span></>
                                                            )}
                                                            <span className="text-xs font-medium text-slate-900">{d.diff.systemSerial.curr}</span>
                                                            {d.diff.systemSerial.changed && <span className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">⚠ Board changed?</span>}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* No data fallback */}
                                                {!d.isFirst && !d.diff.hasAnyChange && (
                                                    <p className="text-xs text-slate-400 italic">All hardware unchanged.</p>
                                                )}
                                                {d.isFirst && driveChanges.length === 0 && ramChanges.length === 0 && !d.diff.cpu.curr && (
                                                    <p className="text-xs text-slate-400 italic">No hardware data available in this report.</p>
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
