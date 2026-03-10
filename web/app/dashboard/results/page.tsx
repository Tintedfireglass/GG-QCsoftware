"use client"

import { useEffect, useState } from "react"
import { getQCResults } from "@/lib/api"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { Search, ChevronLeft, ChevronRight, Printer, User } from "lucide-react"
import { getGradeStyle } from "@/lib/grades"
import { formatDbDateTime } from "@/lib/utils"

export default function ResultsPage() {
    const { isSuperAdmin, isAdmin, isUser } = useAuth()
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [search, setSearch] = useState("")
    const limit = 20

    // Show technician column for admins/superadmins
    const showTechnicianColumn = isSuperAdmin() || isAdmin()

    async function loadData(pageToLoad = page, searchTerm = search) {
        setLoading(true)
        try {
            const filters = searchTerm ? { search: searchTerm } : {}
            const data = await getQCResults(pageToLoad, limit, filters)
            setResults(data.results)
            setTotal(data.pagination.total)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData(page, search)
    }, [page]) // Reload when page changes

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        const term = search.trim()
        setPage(1)
        loadData(1, term)
    }

    const totalPages = Math.ceil(total / limit)

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        {isUser() ? "My QC Results" : "QC Results"}
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        {isUser() && "Results from your quality checks"}
                        {isAdmin() && "Results from your team's quality checks"}
                        {isSuperAdmin() && "All quality check results across the system"}
                    </p>
                </div>
                <form onSubmit={handleSearch} className="flex gap-2">
                    <Input
                        placeholder="Search Test ID, Serial..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-[300px] border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                    />
                    <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white">
                        <Search className="h-4 w-4 mr-2" />
                        Search
                    </Button>
                </form>
            </div>

            <div className="bg-white rounded-xl">
                <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b border-slate-200">
                            <tr className="border-b transition-colors hover:bg-slate-50/50">
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 w-[100px]">Test ID</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 w-[120px]">Health ID</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 w-[100px]">Status</th>

                                {showTechnicianColumn && (
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Technician</th>
                                )}
                                <th className="h-12 px-4 align-middle font-medium text-slate-500">Model name</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500">Serial No.</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500">Date</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                <tr><td colSpan={showTechnicianColumn ? 7 : 6} className="p-8 text-center text-slate-500">Loading...</td></tr>
                            ) : results.length === 0 ? (
                                <tr><td colSpan={showTechnicianColumn ? 7 : 6} className="p-8 text-center text-slate-500">No results found</td></tr>
                            ) : (
                                results.map((test) => {
                                    const dateObj = new Date(test.timestamp);
                                    const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                    const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                                    return (
                                        <tr key={test.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50">
                                            <td className="p-4 align-middle font-medium text-slate-900">#{test.id}</td>
                                            <td className="p-4 align-middle font-mono text-xs text-slate-500">
                                                {test.health_id ? (
                                                    <span title={test.health_id}>{test.health_id.split('-')[0]}&hellip;</span>
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="p-4 align-middle">
                                                {test.pramaan_grade ? (() => {
                                                    const s = getGradeStyle(test.pramaan_grade);
                                                    return (
                                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${s.bg} ${s.text}`}>
                                                            {test.pramaan_grade} — {test.pramaan_score}
                                                        </span>
                                                    );
                                                })() : (
                                                    test.overall_pass ? (
                                                        <span className="font-medium text-emerald-600 flex items-center gap-1.5">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-600"></div> Pass
                                                        </span>
                                                    ) : (
                                                        <span className="font-medium text-rose-500 flex items-center gap-1.5">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-rose-500"></div> Fail
                                                        </span>
                                                    )
                                                )}
                                            </td>
                                            {showTechnicianColumn && (
                                                <td className="p-4 align-middle">
                                                    {test.technician_name || test.technician_username ? (
                                                        <span className="inline-flex items-center gap-2 text-slate-900 font-medium">
                                                            <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-500 font-bold">
                                                                {(test.technician_name || test.technician_username).charAt(0).toUpperCase()}
                                                            </div>
                                                            {test.technician_name || test.technician_username}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 text-xs">Unassigned</span>
                                                    )}
                                                </td>
                                            )}
                                            <td className="p-4 align-middle text-slate-900">{test.system_manufacturer} {test.system_model}</td>
                                            <td className="p-4 align-middle text-slate-500">{test.system_serial}</td>
                                            <td className="p-4 align-middle text-slate-500">
                                                <div>{dateStr}</div>
                                                <div className="text-xs text-slate-400 mt-0.5">{timeStr}</div>
                                            </td>
                                            <td className="p-4 align-middle text-right space-x-2">
                                                <Link href={`/dashboard/results/${test.id}`}>
                                                    <Button variant="outline" size="sm" className="rounded-full px-6 border-slate-200 text-slate-700 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm">
                                                        VIEW
                                                    </Button>
                                                </Link>
                                                <Link href={`/report/${test.id}`} target="_blank">
                                                    <Button variant="ghost" size="sm" className="rounded-full w-9 h-9 p-0 text-slate-400 hover:text-[var(--brand-purple)]">
                                                        <Printer className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                        Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} results
                    </p>
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page - 1)}
                            disabled={page <= 1 || loading}
                            className="border-slate-200 text-slate-700"
                        >
                            <ChevronLeft className="h-4 w-4 mr-2" />
                            Previous
                        </Button>
                        <div className="text-sm font-medium text-slate-700">
                            Page {page} of {totalPages}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page + 1)}
                            disabled={page >= totalPages || loading}
                            className="border-slate-200 text-slate-700"
                        >
                            Next
                            <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
