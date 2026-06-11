"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { getMobileReport } from "@/lib/api"
import { QRCodeSVG } from "qrcode.react"
import { formatDbDateTime } from "@/lib/utils"
import { gradeHeroColor, gradeLabel } from "@/lib/platforms/windows/grades"

type Report = Awaited<ReturnType<typeof getMobileReport>>["report"]

const TYPE_LABELS: Record<string, string> = {
    FULL_QC: "Full QC", BASIC_QC: "Basic QC", BATTERY: "Battery", DISPLAY: "Display",
    SENSORS: "Sensors", STRESS_TEST: "Stress Test", SINGLE: "Single Test",
}

// VIBRATION → Vibration · POWER_BUTTON → Power Button
function humanize(raw: string): string {
    return raw
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase())
}

interface TestEntry { name: string; passed: boolean }

// FULL_QC/BASIC_QC store testResults as { TEST_NAME: boolean }.
function extractTestResults(payload: Record<string, unknown>): TestEntry[] {
    const tr = payload.testResults
    if (!tr || typeof tr !== "object") return []
    return Object.entries(tr as Record<string, unknown>)
        .filter(([, v]) => typeof v === "boolean")
        .map(([name, v]) => ({ name: humanize(name), passed: v as boolean }))
}

// SENSORS reports carry a loose array; pull a name + pass/fail out of each row.
function extractSensorResults(payload: Record<string, unknown>): TestEntry[] {
    const arr = payload.sensors
    if (!Array.isArray(arr)) return []
    return arr.map((s, i) => {
        const o = (s ?? {}) as Record<string, unknown>
        const name = (o.name ?? o.type ?? o.sensor ?? `Sensor ${i + 1}`) as string
        const rawResult = o.result ?? o.passed ?? o.status
        const passed = typeof rawResult === "boolean"
            ? rawResult
            : String(rawResult ?? "").toUpperCase().startsWith("PASS")
        return { name: humanize(String(name)), passed }
    })
}

// Stress category sub-scores (mirrors the Windows PRAMAAN breakdown). The device
// sends these somewhere in the payload, but key names/nesting vary — so we scan the
// whole payload for numeric 0–100 fields and fuzzy-match each of the five concepts.
interface CategoryScore { label: string; score: number; isRisk: boolean }
const STRESS_CONCEPTS: { label: string; tokens: string[]; riskHints?: string[] }[] = [
    { label: "CPU Stability", tokens: ["cpu"] },
    { label: "Thermal Management", tokens: ["thermal"], riskHints: ["throttl", "overheat", "heat"] },
    { label: "Storage Performance", tokens: ["storage", "disk"] },
    { label: "RAM Health", tokens: ["ram", "memory"], riskHints: ["oom"] },
    { label: "Recovery Speed", tokens: ["recover"] },
]
const SCORE_QUALIFIERS = ["stability", "management", "performance", "health", "speed", "recovery", "score", "rating", "index"]
// NB: no "core" here — it is a substring of "score" and would wrongly drop every "…Score" key.
const SPEC_BLACKLIST = ["temp", "freq", "clock", "usage", "total", "used", "free", "gb", "mb", "byte", "size", "count", "cycle", "level", "wear", "voltage", "current", "capacity", "elapsed", "duration", "version", "api"]

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "")

function collectNumericFields(obj: unknown, depth: number, acc: { key: string; value: number }[]): void {
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || depth < 0) return
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) acc.push({ key: normKey(k), value: v })
        else if (v && typeof v === "object") collectNumericFields(v, depth - 1, acc)
    }
}

function collectTrueKeys(obj: unknown, depth: number, acc: string[]): void {
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || depth < 0) return
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (v === true) acc.push(normKey(k))
        else if (v && typeof v === "object") collectTrueKeys(v, depth - 1, acc)
    }
}

