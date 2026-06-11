"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { getMobileReport } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDbDateTime } from "@/lib/utils"
import { gradeLabel, gradeHeroColor } from "@/lib/platforms/windows/grades"

type Report = Awaited<ReturnType<typeof getMobileReport>>["report"]

const TYPE_LABELS: Record<string, string> = {
    FULL_QC: "Full QC", BASIC_QC: "Basic QC", BATTERY: "Battery", DISPLAY: "Display",
    SENSORS: "Sensors", STRESS_TEST: "Stress Test", SINGLE: "Single Test",
}

// Payload keys we surface in dedicated sections — kept out of the generic dump.
const STRUCTURED_KEYS = new Set([
    "deviceId", "testedAt", "testResults", "sensors", "stress", "result",
    "perfGraph", "deviceSnapshot", "phases", "passedCount", "failedCount",
    "totalTests", "overallResult", "grade", "score",
])

// VIBRATION → Vibration · POWER_BUTTON → Power Button
function humanize(raw: string): string {
    return raw
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase())
}

function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-0">
            <dt className="font-medium text-slate-500">{label}</dt>
            <dd className={`sm:col-span-2 text-slate-900 ${mono ? "font-mono break-all" : "break-words"}`}>
                {value ?? <span className="text-slate-400">—</span>}
            </dd>
        </div>
    )
}

function renderValue(v: unknown): React.ReactNode {
    if (v == null) return <span className="text-slate-300">—</span>
    if (typeof v === "object") return <pre className="text-xs bg-slate-50 rounded p-2 overflow-x-auto">{JSON.stringify(v, null, 2)}</pre>
    if (typeof v === "boolean") return v ? "Yes" : "No"
    return String(v)
}

// Pass/Fail pill, mirrors the Windows GradeBadge.
function ResultBadge({ passed }: { passed: boolean }) {
    return passed ? (
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-green-100 text-green-800">PASS</span>
    ) : (
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-red-100 text-red-800">FAIL</span>
    )
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
// Words that mark a field as a *score* rather than a raw spec (size/temp/freq…).
const SCORE_QUALIFIERS = ["stability", "management", "performance", "health", "speed", "recovery", "score", "rating", "index"]
// Substrings that disqualify a token match (raw hardware specs, not scores).
// NB: no "core" here — it is a substring of "score" and would wrongly drop every "…Score" key.
const SPEC_BLACKLIST = ["temp", "freq", "clock", "usage", "total", "used", "free", "gb", "mb", "byte", "size", "count", "cycle", "level", "wear", "voltage", "current", "capacity", "elapsed", "duration", "version", "api"]

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "")

// Depth-limited walk collecting every finite 0–100 numeric field, by normalized key.
function collectNumericFields(obj: unknown, depth: number, acc: { key: string; value: number }[]): void {
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || depth < 0) return
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) acc.push({ key: normKey(k), value: v })
        else if (v && typeof v === "object") collectNumericFields(v, depth - 1, acc)
    }
}

// Depth-limited walk collecting normalized keys whose value is boolean `true` (risk flags).
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
        // Candidate fields whose key contains a concept token and isn't a raw spec.
        const candidates = fields
            .map((f, i) => ({ f, i }))
            .filter(({ f, i }) => !used.has(i)
                && concept.tokens.some((t) => f.key.includes(t))
                && !SPEC_BLACKLIST.some((b) => f.key.includes(b)))
        // Prefer ones that look like a score (have a qualifier word).
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

