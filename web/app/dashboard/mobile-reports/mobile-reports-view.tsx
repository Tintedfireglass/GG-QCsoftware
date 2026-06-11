"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, ChevronLeft, ChevronRight, Smartphone, Eye, Printer } from "lucide-react"
import { getMobileReports, MobileReportRow } from "@/lib/api"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDbDateTime } from "@/lib/utils"
import { getGradeStyle } from "@/lib/platforms/windows/grades"

const TYPE_OPTIONS = ["", "FULL_QC", "BASIC_QC", "BATTERY", "DISPLAY", "SENSORS", "STRESS_TEST", "SINGLE"]
const TYPE_LABELS: Record<string, string> = {
    "": "All types",
    FULL_QC: "Full QC",
    BASIC_QC: "Basic QC",
    BATTERY: "Battery",
    DISPLAY: "Display",
    SENSORS: "Sensors",
    STRESS_TEST: "Stress Test",
    SINGLE: "Single Test",
}

function resultBadge(r: MobileReportRow) {
    const v = (r.result || "").toUpperCase()
    if (r.grade) {
        const style = getGradeStyle(r.grade)
        return <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-bold ${style.bg} ${style.text}`}>{r.grade}{r.score != null ? `-${r.score}` : ""}</span>
    }
    if (v === "PASSED" || v === "PASS") {
        return <span className="font-medium text-emerald-600 flex items-center gap-1.5 text-xs"><div className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Passed</span>
    }
    if (v === "FAILED" || v === "FAIL") {
        return <span className="font-medium text-rose-500 flex items-center gap-1.5 text-xs"><div className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Failed</span>
    }
    return <span className="text-slate-500 text-xs">{r.result || "—"}</span>
}

export function MobileReportsView({ embedded = false }: { embedded?: boolean }) {
    const { isSuperAdmin } = useAuth()
    const [reports, setReports] = useState<MobileReportRow[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState<number | null>(0)
    const [searchInput, setSearchInput] = useState("")
    const [appliedSearch, setAppliedSearch] = useState("")
    const [type, setType] = useState("")
    const limit = 20

    useEffect(() => {
        let cancelled = false
        async function load() {
            setLoading(true)
            try {
                const filters: Record<string, string> = {}
                if (appliedSearch) filters.search = appliedSearch
                if (type) filters.type = type
                const data = await getMobileReports(page, limit, filters)
                if (cancelled) return
                setReports(data.reports)
                setTotal(data.pagination.total)
            } catch (e) {
                console.error(e)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [page, appliedSearch, type])

    const totalPages = total != null ? Math.ceil(total / limit) : null

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        setPage(1)
        setAppliedSearch(searchInput.trim())
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                {!embedded && (
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                            <Smartphone className="h-7 w-7 text-[var(--brand-purple)]" /> Mobile Reports
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">
                            {isSuperAdmin()
                                ? "All B2C Android QC reports across the system"
                                : "Android QC reports from devices that activated your license keys"}
                        </p>
                    </div>
                )}
                <div className="flex w-full md:w-auto gap-2 flex-col sm:flex-row md:ml-auto">
                    <form onSubmit={handleSearch} className="flex w-full md:w-auto gap-2">
                        <Input
                            placeholder="Search device, customer, phone..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full sm:w-[280px] border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                        />
                        <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white shrink-0">
                            <Search className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Search</span>
                        </Button>
                    </form>
                    <select
                        value={type}
                        onChange={(e) => { setPage(1); setType(e.target.value) }}
                        className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                        aria-label="Filter by report type"
                    >
                        {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                </div>
            </div>

            <div className="bg-transparent md:bg-white md:rounded-xl">
                {/* Mobile cards */}
                <div className="md:hidden flex flex-col gap-4">
                    {loading ? (
                        <div className="p-8 text-center text-slate-500">Loading...</div>
                    ) : reports.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">No mobile reports found</div>
                    ) : reports.map((r) => (
                        <Link key={r.reportId} href={`/dashboard/mobile-reports/${encodeURIComponent(r.reportId)}`}
                            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-[var(--brand-purple)] bg-[var(--brand-purple)]/10 px-2 py-0.5 rounded">{TYPE_LABELS[r.reportType] || r.reportType}{r.testType ? ` · ${r.testType}` : ""}</span>
                                {resultBadge(r)}
                            </div>
                            <div className="font-bold text-slate-900 text-sm">{r.deviceModel || r.deviceId}</div>
                            <div className="text-xs text-slate-500 mt-1">{r.customer.name || "—"} · {r.customer.phone || r.customer.email || "—"}</div>
                            <div className="font-mono text-[11px] text-slate-400 mt-1 break-all">Test ID: {r.reportId}</div>
                            {r.reseller && <div className="text-xs text-slate-400 mt-1">Reseller: {r.reseller.name}</div>}
                            <div className="text-xs text-slate-400 mt-2">{r.testedAt ? formatDbDateTime(r.testedAt) : "—"}</div>
                        </Link>
                    ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block relative w-full overflow-x-auto">
                    <table className="w-full table-auto caption-bottom text-sm text-left min-w-[1000px]">
                        <thead className="[&_tr]:border-b border-slate-200">
                            <tr>
                                <th className="h-10 px-2 font-medium text-slate-500 w-[160px]">Test ID</th>
                                <th className="h-10 px-2 font-medium text-slate-500 w-[150px]">Type</th>
                                <th className="h-10 px-2 font-medium text-slate-500 w-[110px]">Result</th>
                                <th className="h-10 px-2 font-medium text-slate-500 max-w-[180px]">Device</th>
                                <th className="h-10 px-2 font-medium text-slate-500 max-w-[180px]">Customer</th>
                                <th className="h-10 px-2 font-medium text-slate-500 w-[150px]">Reseller</th>
                                <th className="h-10 px-2 font-medium text-slate-500 w-[140px]">Date</th>
                                <th className="h-10 px-2 font-medium text-slate-500 text-right w-[110px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-500">Loading...</td></tr>
                            ) : reports.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-500">No mobile reports found</td></tr>
                            ) : reports.map((r) => (
                                <tr key={r.reportId} className="border-b border-slate-100 hover:bg-slate-50/50">
                                    <td className="p-2 align-middle">
                                        <span className="font-mono text-[11px] text-slate-600 break-all" title={r.reportId}>{r.reportId}</span>
                                    </td>
                                    <td className="p-2 align-middle">
                                        <span className="font-medium text-slate-900">{TYPE_LABELS[r.reportType] || r.reportType}</span>
                                        {r.testType && <div className="text-xs text-slate-400">{r.testType}</div>}
                                    </td>
                                    <td className="p-2 align-middle">{resultBadge(r)}</td>
                                    <td className="p-2 align-middle text-slate-700 max-w-[180px]">
                                        <div className="truncate font-medium" title={r.deviceModel || ""}>{r.deviceModel || "—"}</div>
                                        <div className="font-mono text-[11px] text-slate-400 truncate" title={r.deviceId}>{r.deviceId}</div>
                                    </td>
                                    <td className="p-2 align-middle text-slate-700 max-w-[180px]">
                                        <div className="truncate">{r.customer.name || "—"}</div>
                                        <div className="text-xs text-slate-400 truncate">{r.customer.phone || r.customer.email || ""}</div>
                                    </td>
                                    <td className="p-2 align-middle text-slate-600">
                                        {r.reseller ? <span className="truncate" title={r.reseller.name || ""}>{r.reseller.name}</span> : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="p-2 align-middle text-slate-500 text-xs">{r.testedAt ? formatDbDateTime(r.testedAt) : "—"}</td>
                                    <td className="p-2 align-middle">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Link href={`/dashboard/mobile-reports/${encodeURIComponent(r.reportId)}`} title="View report">
                                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-slate-200 text-slate-700 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)]">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Link href={`/mobile-report/${encodeURIComponent(r.reportId)}`} target="_blank" title="Print report">
                                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-slate-200 text-slate-700 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)]">
                                                    <Printer className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {(totalPages == null || totalPages > 1) && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                        {total != null ? `${total} report${total === 1 ? "" : "s"}` : "Page " + page}
                    </p>
                    <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1 || loading} className="border-slate-200 text-slate-700">
                            <ChevronLeft className="h-4 w-4 mr-2" /> Previous
                        </Button>
                        <div className="text-sm font-medium text-slate-700">Page {page}{totalPages != null ? ` of ${totalPages}` : ""}</div>
                        <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={loading || (totalPages != null && page >= totalPages) || (totalPages == null && reports.length < limit)} className="border-slate-200 text-slate-700">
                            Next <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