function extractStressCategories(payload: Record<string, unknown>): CategoryScore[] {
    const fields: { key: string; value: number }[] = []
    collectNumericFields(payload, 5, fields)
    const trueKeys: string[] = []
    collectTrueKeys(payload, 5, trueKeys)

    const used = new Set<number>()
    const out: CategoryScore[] = []
    for (const concept of STRESS_CONCEPTS) {
        const candidates = fields
            .map((f, i) => ({ f, i }))
            .filter(({ f, i }) => !used.has(i)
                && concept.tokens.some((t) => f.key.includes(t))
                && !SPEC_BLACKLIST.some((b) => f.key.includes(b)))
        const pick = candidates.find(({ f }) => SCORE_QUALIFIERS.some((q) => f.key.includes(q))) ?? candidates[0]
        if (!pick) continue
        used.add(pick.i)
        const flaggedByToken = trueKeys.some((rk) => concept.tokens.some((t) => rk.includes(t)) && SCORE_QUALIFIERS.some((q) => rk.includes(q)))
        const flaggedByHint = (concept.riskHints ?? []).some((h) => trueKeys.some((rk) => rk.includes(h)))
        const isRisk = flaggedByToken || flaggedByHint || pick.f.value < 40
        out.push({ label: concept.label, score: Math.round(pick.f.value), isRisk })
    }
    return out
}

