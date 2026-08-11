"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { getQCResult } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Printer, QrCode } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { getGradeStyle, gradeLabel, gradeHeroColor } from "@/lib/platforms/windows/grades"
import { formatAppVersion, formatBytes, formatDbDate, formatDbDateTime, formatWindowsVersion, deduplicateAntivirus } from "@/lib/utils"
import { isIssue } from "@/lib/platforms/windows/issues"
import { useBranding, verifyUrl } from "@/components/branding-provider"
import { useAuth } from "@/components/auth-provider"
import { QRCodeCanvas } from "qrcode.react"

// ── Shared hardware diff helpers (serial-number aware) ───────────────────────

function parseJson(val: any): any {
    if (!val) return null
    try { return typeof val === "string" ? JSON.parse(val) : val } catch { return null }
}

interface DriveSnap { serial: string; model: string; sizeGB: number; isSsd: boolean; mediaType: string }
function isUsbDrive(d: any): boolean {
    const busType = (d.busType || "").toLowerCase()
    const mediaType = (d.mediaType || "").toLowerCase()
    const model = (d.model || "").toLowerCase()
    return busType === "usb" || mediaType === "usb" || model.includes("usb") || d.isRemovable === true
}
function extractDrives(r: any): DriveSnap[] {
    const s = parseJson(r.storage_details_json)
    if (!s) return []
    return (Array.isArray(s.devices) ? s.devices : [])
        .filter((d: any) => (d.serialNumber || d.model) && !isUsbDrive(d))
        .map((d: any) => ({ serial: (d.serialNumber || "").trim(), model: (d.model || "Unknown").trim(), sizeGB: d.sizeGB ?? 0, isSsd: !!d.isSsd, mediaType: d.mediaType || "" }))
}
function driveLabel(d: DriveSnap): string {
    const size = d.sizeGB > 0 ? ` ${Math.round(d.sizeGB)} GB` : ""
    const type = d.isSsd ? " SSD" : d.mediaType ? ` ${d.mediaType}` : " HDD"
    const serial = d.serial ? ` [${d.serial}]` : ""
    return `${d.model}${size}${type}${serial}`
}
type DriveChange = { kind: "added"; drive: DriveSnap } | { kind: "removed"; drive: DriveSnap } | { kind: "same"; drive: DriveSnap }
function diffDrives(prev: DriveSnap[], curr: DriveSnap[]): DriveChange[] {
    const id = (d: DriveSnap) => d.serial || `${d.model}|${Math.round(d.sizeGB)}`
    const pm = new Map(prev.map(d => [id(d), d])), cm = new Map(curr.map(d => [id(d), d]))
    const out: DriveChange[] = []
    for (const [k, d] of cm) out.push(pm.has(k) ? { kind: "same", drive: d } : { kind: "added", drive: d })
    for (const [k, d] of pm) if (!cm.has(k)) out.push({ kind: "removed", drive: d })
    return out.sort((a, b) => ({ added: 0, removed: 1, same: 2 }[a.kind] - { added: 0, removed: 1, same: 2 }[b.kind]))
}

interface RamModuleSnap { slot: number; capacityGB: number; speedMHz: number; memoryType: string; partNumber: string }
function extractRamModules(r: any): { modules: RamModuleSnap[]; totalGB: number; usedSlots: number; totalSlots: number } {
    const rd = parseJson(r.ram_details_json)
    const totalGB = r.ram_total ? Math.round(r.ram_total / (1024 ** 3)) : (rd?.totalCapacityGB ?? 0)
    if (!rd) return { modules: [], totalGB, usedSlots: 0, totalSlots: 0 }
    const mods: RamModuleSnap[] = (Array.isArray(rd.modules) ? rd.modules : []).map((m: any, i: number) => ({
        slot: typeof m.slot === "number" ? m.slot : i,
        capacityGB: m.capacityGB ?? m.capacityGb ?? Math.round((m.capacityBytes ?? 0) / (1024 ** 3)),
        speedMHz: m.speedMHz ?? m.speed ?? 0, memoryType: m.memoryType ?? m.type ?? "", partNumber: (m.partNumber || "").trim(),
    }))
    return { modules: mods, totalGB, usedSlots: rd.usedSlots ?? mods.length, totalSlots: rd.totalSlots ?? 0 }
}
function slotLabel(m: RamModuleSnap): string {
    return `Slot ${m.slot}: ${m.capacityGB} GB${m.memoryType ? ` ${m.memoryType}` : ""}${m.speedMHz ? ` ${m.speedMHz}MHz` : ""}${m.partNumber ? ` (${m.partNumber})` : ""}`
}
type RamChange = { kind: "added"; module: RamModuleSnap } | { kind: "removed"; module: RamModuleSnap } | { kind: "changed"; prev: RamModuleSnap; curr: RamModuleSnap } | { kind: "same"; module: RamModuleSnap }
function diffRam(p: ReturnType<typeof extractRamModules>, c: ReturnType<typeof extractRamModules>): RamChange[] {
    const pm = new Map(p.modules.map(m => [m.slot, m])), cm = new Map(c.modules.map(m => [m.slot, m]))
    const out: RamChange[] = []
    for (const slot of new Set([...pm.keys(), ...cm.keys()])) {
        const pv = pm.get(slot), cv = cm.get(slot)
        if (pv && cv) out.push(pv.capacityGB !== cv.capacityGB || (pv.partNumber && cv.partNumber && pv.partNumber !== cv.partNumber) ? { kind: "changed", prev: pv, curr: cv } : { kind: "same", module: cv })
        else if (cv) out.push({ kind: "added", module: cv })
        else if (pv) out.push({ kind: "removed", module: pv })
    }
    return out.sort((a, b) => ({ added: 0, removed: 1, changed: 2, same: 3 }[a.kind] - { added: 0, removed: 1, changed: 2, same: 3 }[b.kind]))
}