export default function MobileReportDetailPage() {
    const params = useParams<{ reportId: string }>()
    const reportId = params?.reportId
    const [report, setReport] = useState<Report | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [testFilter, setTestFilter] = useState<"all" | "passed" | "failed">("all")

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

    const payload = (report?.payload as Record<string, unknown>) || {}
    const snapshot = (report?.deviceSnapshot as Record<string, unknown> | null) || null

    // Tests for the "Test Details" section: FULL_QC test map, else sensor rows.
    const allTests = useMemo<TestEntry[]>(() => {
        const qc = extractTestResults(payload)
        if (qc.length) return qc.sort((a, b) => Number(a.passed) - Number(b.passed) || a.name.localeCompare(b.name))
        return extractSensorResults(payload).sort((a, b) => Number(a.passed) - Number(b.passed) || a.name.localeCompare(b.name))
    }, [payload])

    const filteredTests = useMemo(() => {
        if (testFilter === "passed") return allTests.filter((t) => t.passed)
        if (testFilter === "failed") return allTests.filter((t) => !t.passed)
        return allTests
    }, [allTests, testFilter])

    if (loading) return <div className="p-8">Loading report details...</div>
    if (error || !report) return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            <Link href="/dashboard/reports">
                <Button variant="ghost" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Reports
                </Button>
            </Link>
            <div className="p-8 text-center text-rose-500">{error || "Report not found"}</div>
        </div>
    )

    const failedTests = allTests.filter((t) => !t.passed)
    const payloadEntries = Object.entries(payload).filter(([k]) => !STRUCTURED_KEYS.has(k))
    const resultIsPass = (report.result || "").toUpperCase().startsWith("PASS")
    const stress = (payload.stress ?? payload.result) as Record<string, unknown> | undefined
    const stressScore = stress && typeof stress.score === "number" ? (stress.score as number) : null
    const stressGrade = stress && typeof stress.grade === "string" ? (stress.grade as string) : null
    const stressCategories = extractStressCategories(payload)

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
                    <Link href={`/mobile-report/${report.reportId}`} target="_blank">
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
                            <h1 className="text-3xl font-bold mb-2">
                                {TYPE_LABELS[report.reportType] || report.reportType} Report
                                {report.testType ? `: ${humanize(report.testType)}` : ""}
                            </h1>
                            <p className="text-slate-500">
                                Date: {report.testedAt ? formatDbDateTime(report.testedAt) : "—"}
                            </p>
                            <p className="text-slate-500">
                                Device ID: {report.deviceId}
                            </p>
                            <p className="text-slate-500 flex items-center gap-2 mt-1">
                                Report ID: <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">{report.reportId}</span>
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-medium mb-1">PRAMAAN Score</div>
                            {report.grade ? (
                                <>
                                    <div className={`text-5xl font-bold ${gradeHeroColor(report.grade)}`}>{report.grade}</div>
                                    <div className="text-sm text-slate-500 mt-1">
                                        {gradeLabel(report.grade)}{report.score != null ? ` - ${report.score}/100` : ""}
                                    </div>
                                </>
                            ) : report.result ? (
                                <div className={`text-4xl font-bold ${resultIsPass ? "text-green-600" : "text-red-600"}`}>
                                    {report.result.toUpperCase()}
                                </div>
                            ) : (
                                <div className="text-4xl font-bold text-gray-400">N/A</div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6 pt-6 border-t">
                        <div>
                            <h3 className="font-semibold text-lg mb-4">Device Information</h3>
                            <dl className="space-y-2 text-sm">
                                <DetailRow label="Model" value={report.deviceModel} />
                                <DetailRow label="Device ID" value={report.deviceId} mono />
                                {snapshot?.manufacturer != null && <DetailRow label="Manufacturer" value={String(snapshot.manufacturer)} />}
                                {snapshot?.processor != null && <DetailRow label="Processor" value={String(snapshot.processor)} />}
                                {snapshot?.ram != null && <DetailRow label="RAM" value={String(snapshot.ram)} />}
                                {snapshot?.storage != null && <DetailRow label="Storage" value={String(snapshot.storage)} />}
                                {snapshot?.androidVersion != null && <DetailRow label="Android Version" value={String(snapshot.androidVersion)} />}
                                {snapshot?.serialNumber != null && <DetailRow label="Serial Number" value={String(snapshot.serialNumber)} mono />}
                                <DetailRow label="Tested" value={report.testedAt ? formatDbDateTime(report.testedAt) : null} />
                                <DetailRow label="Submitted" value={report.createdAt ? formatDbDateTime(report.createdAt) : null} />
                                {(report.passedCount != null || report.failedCount != null) && (
                                    <DetailRow
                                        label="Passed / Failed"
                                        value={
                                            <>
                                                <span className="font-semibold text-green-700">{report.passedCount ?? 0}</span>
                                                {" / "}
                                                <span className={`font-semibold ${(report.failedCount ?? 0) > 0 ? "text-red-600" : "text-slate-900"}`}>{report.failedCount ?? 0}</span>
                                            </>
                                        }
                                    />
                                )}
                            </dl>
                        </div>

                        <div>
                            <h3 className="font-semibold text-lg mb-4">Customer & Reseller</h3>
                            <dl className="space-y-2 text-sm">
                                <DetailRow label="Customer Name" value={report.customer.name} />
                                <DetailRow label="Phone" value={report.customer.phone} />
                                <DetailRow label="Email" value={report.customer.email} />
                                <DetailRow label="Customer ID" value={report.customer.id} mono />
                                {report.reseller ? (
                                    <>
                                        <DetailRow label="Reseller" value={report.reseller.name} />
                                        <DetailRow label="Role" value={report.reseller.role} />
                                        <DetailRow label="License Key" value={report.reseller.licenseKey} mono />
                                    </>
                                ) : (
                                    <DetailRow label="Reseller" value={<span className="text-slate-500 italic">No reseller license on this device</span>} />
                                )}
                            </dl>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stress Summary (Full Health / Stress Test) */}
            {(stressScore != null || stressGrade) && (
                <Card className="border-t-4 border-t-emerald-600">
                    <CardContent className="p-8">
                        <div className="flex flex-col md:flex-row justify-between items-start gap-4 md:gap-0">
                            <div>
                                <h2 className="text-2xl font-bold mb-1">Stress Performance</h2>
                                <p className="text-sm text-slate-500">
                                    {payload.durationSeconds != null ? `Duration: ${String(payload.durationSeconds)}s` : "Sustained-load benchmark"}
                                    {payload.abortedByHeat === true ? " · Aborted by heat" : ""}
                                    {payload.oomOccurred === true ? " · Out of memory" : ""}
                                </p>
                            </div>
                            <div className="text-right">
                                {stressGrade ? (
                                    <>
                                        <div className={`text-5xl font-bold ${gradeHeroColor(stressGrade)}`}>{stressGrade}</div>
                                        <div className="text-sm text-slate-500 mt-1">
                                            {gradeLabel(stressGrade)}{stressScore != null ? ` - ${stressScore}/100` : ""}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-5xl font-bold text-slate-700">{stressScore}<span className="text-xl text-slate-400">/100</span></div>
                                )}
                            </div>
                        </div>

                        {/* Category Breakdown — bars mirror the Windows PRAMAAN sub-scores */}
                        {stressCategories.length > 0 && (
                            <div className="mt-6 pt-6 border-t">
                                <h3 className="font-semibold text-lg mb-4">Category Breakdown</h3>
                                <div className="grid gap-3">
                                    {stressCategories.map((cat) => {
                                        const barColor = cat.score >= 80 ? "bg-green-500" : cat.score >= 60 ? "bg-amber-500" : cat.score >= 40 ? "bg-orange-500" : "bg-red-500"
                                        return (
                                            <div key={cat.label} className="flex items-center gap-4">
                                                <div className="w-40 text-sm font-medium flex items-center gap-2">
                                                    {cat.label}
                                                    {cat.isRisk && (
                                                        <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                                            RISK
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${cat.score}%` }} />
                                                </div>
                                                <div className="w-10 text-right text-sm font-mono font-semibold">{cat.score}</div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Risk Summary */}
                                {stressCategories.some((c) => c.isRisk) && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <p className="text-sm font-semibold text-red-700">
                                            Risk flags raised in: {stressCategories.filter((c) => c.isRisk).map((c) => c.label).join(", ")}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Issues Summary Banner — failed tests */}
            {failedTests.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                            ⚠ {failedTests.length} {failedTests.length === 1 ? "Issue" : "Issues"} Detected
                        </span>
                        <span className="text-xs text-slate-500">Tests that did not pass</span>
                    </div>
                    <ul className="grid gap-1 sm:grid-cols-2">
                        {failedTests.map((t) => (
                            <li key={t.name} className="flex items-center gap-2 text-sm text-red-800">
                                <span className="font-semibold">{t.name}</span>
                                <span className="text-red-400">—</span>
                                <span className="font-mono font-bold">FAIL</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Test Details */}
            {allTests.length > 0 && (
                <>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
                        <div>
                            <h2 className="text-2xl font-bold">Test Details</h2>
                            <p className="text-xs text-slate-500 mt-1">
                                Showing {filteredTests.length} of {allTests.length} tests
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {(["all", "passed", "failed"] as const).map((f) => (
                                <Button
                                    key={f}
                                    size="sm"
                                    variant={testFilter === f ? "default" : "outline"}
                                    className="h-8 capitalize"
                                    onClick={() => setTestFilter(f)}
                                >
                                    {f}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4">
                        {filteredTests.length === 0 ? (
                            <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                                No tests for this filter.
                            </div>
                        ) : (
                            filteredTests.map((test) => (
                                <Card key={test.name} className={`border-l-4 ${test.passed ? "border-l-green-500" : "border-l-red-500"}`}>
                                    <CardHeader className="py-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <CardTitle className="text-base font-semibold">{test.name}</CardTitle>
                                                {!test.passed && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 whitespace-nowrap">
                                                        ⚠ Issue
                                                    </span>
                                                )}
                                            </div>
                                            <ResultBadge passed={test.passed} />
                                        </div>
                                    </CardHeader>
                                </Card>
                            ))
                        )}
                    </div>
                </>
            )}

            {/* Performance Graph */}
            {report.stressSamples && report.stressSamples.length > 0 && (
                <Card className="border-t-4 border-t-amber-500">
                    <CardContent className="p-8">
                        <h2 className="text-2xl font-bold mb-1">Performance Graph</h2>
                        <p className="text-sm text-slate-500 mb-4">{report.stressSamples.length} samples</p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-slate-500 border-b border-slate-200">
                                    <tr><th className="py-1 px-2">Elapsed (s)</th><th className="py-1 px-2">GIPS</th><th className="py-1 px-2">Phase</th></tr>
                                </thead>
                                <tbody>
                                    {report.stressSamples.map((s, i) => (
                                        <tr key={i} className="border-b border-slate-50">
                                            <td className="py-1 px-2 text-slate-700">{s.elapsedSec}</td>
                                            <td className="py-1 px-2 text-slate-700">{s.gips ?? "—"}</td>
                                            <td className="py-1 px-2 text-slate-500">{s.phase ?? "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Additional Report Data — leftover scalar fields */}
            {payloadEntries.length > 0 && (
                <Card className="border-t-4 border-t-slate-300">
                    <CardContent className="p-8">
                        <h2 className="text-2xl font-bold mb-6">Additional Data</h2>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                            {payloadEntries.map(([k, v]) => (
                                <div key={k} className="flex flex-col gap-1 min-w-0">
                                    <dt className="text-xs uppercase tracking-wide text-slate-400">{humanize(k)}</dt>
                                    <dd className="text-sm text-slate-900 break-words">{renderValue(v)}</dd>
                                </div>
                            ))}
                        </dl>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