export default function DedicatedMobileReportPage() {
    const params = useParams<{ reportId: string }>()
    const reportId = params?.reportId
    const [report, setReport] = useState<Report | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!reportId) return
        let cancelled = false
        async function load() {
            setLoading(true)
            try {
                const data = await getMobileReport(reportId as string)
                if (!cancelled) setReport(data.report)
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load report")
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [reportId])

    // Auto-print when data is loaded
    useEffect(() => {
        if (!loading && report) {
            setTimeout(() => {
                window.print()
            }, 800)
        }
    }, [loading, report])

    const payload = (report?.payload as Record<string, unknown>) || {}
    const snapshot = (report?.deviceSnapshot as Record<string, unknown> | null) || null

    const allTests = useMemo<TestEntry[]>(() => {
        const qc = extractTestResults(payload)
        if (qc.length) return qc.sort((a, b) => Number(a.passed) - Number(b.passed) || a.name.localeCompare(b.name))
        return extractSensorResults(payload).sort((a, b) => Number(a.passed) - Number(b.passed) || a.name.localeCompare(b.name))
    }, [payload])

    if (loading) return <div className="p-10 font-sans text-center">Loading Report...</div>
    if (error || !report) return <div className="p-10 font-sans text-center text-red-600">{error || "Report not found."}</div>

    const resultIsPass = (report.result || "").toUpperCase().startsWith("PASS")
    const stress = (payload.stress ?? payload.result) as Record<string, unknown> | undefined
    const stressScore = stress && typeof stress.score === "number" ? (stress.score as number) : null
    const stressGrade = stress && typeof stress.grade === "string" ? (stress.grade as string) : null
    const stressCategories = extractStressCategories(payload)

    return (
        <div className="font-sans text-black bg-white p-8 max-w-[210mm] mx-auto min-h-screen">
            {/* Header */}
            <header className="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-bold uppercase tracking-wide">QC Certificate</h1>
                    <p className="text-sm mt-1 text-gray-600">
                        {TYPE_LABELS[report.reportType] || report.reportType} Report
                        {report.testType ? ` — ${humanize(report.testType)}` : ""}
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-lg font-bold">Report ID: {report.reportId}</div>
                    <div className="text-sm text-gray-600">{report.testedAt ? formatDbDateTime(report.testedAt) : "—"}</div>
                </div>
            </header>

            {/* Overall Status */}
            <div className="mb-8 flex items-center justify-between bg-gray-50 p-6 border border-gray-200 rounded-sm">
                <div>
                    <div className="text-sm uppercase tracking-wider text-gray-500 font-semibold">PRAMAAN Health Score</div>
                    {report.grade ? (
                        <>
                            <div className={`text-5xl font-bold mt-2 ${gradeHeroColor(report.grade)}`}>{report.grade}</div>
                            <div className="text-sm text-gray-600 mt-1">
                                {gradeLabel(report.grade)}{report.score != null ? ` — ${report.score}/100` : ""}
                            </div>
                        </>
                    ) : report.result ? (
                        <div className={`text-5xl font-bold mt-2 ${resultIsPass ? "text-green-700" : "text-red-700"}`}>
                            {report.result.toUpperCase()}
                        </div>
                    ) : (
                        <div className="text-5xl font-bold mt-2 text-gray-400">N/A</div>
                    )}
                </div>
                <div className="text-right flex items-center gap-6">
                    <div>
                        <div className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-1">Device ID</div>
                        <div className="font-mono text-xl">{report.deviceId}</div>
                    </div>
                    <div className="bg-white p-2 rounded shadow-sm border border-gray-100 flex flex-col items-center">
                        <QRCodeSVG
                            value={`https://pramaan-dashboard.gadgetguruz.com/verify/${report.reportId}`}
                            size={80}
                        />
                    </div>
                </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6 mb-8">
                <div>
                    <h3 className="uppercase tracking-widest text-xs font-bold border-b border-gray-300 pb-2 mb-3">Device Specification</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600 w-1/3">Model</td>
                                <td className="py-2 font-medium">{report.deviceModel || "—"}</td>
                            </tr>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">Device ID</td>
                                <td className="py-2 font-mono">{report.deviceId}</td>
                            </tr>
                            {snapshot?.manufacturer != null && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Manufacturer</td>
                                    <td className="py-2 font-medium">{String(snapshot.manufacturer)}</td>
                                </tr>
                            )}
                            {snapshot?.processor != null && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Processor</td>
                                    <td className="py-2 font-medium">{String(snapshot.processor)}</td>
                                </tr>
                            )}
                            {snapshot?.ram != null && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">RAM</td>
                                    <td className="py-2 font-medium">{String(snapshot.ram)}</td>
                                </tr>
                            )}
                            {snapshot?.storage != null && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Storage</td>
                                    <td className="py-2 font-medium">{String(snapshot.storage)}</td>
                                </tr>
                            )}
                            {snapshot?.androidVersion != null && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Android Version</td>
                                    <td className="py-2 font-medium">{String(snapshot.androidVersion)}</td>
                                </tr>
                            )}
                            {snapshot?.serialNumber != null && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Serial Number</td>
                                    <td className="py-2 font-mono">{String(snapshot.serialNumber)}</td>
                                </tr>
                            )}
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">Tested</td>
                                <td className="py-2 font-medium">{report.testedAt ? formatDbDateTime(report.testedAt) : "—"}</td>
                            </tr>
                            {(report.passedCount != null || report.failedCount != null) && (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Passed / Failed</td>
                                    <td className="py-2 font-medium">{report.passedCount ?? 0} / {report.failedCount ?? 0}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div>
                    <h3 className="uppercase tracking-widest text-xs font-bold border-b border-gray-300 pb-2 mb-3">Customer & Reseller</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600 w-1/3">Customer Name</td>
                                <td className="py-2 font-medium">{report.customer.name || "—"}</td>
                            </tr>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">Phone</td>
                                <td className="py-2 font-medium">{report.customer.phone || "—"}</td>
                            </tr>
                            <tr className="border-b border-dotted border-gray-300">
                                <td className="py-2 text-gray-600">Email</td>
                                <td className="py-2 font-medium">{report.customer.email || "—"}</td>
                            </tr>
                            {report.reseller ? (
                                <>
                                    <tr className="border-b border-dotted border-gray-300">
                                        <td className="py-2 text-gray-600">Reseller</td>
                                        <td className="py-2 font-medium">{report.reseller.name || "—"}</td>
                                    </tr>
                                    <tr className="border-b border-dotted border-gray-300">
                                        <td className="py-2 text-gray-600">Role</td>
                                        <td className="py-2 font-medium">{report.reseller.role || "—"}</td>
                                    </tr>
                                    <tr className="border-b border-dotted border-gray-300">
                                        <td className="py-2 text-gray-600">License Key</td>
                                        <td className="py-2 font-mono">{report.reseller.licenseKey || "—"}</td>
                                    </tr>
                                </>
                            ) : (
                                <tr className="border-b border-dotted border-gray-300">
                                    <td className="py-2 text-gray-600">Reseller</td>
                                    <td className="py-2 text-gray-500 italic">No reseller license on this device</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Stress Performance */}
            {(stressScore != null || stressGrade) && (
                <div className="mb-8 flex items-center justify-between bg-gray-50 p-6 border border-gray-200 rounded-sm break-inside-avoid">
                    <div>
                        <div className="text-sm uppercase tracking-wider text-gray-500 font-semibold">Stress Performance</div>
                        <p className="text-xs text-gray-500 mt-1">
                            {payload.durationSeconds != null ? `Duration: ${String(payload.durationSeconds)}s` : "Sustained-load benchmark"}
                            {payload.abortedByHeat === true ? " · Aborted by heat" : ""}
                            {payload.oomOccurred === true ? " · Out of memory" : ""}
                        </p>
                    </div>
                    <div className="text-right">
                        {stressGrade ? (
                            <>
                                <div className={`text-4xl font-bold ${gradeHeroColor(stressGrade)}`}>{stressGrade}</div>
                                <div className="text-sm text-gray-600 mt-1">
                                    {gradeLabel(stressGrade)}{stressScore != null ? ` — ${stressScore}/100` : ""}
                                </div>
                            </>
                        ) : (
                            <div className="text-4xl font-bold text-gray-700">{stressScore}<span className="text-lg text-gray-400">/100</span></div>
                        )}
                    </div>
                </div>
            )}

            {/* Category Breakdown — bars mirror the Windows PRAMAAN sub-scores */}
            {stressCategories.length > 0 && (
                <div className="mb-8 break-inside-avoid">
                    <h3 className="uppercase tracking-widest text-xs font-bold border-b border-gray-300 pb-2 mb-4">Category Breakdown</h3>
                    <div className="grid gap-3">
                        {stressCategories.map((cat) => {
                            const barColor = cat.score >= 80 ? "bg-green-500" : cat.score >= 60 ? "bg-amber-500" : cat.score >= 40 ? "bg-orange-500" : "bg-red-500"
                            return (
                                <div key={cat.label} className="flex items-center gap-4">
                                    <div className="w-40 text-sm font-medium flex items-center gap-2">
                                        {cat.label}
                                        {cat.isRisk && (
                                            <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">RISK</span>
                                        )}
                                    </div>
                                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${cat.score}%` }} />
                                    </div>
                                    <div className="w-10 text-right text-sm font-mono font-semibold">{cat.score}</div>
                                </div>
                            )
                        })}
                    </div>
                    {stressCategories.some((c) => c.isRisk) && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm font-semibold text-red-700">
                                Risk flags raised in: {stressCategories.filter((c) => c.isRisk).map((c) => c.label).join(", ")}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Test Results Table */}
            {allTests.length > 0 && (
                <div className="mb-8 overflow-x-auto w-full">
                    <h3 className="uppercase tracking-widest text-xs font-bold border-b-2 border-black pb-2 mb-4">Diagnostic Results</h3>
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="bg-gray-100 border-b border-gray-300">
                                <th className="py-2 px-3 font-semibold">Test Component</th>
                                <th className="py-2 px-3 font-semibold w-[100px] text-center">Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allTests.map((test) => (
                                <tr key={test.name} className="border-b border-gray-200">
                                    <td className="py-3 px-3 font-medium">{test.name}</td>
                                    <td className="py-3 px-3 text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${test.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                                            {test.passed ? "PASS" : "FAIL"}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Performance Graph */}
            {report.stressSamples && report.stressSamples.length > 0 && (
                <div className="mb-8 overflow-x-auto w-full break-inside-avoid">
                    <h3 className="uppercase tracking-widest text-xs font-bold border-b-2 border-black pb-2 mb-4">Performance Graph ({report.stressSamples.length} samples)</h3>
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="bg-gray-100 border-b border-gray-300">
                                <th className="py-2 px-3 font-semibold">Elapsed (s)</th>
                                <th className="py-2 px-3 font-semibold">GIPS</th>
                                <th className="py-2 px-3 font-semibold">Phase</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.stressSamples.map((s, i) => (
                                <tr key={i} className="border-b border-gray-200">
                                    <td className="py-2 px-3">{s.elapsedSec}</td>
                                    <td className="py-2 px-3">{s.gips ?? "—"}</td>
                                    <td className="py-2 px-3 text-gray-600">{s.phase ?? "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Footer */}
            <footer className="mt-12 pt-6 border-t border-gray-300 text-center text-xs text-gray-500 flex justify-between">
                <div>Generated by pramaan</div>
                <div>Report ID: {report.reportId}</div>
                <div>Date Printed: {new Date().toLocaleDateString()}</div>
            </footer>

            <style jsx global>{`
                @page {
                    size: A4;
                    margin: 0;
                }
                @media print {
                    body {
                        background: white;
                    }
                    .no-print {
                        display: none;
                    }
                }
            `}</style>
        </div>
    )
}