interface BatterySnap { serial: string; brand: string; partNumber: string }
function extractBattery(r: any): BatterySnap | null {
    const b = parseJson(r.battery_details_json)
    if (!b || b.isTampered || !b.isPresent) return null
    return { serial: (b.serialNumber || "").trim(), brand: (b.manufactureName || b.name || "").trim(), partNumber: (b.partNumber || "").trim() }
}
function batteryLabel(b: BatterySnap): string {
    const parts = [b.brand, b.partNumber].filter(Boolean)
    return (parts.join(" ") || "Unknown battery") + (b.serial ? ` [S/N: ${b.serial}]` : "")
}

interface HwChangeSummary {
    cpu: { prev: string | null; curr: string | null; changed: boolean }
    drives: DriveChange[]
    ram: { changes: RamChange[]; countChanged: boolean; totalGBChanged: boolean; prevGB: number; currGB: number; prevCount: number; currCount: number }
    battery: { prev: BatterySnap | null; curr: BatterySnap | null; changed: boolean }
    systemSerial: { prev: string | null; curr: string | null; changed: boolean }
    hasAnyChange: boolean
}
function computeHwDiff(prev: any | null, curr: any): HwChangeSummary {
    const currDrives = extractDrives(curr), prevDrives = prev ? extractDrives(prev) : []
    const drives = prev ? diffDrives(prevDrives, currDrives) : currDrives.map(d => ({ kind: "same" as const, drive: d }))
    const currRam = extractRamModules(curr), prevRam = prev ? extractRamModules(prev) : { modules: [], totalGB: 0, usedSlots: 0, totalSlots: 0 }
    const ramChanges = prev ? diffRam(prevRam, currRam) : currRam.modules.map(m => ({ kind: "same" as const, module: m }))
    const currBat = extractBattery(curr), prevBat = prev ? extractBattery(prev) : null
    const batteryChanged = !!(prev && prevBat !== null && currBat !== null && ((prevBat.serial && currBat.serial && prevBat.serial !== currBat.serial) || (prevBat.partNumber && currBat.partNumber && prevBat.partNumber !== currBat.partNumber)))
    const currCpu = curr.cpu_model || null, prevCpu = prev?.cpu_model || null
    const currSerial = curr.system_serial || null, prevSerial = prev?.system_serial || null
    return {
        cpu: { prev: prevCpu, curr: currCpu, changed: !!prev && !!prevCpu && !!currCpu && prevCpu !== currCpu },
        drives, ram: { changes: ramChanges, countChanged: prev ? prevRam.usedSlots !== currRam.usedSlots : false, totalGBChanged: prev ? prevRam.totalGB !== currRam.totalGB : false, prevGB: prevRam.totalGB, currGB: currRam.totalGB, prevCount: prevRam.usedSlots, currCount: currRam.usedSlots },
        battery: { prev: prevBat, curr: currBat, changed: batteryChanged },
        systemSerial: { prev: prevSerial, curr: currSerial, changed: !!prev && !!prevSerial && !!currSerial && prevSerial !== currSerial },
        hasAnyChange: (!!prev && !!prevCpu && !!currCpu && prevCpu !== currCpu) || drives.some(d => d.kind !== "same") || ramChanges.some(r => r.kind !== "same") || batteryChanged || (!!prev && !!prevSerial && !!currSerial && prevSerial !== currSerial),
    }
}

