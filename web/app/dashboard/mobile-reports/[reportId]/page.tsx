"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Smartphone, User, Store } from "lucide-react"
import { getMobileReport } from "@/lib/api"
import { formatDbDateTime } from "@/lib/utils"

type Report = Awaited<ReturnType<typeof getMobileReport>>["report"]

const TYPE_LABELS: Record<string, string> = {
    FULL_QC: "Full QC", BATTERY: "Battery", DISPLAY: "Display",
    SENSORS: "Sensors", STRESS_TEST: "Stress Test", SINGLE: "Single Test",
}

function InfoCard({ icon: Icon, title, rows }: { icon: React.ComponentType<{ className?: string }>; title: string; rows: Array<[string, React.ReactNode]> }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-3 text-slate-900 font-semibold">
                <Icon className="h-4 w-4 text-[var(--brand-purple)]" /> {title}
            </div>
            <dl className="space-y-2">
                {rows.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 text-sm">
                        <dt className="text-slate-500">{k}</dt>
                        <dd className="text-slate-900 font-medium text-right break-words">{v ?? "—"}</dd>
                    </div>
                ))}
            </dl>
        </div>
    )
}

function renderValue(v: unknown): React.ReactNode {
    if (v == null) return <span className="text-slate-300">—</span>
    if (typeof v === "object") return <pre className="text-xs bg-slate-50 rounded p-2 overflow-x-auto">{JSON.stringify(v, null, 2)}</pre>
    if (typeof v === "boolean") return v ? "Yes" : "No"
    return String(v)
}

export default function MobileReportDetailPage() {
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

    if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>
    if (error || !report) return (
        <div className="space-y-4">
            <Link href="/dashboard/mobile-reports" className="text-sm text-[var(--brand-purple)] flex items-center gap-1"><ChevronLeft className="h-4 w-4" /> Back</Link>
            <div className="p-8 text-center text-rose-500">{error || "Report not found"}</div>
        </div>
    )

    const payload = (report.payload as Record<string, unknown>) || {}
    const payloadEntries = Object.entries(payload).filter(([k]) => k !== "deviceSnapshot" && k !== "perfGraph")

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <Link href="/dashboard/mobile-reports" className="text-sm text-[var(--brand-purple)] flex items-center gap-1 mb-2"><ChevronLeft className="h-4 w-4" /> Back to Mobile Reports</Link>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Smartphone className="h-6 w-6 text-[var(--brand-purple)]" />
                        {TYPE_LABELS[report.reportType] || report.reportType}{report.testType ? ` · ${report.testType}` : ""}
                    </h1>
                    <p className="text-xs font-mono text-slate-400 mt-1">{report.reportId}</p>
                </div>
                {(report.grade || report.result) && (
                    <div className="text-right">
                        {report.grade
                            ? <span className="inline-flex items-center rounded-lg px-4 py-2 text-lg font-bold bg-[var(--brand-purple)]/10 text-[var(--brand-purple)]">{report.grade}{report.score != null ? `-${report.score}` : ""}</span>
                            : <span className={`text-lg font-bold ${(report.result || "").toUpperCase().startsWith("PASS") ? "text-emerald-600" : "text-rose-500"}`}>{report.result}</span>}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InfoCard icon={Smartphone} title="Device" rows={[
                    ["Model", report.deviceModel],
                    ["Device ID", <span key="did" className="font-mono text-xs">{report.deviceId}</span>],
                    ["Tested", report.testedAt ? formatDbDateTime(report.testedAt) : null],
                    ["Submitted", report.createdAt ? formatDbDateTime(report.createdAt) : null],
                    ...(report.passedCount != null || report.failedCount != null ? [["Passed / Failed", `${report.passedCount ?? 0} / ${report.failedCount ?? 0}`] as [string, React.ReactNode]] : []),
                ]} />
                <InfoCard icon={User} title="Customer" rows={[
                    ["Name", report.customer.name],
                    ["Phone", report.customer.phone],
                    ["Email", report.customer.email],
                    ["Customer ID", report.customer.id],
                ]} />
                <InfoCard icon={Store} title="Reseller (via license)" rows={report.reseller ? [
                    ["Name", report.reseller.name],
                    ["Role", report.reseller.role],
                    ["License Key", <span key="lk" className="font-mono text-xs">{report.reseller.licenseKey}</span>],
                ] : [["Attribution", <span key="na" className="text-slate-400">No reseller license on this device</span>]]} />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="font-semibold text-slate-900 mb-3">Report Data</div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                    {payloadEntries.map(([k, v]) => (
                        <div key={k} className="flex flex-col gap-1 min-w-0">
                            <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                            <dd className="text-sm text-slate-900 break-words">{renderValue(v)}</dd>
                        </div>
                    ))}
                </dl>
            </div>

            {report.stressSamples && report.stressSamples.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="font-semibold text-slate-900 mb-3">Performance Graph ({report.stressSamples.length} samples)</div>
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
                </div>
            )}
        </div>
    )
}
