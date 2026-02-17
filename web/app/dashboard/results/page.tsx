"use client"

import { useEffect, useState } from "react"
import { getQCResults } from "@/lib/api"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { Search, ChevronLeft, ChevronRight, Printer, User } from "lucide-react"
import { getGradeStyle } from "@/lib/grades"

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

    async function loadData() {
        setLoading(true)
        try {
            const filters = search ? { refurbishId: search } : {}
            const data = await getQCResults(page, limit, filters)
            setResults(data.results)
            setTotal(data.pagination.total)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [page]) // Reload when page changes

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        setPage(1)
        loadData()
    }

    const totalPages = Math.ceil(total / limit)

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
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
                        placeholder="Search Refurb ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-[300px]"
                    />
                    <Button type="submit" variant="secondary">
                        <Search className="h-4 w-4 mr-2" />
                        Search
                    </Button>
                </form>
            </div>

            <div className="rounded-md border bg-white">
                <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-muted/50 bg-slate-50">
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[100px]">Test ID</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[100px]">Grade</th>
                                {showTechnicianColumn && (
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Technician</th>
                                )}
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Model</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Serial</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Date</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                <tr><td colSpan={showTechnicianColumn ? 7 : 6} className="p-8 text-center">Loading...</td></tr>
                            ) : results.length === 0 ? (
                                <tr><td colSpan={showTechnicianColumn ? 7 : 6} className="p-8 text-center text-slate-500">No results found</td></tr>
                            ) : (
                                results.map((test) => (
                                    <tr key={test.id} className="border-b transition-colors hover:bg-slate-50">
                                        <td className="p-4 align-middle font-medium text-slate-500">#{test.id}</td>
                                        <td className="p-4 align-middle">
                                            {test.overall_grade ? (() => {
                                                const s = getGradeStyle(test.overall_grade);
                                                return (
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${s.bg} ${s.text}`}>
                                                        {test.overall_grade} — {test.overall_score}
                                                    </span>
                                                );
                                            })() : (
                                                test.overall_pass ? (
                                                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                                        PASS
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                                                        FAIL
                                                    </span>
                                                )
                                            )}
                                        </td>
                                        {showTechnicianColumn && (
                                            <td className="p-4 align-middle">
                                                {test.technician_name || test.technician_username ? (
                                                    <span className="inline-flex items-center gap-1 text-slate-600">
                                                        <User className="h-3 w-3" />
                                                        {test.technician_name || test.technician_username}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 text-xs">Unassigned</span>
                                                )}
                                            </td>
                                        )}
                                        <td className="p-4 align-middle dark:text-slate-400">{test.system_manufacturer} {test.system_model}</td>
                                        <td className="p-4 align-middle text-slate-500">{test.system_serial}</td>
                                        <td className="p-4 align-middle text-slate-500">
                                            {new Date(test.timestamp).toLocaleDateString()} {new Date(test.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="p-4 align-middle text-right space-x-2">
                                            <Link href={`/report/${test.id}`} target="_blank">
                                                <Button variant="outline" size="sm">
                                                    <Printer className="h-4 w-4 mr-2" />
                                                    Print
                                                </Button>
                                            </Link>
                                            <Link href={`/dashboard/results/${test.id}`}>
                                                <Button variant="outline" size="sm">View Report</Button>
                                            </Link>
                                        </td>
                                    </tr>
                                ))
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
                        >
                            <ChevronLeft className="h-4 w-4 mr-2" />
                            Previous
                        </Button>
                        <div className="text-sm font-medium">
                            Page {page} of {totalPages}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page + 1)}
                            disabled={page >= totalPages || loading}
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