// ─────────────────────────────────────────────────────────────────────────────


export default function ResultDetailPage() {
    const branding = useBranding()
    const { canShareQRLabel } = useAuth()
    const { id } = useParams()
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [selectedGrades, setSelectedGrades] = useState<string[]>([])
    const [isGradeFilterOpen, setIsGradeFilterOpen] = useState(false)
    const [testSort, setTestSort] = useState<"grade_desc" | "grade_asc" | "name_az">("grade_desc")
    const qrCanvasRef = useRef<HTMLCanvasElement>(null)

    // Handle auto-print removed (moved to dedicated page)

    useEffect(() => {
        async function load() {
            if (!id) return
            try {
                const result = await getQCResult(id as string)
                setData(result)
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [id])

    const safeData = data ?? {}
    const rawTestResults = Array.isArray((safeData as any)?.test_results)
        ? (safeData as any).test_results
        : []
    const hasStorageResult = rawTestResults.some((t: any) => String(t?.test_type || "").toLowerCase() === "storage")
    const test_results = rawTestResults.filter((t: any) => {
        const type = String(t?.test_type || "").toLowerCase()
        return !(hasStorageResult && type === "smart")
    })
    const batteryBrand = safeData?.battery_details_json
        ? (safeData.battery_details_json.manufactureName || safeData.battery_details_json.name || safeData.battery_details_json.partNumber)
        : null
    const hasCycleCount = safeData?.battery_details_json?.cycleCount != null && safeData.battery_details_json.cycleCount > 0
    const storageVolumes = Array.isArray(safeData?.storage_details_json?.volumes)
        ? safeData.storage_details_json.volumes
        : []
    const storageTotalBytes = storageVolumes.reduce(
        (sum: number, vol: any) => sum + (typeof vol?.totalBytes === "number" ? vol.totalBytes : 0),
        0
    )
    const storageTotalLabel =
        storageTotalBytes > 0
            ? formatBytes(storageTotalBytes)
            : (safeData?.storage_details_json?.totalCapacityGB
                ? `${safeData.storage_details_json.totalCapacityGB?.toFixed(0)} GB`
                : "Storage details not available")
    const activationStatus = safeData?.system_info_json?.windowsActivationStatus
    const isActivated = safeData?.system_info_json?.isWindowsActivated
    const activationText =
        typeof isActivated === "boolean"
            ? `${isActivated ? "Activated" : "Not Activated"}${activationStatus ? ` (${activationStatus})` : ""}`
            : (activationStatus || "Unknown")
    const rawAntivirusStatus = safeData?.system_info_json?.antivirusStatus
    const antivirusStatus = typeof rawAntivirusStatus === 'string' ? deduplicateAntivirus(rawAntivirusStatus) : rawAntivirusStatus;
    const isAntivirusHealthy = safeData?.system_info_json?.isAntivirusHealthy
    const antivirusText =
        typeof isAntivirusHealthy === "boolean"
            ? `${isAntivirusHealthy ? "Healthy" : "Not Healthy"}${antivirusStatus ? ` (${antivirusStatus})` : ""}`
            : (antivirusStatus || "Unknown")

    const gradeOptions = ["A+", "A", "B", "C", "Unknown"]
    const gradeOrder: Record<string, number> = {
        "A+": 0,
        "A": 1,
        "B": 2,
        "C": 3,
        "Unknown": 4
    }

    const getGradeKey = (grade?: string) => {
        if (!grade) return "Unknown"
        const g = grade.toUpperCase() === "REJECT" ? "Reject" : grade.toUpperCase()
        if (g === "A+") return "A+"
        if (g === "A") return "A"
        if (g === "B") return "B"
        if (g === "C") return "C"
        if (g === "D" || g === "E" || g === "F") return "Unknown"
        if (g === "REJECT") return "Unknown"
        return "Unknown"
    }

    const isGradeSelected = (gradeKey: string) =>
        selectedGrades.length === 0 || selectedGrades.includes(gradeKey)

    const toggleGrade = (grade: string) => {
        setSelectedGrades((prev) =>
            prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
        )
    }

    const totalTests = test_results.length
    const filteredTests = useMemo(() => {
        return test_results.filter((t: any) => isGradeSelected(getGradeKey(t?.grade)))
    }, [test_results, selectedGrades])

    const sortedTests = useMemo(() => {
        const list = [...filteredTests]
        if (testSort === "grade_desc") {
            return list.sort((a: any, b: any) => {
                const aRank = gradeOrder[getGradeKey(a?.grade)] ?? gradeOrder.Unknown
                const bRank = gradeOrder[getGradeKey(b?.grade)] ?? gradeOrder.Unknown
                if (aRank !== bRank) return aRank - bRank
                return String(a?.test_type || "").localeCompare(String(b?.test_type || ""))
            })
        }
        if (testSort === "grade_asc") {
            return list.sort((a: any, b: any) => {
                const aRank = gradeOrder[getGradeKey(a?.grade)] ?? gradeOrder.Unknown
                const bRank = gradeOrder[getGradeKey(b?.grade)] ?? gradeOrder.Unknown
                if (aRank !== bRank) return bRank - aRank
                return String(a?.test_type || "").localeCompare(String(b?.test_type || ""))
            })
        }
        return list.sort((a: any, b: any) => String(a?.test_type || "").localeCompare(String(b?.test_type || "")))
    }, [filteredTests, testSort])

    const healthGradeKey = getGradeKey(safeData?.health_grade)
    const showPramaanSection = safeData.health_score != null && isGradeSelected(healthGradeKey)

    if (loading) return <div className="p-8">Loading result details...</div>
    if (!data) return <div className="p-8">Result not found</div>

    // Download QR + Device ID as a printable PNG label
    function downloadQRLabel() {
        const srcCanvas = qrCanvasRef.current
        if (!srcCanvas) return

        const deviceId = data.machine_id || "N/A"
        const testId = `#${data.id}`

        // Label dimensions (in px at 96dpi — scales up for better print quality)
        const scale = 3
        const W = 220 * scale
        const H = 280 * scale
        const qrSize = 160 * scale

        const label = document.createElement("canvas")
        label.width = W
        label.height = H
        const ctx = label.getContext("2d")
        if (!ctx) return

        // White background
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, W, H)

        // Thin border
        ctx.strokeStyle = "#e2e8f0"
        ctx.lineWidth = 2 * scale
        ctx.strokeRect(scale, scale, W - 2 * scale, H - 2 * scale)

        // Site name header
        ctx.fillStyle = "#0f172a"
        ctx.font = `bold ${10 * scale}px system-ui, sans-serif`
        ctx.textAlign = "center"
        ctx.fillText(branding.siteName, W / 2, 22 * scale)

        // QR code centered
        const qrX = (W - qrSize) / 2
        const qrY = 30 * scale
        ctx.drawImage(srcCanvas, qrX, qrY, qrSize, qrSize)

        // Device ID label
        ctx.fillStyle = "#64748b"
        ctx.font = `${7 * scale}px system-ui, sans-serif`
        ctx.textAlign = "center"
        ctx.fillText("DEVICE ID", W / 2, (qrY + qrSize + 18 * scale))

        // Device ID value (monospace, prominent)
        ctx.fillStyle = "#0f172a"
        ctx.font = `bold ${12 * scale}px 'Courier New', monospace`
        ctx.textAlign = "center"
        ctx.fillText(deviceId, W / 2, (qrY + qrSize + 34 * scale))

        // Test ID sub-label
        ctx.fillStyle = "#94a3b8"
        ctx.font = `${6 * scale}px system-ui, sans-serif`
        ctx.textAlign = "center"
        ctx.fillText(`Test ${testId}`, W / 2, (qrY + qrSize + 50 * scale))

        const url = label.toDataURL("image/png")
        const a = document.createElement("a")
        a.href = url
        a.download = `qr-label-device-${deviceId}-test-${data.id}.png`
        a.click()
    }

    // Helper to get grade badge
    const GradeBadge = ({ grade, score }: { grade?: string; score?: number }) => {
        if (!grade) return <span className="text-xs text-gray-400">Unknown</span>;
        const s = getGradeStyle(grade);
        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${s.bg} ${s.text}`}>
                {grade} - {score ?? 0}
            </span>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            {/* Header Navigation */}
            <div className="flex items-center justify-between no-print">
                <Link href="/dashboard/reports">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Reports
                    </Button>
                </Link>
                <div className="space-x-2">
                    {canShareQRLabel() && data.health_id && (
                        <>
                            {/* Hidden canvas used as QR source for label download */}
                            <div className="absolute -left-[9999px] -top-[9999px] pointer-events-none" aria-hidden>
                                <QRCodeCanvas
                                    ref={qrCanvasRef}
                                    value={verifyUrl(branding.appUrl, data.health_id)}
                                    size={480}
                                    level="H"
                                    marginSize={2}
                                />
                            </div>
                            <Button variant="outline" size="sm" onClick={downloadQRLabel}>
                                <QrCode className="h-4 w-4 mr-2" />
                                Download QR Label
                            </Button>
                        </>
                    )}
                    <Link href={`/report/${id}`} target="_blank">
                        <Button variant="outline" size="sm">
                            <Printer className="h-4 w-4 mr-2" />
                            Print
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Report Header */}
            <Card className="border-t-4 border-t-blue-600">
                <CardContent className="p-8">
                    <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4 md:gap-0">
                        <div>
                            <h1 className="text-3xl font-bold mb-2">QC Report: #{data.id}</h1>
                            <p className="text-slate-500">
                                Date: {formatDbDateTime(data.timestamp)}
                            </p>
                            <p className="text-slate-500">
                                Device ID: {data.machine_id}
                            </p>
                            <p className="text-slate-500">
                                App Version: {formatAppVersion(data.app_version)}
                            </p>
                            {data.health_id && (
                                <p className="text-slate-500 flex items-center gap-2 mt-1">
                                    Health ID: <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">{data.health_id}</span>
                                    <Link href={`/verify/${data.health_id}`} target="_blank" className="text-[var(--brand-purple)] hover:underline text-xs font-semibold">
                                        Verify
                                    </Link>
                                </p>
                            )}
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-medium mb-1">{branding.siteName} Score</div>
                            {data.health_grade ? (
                                <>
                                    <div className={`text-5xl font-bold ${gradeHeroColor(data.health_grade)}`}>{data.health_grade}</div>
                                    <div className="text-sm text-slate-500 mt-1">{gradeLabel(data.health_grade)} - {data.health_score}/100</div>
                                </>
                            ) : (
                                data.overall_pass ? (
                                    <div className="text-4xl font-bold text-green-600">PASS</div>
                                ) : (
                                    <div className="text-4xl font-bold text-red-600">FAIL</div>
                                )
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6 pt-6 border-t">
                        <div>
                            <h3 className="font-semibold text-lg mb-4">System Information</h3>
                            <dl className="space-y-2 text-sm">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Manufacturer</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{data.system_manufacturer}</dd>
                                </div>
                                {data.computer_name && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Computer Name</dt>
                                        <dd className="sm:col-span-2 font-mono text-slate-900 break-words">{data.computer_name}</dd>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Model</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{data.system_model}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Serial Number</dt>
                                    <dd className="sm:col-span-2 font-mono text-slate-900 break-all">{data.system_serial}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">MAC Address</dt>
                                    <dd className="sm:col-span-2 font-mono text-slate-900 break-all">{data.mac_address}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">OS Version</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{formatWindowsVersion(data.system_info_json?.osVersion, data.system_info_json?.windowsProductName)}</dd>
                                </div>
                                {data.system_info_json?.windowsLastUpdatedAt && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">OS Last Updated</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">{formatDbDate(data.system_info_json.windowsLastUpdatedAt)}</dd>
                                    </div>
                                )}
                                {(data.system_info_json?.windowsActivationStatus != null || data.system_info_json?.isWindowsActivated != null) && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">OS Activation</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">{activationText}</dd>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Antivirus Status</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{antivirusText}</dd>
                                </div>
                                {data.system_info_json?.biosVersion && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">BIOS Version</dt>
                                        <dd className="sm:col-span-2 font-mono text-slate-900 break-all">
                                            {data.system_info_json.biosVersion}
                                            {data.system_info_json.biosManufacturer ? ` (${data.system_info_json.biosManufacturer})` : ""}
                                        </dd>
                                    </div>
                                )}
                                {data.system_info_json?.biosReleaseDate && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">BIOS Date</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">{formatDbDate(data.system_info_json.biosReleaseDate)}</dd>
                                    </div>
                                )}
                                {data.physical_condition && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Physical Condition</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">{data.physical_condition as string}</dd>
                                    </div>
                                )}
                                {data.scratches_and_dents && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Scratches &amp; Dents</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">{data.scratches_and_dents as string}</dd>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">IP Address</dt>
                                    <dd className="sm:col-span-2 font-mono text-slate-900 break-all">{data.submission_ip || "N/A"}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">Technician</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">
                                        {data.technician_label || "Not provided"}
                                    </dd>
                                </div>
                            </dl>
                        </div>

                        <div>
                            <h3 className="font-semibold text-lg mb-4">Hardware Specs</h3>
                            <dl className="space-y-2 text-sm">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">CPU</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">{data.cpu_model}</dd>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                    <dt className="font-medium text-slate-500">RAM</dt>
                                    <dd className="sm:col-span-2 text-slate-900 break-words">
                                        {data.ram_total ? Math.round(data.ram_total / (1024 * 1024 * 1024)) : 0} GB
                                    </dd>
                                </div>
                                {/* Parse storage if available */}
                                {data.storage_details_json && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Storage</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">
                                            {storageTotalLabel}
                                        </dd>
                                    </div>
                                )}
                                {/* Parse battery if available */}
                                {data.battery_details_json && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Battery</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">
                                            {data.battery_details_json.isTampered
                                                ? 'Battery Tampered - Unable to read data'
                                                : `${data.battery_details_json.wearLevelPercent}%`}
                                        </dd>
                                    </div>
                                )}
                                {data.battery_details_json && !data.battery_details_json.isTampered && batteryBrand && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Battery Brand</dt>
                                        <dd className="sm:col-span-2 text-slate-900 break-words">{batteryBrand}</dd>
                                    </div>
                                )}
                                {data.battery_details_json && !data.battery_details_json.isTampered && !hasCycleCount && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
                                        <dt className="font-medium text-slate-500">Cycle Count</dt>
                                        <dd className="sm:col-span-2 text-slate-500 italic break-words">Not reported by firmware</dd>
                                    </div>
                                )}
                            </dl>
                        </div>
                    </div>

                    {data.technician_notes && (
                        <div className="mt-6 pt-6 border-t">
                            <h3 className="font-semibold text-sm mb-2 text-slate-500">Technician Notes</h3>
                            <p className="bg-slate-50 p-3 rounded text-sm italic">{data.technician_notes}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Health scoring section */}
            {showPramaanSection && (
                <Card className="border-t-4 border-t-emerald-600">
                    <CardContent className="p-8">
                        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4 md:gap-0">
                            <div>
                                <h2 className="text-2xl font-bold mb-1">{branding.siteName} Health Score</h2>
                                <p className="text-sm text-slate-500">
                                    {data.scoring_algorithm_version || 'Scoring Engine v1.0.3'}
                                </p>
                            </div>
                            <div className="text-right">
                                <div className={`text-5xl font-bold ${gradeHeroColor(data.health_grade)}`}>{data.health_grade}</div>
                                <div className="text-sm text-slate-500 mt-1">{gradeLabel(data.health_grade)} - {data.health_score}/100</div>
                            </div>
                        </div>

                        {/* Category Sub-Scores */}
                        {data.category_scores && (
                            <div className="mt-6 pt-6 border-t">
                                <h3 className="font-semibold text-lg mb-4">Category Breakdown</h3>
                                <div className="grid gap-3">
                                    {Object.entries(data.category_scores as Record<string, number>).map(([key, score]) => {
                                        const labels: Record<string, string> = {
                                            storage: 'Storage Health',
                                            thermal: 'Thermal Performance',
                                            battery: 'Battery Health',
                                            cpu_ram: 'CPU & RAM',
                                            physical_ports: 'Physical Ports',
                                            repair_modifier: 'Repair History',
                                        };
                                        const isRisk = data.risk_flags?.[key] === true;
                                        const barColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : score >= 40 ? 'bg-orange-500' : 'bg-red-500';
                                        return (
                                            <div key={key} className="flex items-center gap-4">
                                                <div className="w-40 text-sm font-medium flex items-center gap-2">
                                                    {labels[key] || key}
                                                    {isRisk && (
                                                        <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                                            RISK
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
                                                </div>
                                                <div className="w-10 text-right text-sm font-mono font-semibold">{score}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Risk Summary */}
                        {data.risk_flags && Object.values(data.risk_flags as Record<string, boolean>).some(v => v) && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm font-semibold text-red-700">
                                    Risk flags raised in: {Object.entries(data.risk_flags as Record<string, boolean>)
                                        .filter(([, v]) => v)
                                        .map(([k]) => {
                                            const labels: Record<string, string> = {
                                                storage: 'Storage',
                                                thermal: 'Thermal',
                                                battery: 'Battery',
                                                cpu_ram: 'CPU/RAM',
                                                physical_ports: 'Ports',
                                                repair_modifier: 'Repair',
                                            };
                                            return labels[k] || k;
                                        })
                                        .join(', ')}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}


            {/* Hardware Changes vs previous QC report */}
            {(() => {
                const prev = safeData.previous_result
                if (!prev) return null // first-ever report for this machine

                const diff = computeHwDiff(prev, safeData)
                if (!diff.hasAnyChange && diff.drives.every(d => d.kind === "same") && diff.ram.changes.every(r => r.kind === "same")) return null

                const changedDrives = diff.drives.filter(d => d.kind !== "same")
                const changedRam = diff.ram.changes.filter(r => r.kind !== "same")
                const totalChanges = changedDrives.length + changedRam.length +
                    (diff.cpu.changed ? 1 : 0) + (diff.battery.changed ? 1 : 0) + (diff.systemSerial.changed ? 1 : 0)

                const hasChanges = totalChanges > 0

                return (
                    <Card className={`border-t-4 ${hasChanges ? "border-t-amber-500" : "border-t-emerald-500"}`}>
                        <CardContent className="p-8">
                            <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
                                <div>
                                    <h2 className="text-2xl font-bold mb-1">Hardware Changes</h2>
                                    <p className="text-sm text-slate-500">
                                        Compared to previous report on{" "}
                                        <span className="font-medium text-slate-700">{formatDbDateTime(prev.timestamp)}</span>
                                        {" "}(#{prev.report_id})
                                    </p>
                                </div>
                                {hasChanges ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
                                        ⚠ {totalChanges} change{totalChanges === 1 ? "" : "s"} detected
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                                        ✓ No hardware changes
                                    </span>
                                )}
                            </div>

                            <div className="grid gap-3 mt-4">
                                {/* CPU */}
                                {diff.cpu.changed && (
                                    <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide w-16 shrink-0 mt-0.5">CPU</span>
                                        <div className="flex items-center gap-2 flex-wrap text-sm">
                                            <span className="text-slate-400 line-through">{diff.cpu.prev}</span>
                                            <span className="text-slate-400">→</span>
                                            <span className="font-semibold text-slate-900">{diff.cpu.curr}</span>
                                            <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">Changed</span>
                                        </div>
                                    </div>
                                )}

                                {/* Drives — per-drive by serial */}
                                {changedDrives.length > 0 && (
                                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 grid gap-2">
                                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Storage Changes</span>
                                        {changedDrives.map((dc, i) => (
                                            <div key={i} className="flex items-center gap-2 flex-wrap pl-1">
                                                {dc.kind === "added" && <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Added</span>}
                                                {dc.kind === "removed" && <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Removed</span>}
                                                <span className={`text-sm ${dc.kind === "removed" ? "line-through text-slate-400" : "font-medium text-slate-900"}`}>
                                                    {driveLabel(dc.drive)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* RAM — per-slot */}
                                {changedRam.length > 0 && (
                                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 grid gap-2">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">RAM Changes</span>
                                            {(diff.ram.totalGBChanged || diff.ram.countChanged) && (
                                                <span className="text-xs text-slate-500">
                                                    {diff.ram.totalGBChanged && `${diff.ram.prevGB} GB → ${diff.ram.currGB} GB`}
                                                    {diff.ram.countChanged && ` · ${diff.ram.prevCount} → ${diff.ram.currCount} sticks`}
                                                </span>
                                            )}
                                        </div>
                                        {changedRam.map((rc, i) => (
                                            <div key={i} className="flex items-center gap-2 flex-wrap pl-1">
                                                {rc.kind === "added" && <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Added</span>}
                                                {rc.kind === "removed" && <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Removed</span>}
                                                {rc.kind === "changed" && <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">Changed</span>}
                                                {rc.kind === "changed" ? (
                                                    <><span className="text-sm text-slate-400 line-through">{slotLabel(rc.prev)}</span><span className="text-slate-400">→</span><span className="text-sm font-medium text-slate-900">{slotLabel(rc.curr)}</span></>
                                                ) : rc.kind === "removed" ? (
                                                    <span className="text-sm line-through text-slate-400">{slotLabel(rc.module)}</span>
                                                ) : (
                                                    <span className="text-sm font-medium text-slate-900">{slotLabel(rc.module)}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Battery */}
                                {diff.battery.changed && (
                                    <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide w-16 shrink-0 mt-0.5">Battery</span>
                                        <div className="flex items-center gap-2 flex-wrap text-sm">
                                            {diff.battery.prev && <span className="text-slate-400 line-through">{batteryLabel(diff.battery.prev)}</span>}
                                            <span className="text-slate-400">→</span>
                                            {diff.battery.curr && <span className="font-semibold text-slate-900">{batteryLabel(diff.battery.curr)}</span>}
                                            <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">Replaced</span>
                                        </div>
                                    </div>
                                )}

                                {/* System Serial change — possible board swap */}
                                {diff.systemSerial.changed && (
                                    <div className="flex items-start gap-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3">
                                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide w-16 shrink-0 mt-0.5">S/N</span>
                                        <div className="flex items-center gap-2 flex-wrap text-sm">
                                            <span className="text-slate-400 line-through">{diff.systemSerial.prev}</span>
                                            <span className="text-slate-400">→</span>
                                            <span className="font-semibold text-slate-900">{diff.systemSerial.curr}</span>
                                            <span className="inline-flex items-center rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">⚠ Board changed?</span>
                                        </div>
                                    </div>
                                )}

                                {/* Unchanged drives */}
                                {diff.drives.filter(d => d.kind === "same").length > 0 && (
                                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 grid gap-2">
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Unchanged Drives</span>
                                        {diff.drives.filter(d => d.kind === "same").map((dc, i) => (
                                            <div key={i} className="flex items-center gap-2 pl-1">
                                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Unchanged</span>
                                                <span className="text-sm text-slate-600">{driveLabel(dc.drive)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!hasChanges && (
                                    <p className="text-sm text-slate-500 italic">All hardware components match the previous report.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )
            })()}





            {/* Issues Summary Banner */}
            {(() => {
                const batteryPresent = safeData?.battery_details_json?.isPresent !== false
                const issueTests = test_results.filter((t: any) => isIssue(t, batteryPresent))
                if (issueTests.length === 0) return null
                return (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                                ⚠ {issueTests.length} {issueTests.length === 1 ? 'Issue' : 'Issues'} Detected
                            </span>
                            <span className="text-xs text-slate-500">Core components (CPU/GPU/Memory/Storage/Battery) scoring below 70</span>
                        </div>
                        <ul className="grid gap-1">
                            {issueTests.map((t: any) => (
                                <li key={t.id} className="flex items-center gap-2 text-sm text-red-800">
                                    <span className="font-semibold">{t.test_type}</span>
                                    <span className="text-red-400">—</span>
                                    <span className="font-mono font-bold">{t.score}/100</span>
                                    {t.message && (
                                        <span className="text-red-600 text-xs truncate max-w-[400px]">{t.message}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )
            })()}

            {/* Test Results List */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
                <div>
                    <h2 className="text-2xl font-bold">Test Details</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Showing {sortedTests.length} of {totalTests} tests
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setIsGradeFilterOpen((v) => !v)}
                        >
                            Filter: {selectedGrades.length === 0 ? "All grades" : `${selectedGrades.length} selected`}
                        </Button>
                        {isGradeFilterOpen && (
                            <div className="absolute right-0 mt-2 w-56 rounded-md border border-slate-200 bg-white shadow-lg z-10">
                                <div className="px-3 py-2 text-xs text-slate-500">Grades</div>
                                <div className="px-3 text-[11px] text-slate-400">No selection = all grades</div>
                                <div className="max-h-56 overflow-auto pb-1">
                                    {gradeOptions.map((grade) => (
                                        <label key={grade} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4"
                                                checked={selectedGrades.includes(grade)}
                                                onChange={() => toggleGrade(grade)}
                                            />
                                            <span>{grade}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="border-t border-slate-100 px-3 py-2">
                                    <button
                                        type="button"
                                        className="text-xs text-slate-600 hover:text-slate-900"
                                        onClick={() => setSelectedGrades([])}
                                    >
                                        Clear filters
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <select
                        value={testSort}
                        onChange={(e) => setTestSort(e.target.value as typeof testSort)}
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                        aria-label="Sort tests"
                    >
                        <option value="grade_desc">Sort: Grade high to low</option>
                        <option value="grade_asc">Sort: Grade low to high</option>
                        <option value="name_az">Sort: Name A-Z</option>
                    </select>
                </div>
            </div>

            <div className="grid gap-4">
                {sortedTests.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                        No tests for selected grades.
                    </div>
                ) : (
                    sortedTests.map((test: any) => {
                        const s = getGradeStyle(test.grade);
                        const borderClass = s.border;
                        const batteryPresent = safeData?.battery_details_json?.isPresent !== false
                        const isTestIssue = isIssue(test, batteryPresent);
                        return (
                            <Card key={test.id} className={`border-l-4 ${borderClass}`}>
                                <CardHeader className="py-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-base font-semibold">{test.test_type}</CardTitle>
                                            {isTestIssue && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 whitespace-nowrap">
                                                    ⚠ Issue
                                                </span>
                                            )}
                                        </div>
                                        <GradeBadge grade={test.grade} score={test.score} />
                                    </div>
                                </CardHeader>
                                <CardContent className="pb-4 pt-0">
                                    <p className="text-sm mb-2">{test.message}</p>

                                    {/* Render JSON details if available */}
                                    {test.details_json && Array.isArray(test.details_json) && test.details_json.length > 0 && (
                                        <ul className="list-disc pl-5 space-y-1 mt-2 bg-slate-50 p-2 rounded">
                                            {test.details_json.map((detail: string, i: number) => (
                                                <li key={i} className="text-xs text-slate-600">{detail}</li>
                                            ))}
                                        </ul>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    )
}
