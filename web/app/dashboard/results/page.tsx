"use client"

import { useEffect, useState } from "react"
import { getQCResults } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { Search, ChevronLeft, ChevronRight } from "lucide-react"

export default function ResultsPage() {
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [search, setSearch] = useState("")
    const limit = 20

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
                <h1 className="text-3xl font-bold tracking-tight">QC Results</h1>
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
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-[100px]">Status</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Refurb ID</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Machine</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Model</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Date</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center">Loading...</td></tr>
                            ) : results.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-500">No results found</td></tr>
                            ) : (
                                results.map((test) => (
                                    <tr key={test.id} className="border-b transition-colors hover:bg-slate-50">
                                        <td className="p-4 align-middle">
                                            {test.overall_pass ? (
                                                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                                    PASS
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                                                    FAIL
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle font-medium">{test.refurbish_id}</td>
                                        <td className="p-4 align-middle text-slate-500">{test.machine_identifier}</td>
                                        <td className="p-4 align-middle dark:text-slate-400">{test.system_manufacturer} {test.system_model}</td>
                                        <td className="p-4 align-middle text-slate-500">
                                            {new Date(test.timestamp).toLocaleDateString()} {new Date(test.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="p-4 align-middle text-right">
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
                <div className="flex items-center justify-end space-x-2">
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
            )}
        </div>
    )
}
