"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { getQCResults, getUsers } from "@/lib/api"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { Search, ChevronLeft, ChevronRight, Printer, Download } from "lucide-react"
import { getGradeStyle, gradeHeroColor } from "@/lib/grades"
import { formatAppVersion, formatDbDateTime } from "@/lib/utils"

export default function ResultsPage() {
    const { isSuperAdmin, isAdmin, isUser, canManageUsers } = useAuth()
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [searchInput, setSearchInput] = useState("")
    const [appliedSearch, setAppliedSearch] = useState("")
    const [selectedUserId, setSelectedUserId] = useState("")
    const [users, setUsers] = useState<Array<{ id: number; username: string; display_name?: string }>>([])
    const [isClientFilterOpen, setIsClientFilterOpen] = useState(false)
    const [clientFilterSearch, setClientFilterSearch] = useState("")
    const clientFilterRef = useRef<HTMLDivElement | null>(null)
    const [selectedGrades, setSelectedGrades] = useState<string[]>([])
    const [isGradeFilterOpen, setIsGradeFilterOpen] = useState(false)
    const [resultSort, setResultSort] = useState<"grade_desc" | "grade_asc" | "date_desc" | "date_asc" | "id_asc">("date_desc")
    const gradeFilterRef = useRef<HTMLDivElement | null>(null)
    const [exportingExcel, setExportingExcel] = useState(false)
    const [exportingPdf, setExportingPdf] = useState(false)
    const limit = 20

    // Show user/technician column for all roles
    const showTechnicianColumn = true

    async function loadData(pageToLoad = page, searchTerm = appliedSearch, userId = selectedUserId) {
        setLoading(true)
        try {
            const filters: Record<string, string> = {}
            if (searchTerm) filters.search = searchTerm
            if (userId) filters.userId = userId
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
        loadData(page, appliedSearch, selectedUserId)
    }, [page, appliedSearch, selectedUserId]) // Reload when page/search/user changes

    useEffect(() => {
        let cancelled = false
        async function loadUsers() {
            if (!canManageUsers()) return
            try {
                const data = await getUsers(1, 500, {})
                if (!cancelled) setUsers(data.users || [])
            } catch (e) {
                console.error("Failed to load users for filter:", e)
            }
        }
        loadUsers()
        return () => {
            cancelled = true
        }
    }, [canManageUsers])

    useEffect(() => {
        function onDocumentMouseDown(e: MouseEvent) {
            const target = e.target as Node | null
            if (isGradeFilterOpen && gradeFilterRef.current && target && !gradeFilterRef.current.contains(target)) {
                setIsGradeFilterOpen(false)
            }
            if (isClientFilterOpen && clientFilterRef.current && target && !clientFilterRef.current.contains(target)) {
                setIsClientFilterOpen(false)
            }
        }

        function onDocumentKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setIsGradeFilterOpen(false)
                setIsClientFilterOpen(false)
            }
        }

        document.addEventListener("mousedown", onDocumentMouseDown)
        document.addEventListener("keydown", onDocumentKeyDown)
        return () => {
            document.removeEventListener("mousedown", onDocumentMouseDown)
            document.removeEventListener("keydown", onDocumentKeyDown)
        }
    }, [isGradeFilterOpen, isClientFilterOpen])

    const getClientLabel = (u: { id: number; username: string; display_name?: string }) =>
        u.display_name || u.username || `Client #${u.id}`

    const sortedClients = useMemo(() => {
        const list = [...users]
        return list.sort((a, b) => getClientLabel(a).localeCompare(getClientLabel(b), undefined, { sensitivity: "base" }))
    }, [users])

    const filteredClients = useMemo(() => {
        const term = clientFilterSearch.trim().toLowerCase()
        if (!term) return sortedClients
        return sortedClients.filter((u) => getClientLabel(u).toLowerCase().includes(term))
    }, [sortedClients, clientFilterSearch])

    const selectedClientLabel = useMemo(() => {
        if (!selectedUserId) return "Client: All"
        const id = parseInt(selectedUserId, 10)
        const found = users.find((u) => u.id === id)
        return found ? `Client: ${getClientLabel(found)}` : "Client: Selected"
    }, [selectedUserId, users])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        const term = searchInput.trim()
        setPage(1)
        setAppliedSearch(term)
    }

    const handleExport = async (format: "xlsx" | "pdf") => {
        if (format === "xlsx") setExportingExcel(true)
        else setExportingPdf(true)
        try {
            const token = localStorage.getItem("qc_token")
            const params = new URLSearchParams()
            if (appliedSearch) params.append("search", appliedSearch)
            if (selectedUserId) params.append("userId", selectedUserId)
            params.append("format", format)
            params.append("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone)
            const res = await fetch(`/api/qc-results/export?${params.toString()}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            if (!res.ok) throw new Error("Export failed")
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `qc_results_export_${new Date().toISOString().slice(0, 10)}.${format}`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error("Export error:", error)
        } finally {
            if (format === "xlsx") setExportingExcel(false)
            else setExportingPdf(false)
        }
    }

    const totalPages = Math.ceil(total / limit)

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
        const g = grade.trim().toUpperCase()
        if (g.startsWith("A+")) return "A+"
        if (g.startsWith("A")) return "A"
        if (g.startsWith("B")) return "B"
        if (g.startsWith("C")) return "C"
        return "Unknown"
    }

    const isGradeSelected = (gradeKey: string) =>
        selectedGrades.length === 0 || selectedGrades.includes(gradeKey)

    const toggleGrade = (grade: string) => {
        setSelectedGrades((prev) =>
            prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
        )
    }

    const filteredResults = useMemo(() => {
        return results.filter((r) => isGradeSelected(getGradeKey(r?.pramaan_grade)))
    }, [results, selectedGrades])

    const sortedResults = useMemo(() => {
        const list = [...filteredResults]
        if (resultSort === "grade_desc") {
            return list.sort((a: any, b: any) => {
                const aRank = gradeOrder[getGradeKey(a?.pramaan_grade)] ?? gradeOrder.Unknown
                const bRank = gradeOrder[getGradeKey(b?.pramaan_grade)] ?? gradeOrder.Unknown
                if (aRank !== bRank) return aRank - bRank
                return (b?.timestamp ? new Date(b.timestamp).getTime() : 0) - (a?.timestamp ? new Date(a.timestamp).getTime() : 0)
            })
        }
        if (resultSort === "grade_asc") {
            return list.sort((a: any, b: any) => {
                const aRank = gradeOrder[getGradeKey(a?.pramaan_grade)] ?? gradeOrder.Unknown
                const bRank = gradeOrder[getGradeKey(b?.pramaan_grade)] ?? gradeOrder.Unknown
                if (aRank !== bRank) return bRank - aRank
                return (b?.timestamp ? new Date(b.timestamp).getTime() : 0) - (a?.timestamp ? new Date(a.timestamp).getTime() : 0)
            })
        }
        if (resultSort === "date_asc") {
            return list.sort((a: any, b: any) => (a?.timestamp ? new Date(a.timestamp).getTime() : 0) - (b?.timestamp ? new Date(b.timestamp).getTime() : 0))
        }
        if (resultSort === "id_asc") {
            return list.sort((a: any, b: any) => String(a?.id ?? "").localeCompare(String(b?.id ?? "")))
        }
        return list.sort((a: any, b: any) => (b?.timestamp ? new Date(b.timestamp).getTime() : 0) - (a?.timestamp ? new Date(a.timestamp).getTime() : 0))
    }, [filteredResults, resultSort])

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        {isUser() ? "My QC Results" : "QC Results"}
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        {isUser() && "Results from your quality checks"}
                        {isAdmin() && "Results from your team's quality checks"}
                        {isSuperAdmin() && "All quality check results across the system"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        Showing {sortedResults.length} of {results.length} results
                    </p>
                </div>
                    <div className="flex w-full md:w-auto gap-2 flex-col sm:flex-row">
                    <form onSubmit={handleSearch} className="flex w-full md:w-auto gap-2 flex-col sm:flex-row">
                        <Input
                            placeholder="Search Device ID, Computer..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full sm:w-[300px] border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                        />
                        <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white sm:shrink-0 w-full sm:w-auto">
                            <Search className="h-4 w-4 sm:mr-2" />
                            <span className="inline">Search</span>
                        </Button>
                    </form>
                    <div className="flex items-center gap-2">
                        <div className="relative" ref={gradeFilterRef}>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-10"
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
                        {canManageUsers() && (
                            <div className="relative" ref={clientFilterRef}>
                                <button
                                    type="button"
                                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 flex items-center justify-between gap-3 min-w-[190px]"
                                    aria-label="Filter by client"
                                    onClick={() => {
                                        setIsClientFilterOpen((v) => !v)
                                        setClientFilterSearch("")
                                    }}
                                >
                                    <span className="truncate">{selectedClientLabel}</span>
                                    <span className="text-slate-400">▾</span>
                                </button>

                                {isClientFilterOpen && (
                                    <div className="absolute z-50 mt-1 w-[320px] max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white shadow-lg p-2">
                                        <Input
                                            value={clientFilterSearch}
                                            onChange={(e) => setClientFilterSearch(e.target.value)}
                                            placeholder="Search client..."
                                            className="h-9 border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                                        />
                                        <div className="mt-2 max-h-64 overflow-auto">
                                            <button
                                                type="button"
                                                className={`w-full text-left px-2 py-2 rounded text-sm hover:bg-slate-50 ${selectedUserId === "" ? "bg-slate-50 font-semibold" : ""}`}
                                                onClick={() => {
                                                    setPage(1)
                                                    setSelectedUserId("")
                                                    setIsClientFilterOpen(false)
                                                }}
                                            >
                                                Client: All
                                            </button>

                                            {filteredClients.length === 0 ? (
                                                <div className="px-2 py-2 text-sm text-slate-400">No matches</div>
                                            ) : (
                                                filteredClients.map((u) => {
                                                    const value = String(u.id)
                                                    const label = getClientLabel(u)
                                                    const isSelected = selectedUserId === value
                                                    return (
                                                        <button
                                                            key={u.id}
                                                            type="button"
                                                            className={`w-full text-left px-2 py-2 rounded text-sm hover:bg-slate-50 ${isSelected ? "bg-slate-50 font-semibold" : ""}`}
                                                            onClick={() => {
                                                                setPage(1)
                                                                setSelectedUserId(value)
                                                                setIsClientFilterOpen(false)
                                                            }}
                                                        >
                                                            {label}
                                                        </button>
                                                    )
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <select
                            value={resultSort}
                            onChange={(e) => setResultSort(e.target.value as typeof resultSort)}
                            className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                            aria-label="Sort results"
                        >
                            <option value="grade_desc">Sort: Grade high to low</option>
                            <option value="grade_asc">Sort: Grade low to high</option>
                            <option value="date_desc">Sort: Date newest</option>
                            <option value="date_asc">Sort: Date oldest</option>
                            <option value="id_asc">Sort: Test ID</option>
                        </select>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-10"
                            onClick={() => handleExport("xlsx")}
                            disabled={exportingExcel}
                        >
                            <Download className="h-4 w-4 mr-1" />
                            {exportingExcel ? "Exporting XLSX..." : "Export XLSX"}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-10"
                            onClick={() => handleExport("pdf")}
                            disabled={exportingPdf}
                        >
                            <Download className="h-4 w-4 mr-1" />
                            {exportingPdf ? "Exporting PDF..." : "Export PDF"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="bg-transparent md:bg-white md:rounded-xl">
                {/* Mobile Card View */}
                <div className="md:hidden flex flex-col gap-4">
                    {loading ? (
                        <div className="p-8 text-center text-slate-500">Loading...</div>
                    ) : sortedResults.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">No results found</div>
                    ) : (
                        sortedResults.map((test) => {
                            const dateObj = new Date(test.timestamp);
                            const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                            return (
                                <div key={test.id} className="bg-white border text-left border-slate-200 rounded-xl p-4 flex flex-col shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <span className="font-bold text-[var(--brand-purple)] bg-[var(--brand-purple)]/10 px-2 py-0.5 rounded-md">#{test.id}</span>
                                            <span>{timeStr}</span>
                                            {test.machine_id && (
                                                <span className="font-mono text-[10px] bg-slate-100 rounded px-1">{test.machine_id}</span>
                                            )}
                                        </div>
                                        <div>
                                            {test.pramaan_grade ? (() => {
                                                const s = getGradeStyle(test.pramaan_grade);
                                                return (
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${s.bg} ${s.text}`}>
                                                            {test.pramaan_grade}-{test.pramaan_score}
                                                        </span>
                                                    </div>
                                                );
                                            })() : (
                                                test.overall_pass ? (
                                                    <span className="font-medium text-emerald-600 flex items-center gap-1.5 text-xs whitespace-nowrap">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-600"></div> Pass
                                                    </span>
                                                ) : (
                                                    <span className="font-medium text-rose-500 flex items-center gap-1.5 text-xs whitespace-nowrap">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-rose-500"></div> Fail
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="mb-4">
                                        <div className="font-bold text-slate-900 text-base leading-tight mb-1">{test.system_manufacturer} {test.system_model}</div>
                                        <div className="text-xs text-slate-500">
                                            <span className="font-semibold text-slate-700">Serial No:</span> {test.system_serial}
                                        </div>
                                        {showTechnicianColumn && (
                                            <div className="text-xs text-slate-500 mt-1">
                                                <span className="font-semibold text-slate-700">Client:</span> {test.technician_name || test.technician_username || "Unassigned"}
                                            </div>
                                        )}
                                        {test.computer_name && (
                                            <div className="text-xs text-slate-500 mt-1">
                                                <span className="font-semibold text-slate-700">Computer:</span> {test.computer_name}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between text-sm pt-3 border-t border-slate-100">
                                        <div className="text-slate-500 text-xs">{dateStr}</div>
                                        <Link href={`/dashboard/results/${test.id}`} className="text-[var(--brand-purple)] font-semibold text-xs tracking-wider uppercase flex items-center gap-1 hover:underline">
                                            View Details
                                            <ChevronRight className="h-4 w-4" />
                                        </Link>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block relative w-full overflow-x-auto">
                    <table className="w-full table-auto caption-bottom text-sm text-left min-w-[1100px]">
                        <thead className="[&_tr]:border-b border-slate-200">
                            <tr className="border-b transition-colors hover:bg-slate-50/50">
                                <th className="h-10 px-2 align-middle font-medium text-slate-500 w-[70px]">Test ID</th>
                                <th className="h-10 px-2 align-middle font-medium text-slate-500 w-[90px]">Device ID</th>
                                <th className="h-10 px-2 align-middle font-medium text-slate-500 w-[140px]">Computer Name</th>
                                <th className="h-10 px-2 align-middle font-medium text-slate-500 w-[100px]">Status</th>

                                {showTechnicianColumn && (
                                    <th className="h-10 px-2 align-middle font-medium text-slate-500 w-[130px]">Client</th>
                                )}
                                <th className="h-10 px-2 align-middle font-medium text-slate-500 max-w-[200px]">Model</th>
                                <th className="h-10 px-2 align-middle font-medium text-slate-500 w-[90px]">Version</th>
                                <th className="h-10 px-2 align-middle font-medium text-slate-500 w-[130px]">Serial No.</th>
                                <th className="h-10 px-2 align-middle font-medium text-slate-500 w-[120px]">Date</th>
                                <th className="h-10 px-2 align-middle font-medium text-slate-500 text-right w-[120px]">Action</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                <tr><td colSpan={showTechnicianColumn ? 10 : 9} className="p-8 text-center text-slate-500">Loading...</td></tr>
                            ) : sortedResults.length === 0 ? (
                                <tr><td colSpan={showTechnicianColumn ? 10 : 9} className="p-8 text-center text-slate-500">No results match the selected filters</td></tr>
                            ) : (
                                sortedResults.map((test) => {
                                    const dateObj = new Date(test.timestamp);
                                    const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                    const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                                    return (
                                        <tr key={test.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50">
                                            <td className="p-2 align-middle font-medium text-slate-900 break-words">#{test.id}</td>
                                            <td className="p-2 align-middle font-mono text-xs text-slate-500 break-words">
                                                {test.machine_id ? (
                                                    <span>{test.machine_id}</span>
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="p-2 align-middle text-slate-700 text-sm break-words">
                                                {test.computer_name ? (
                                                    <span className="font-medium">{test.computer_name}</span>
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="p-2 align-middle break-words">
                                                {test.pramaan_grade ? (() => {
                                                    const s = getGradeStyle(test.pramaan_grade);
                                                    return (
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[15px] font-bold ${gradeHeroColor(test.pramaan_grade)}`}>
                                                                    {test.pramaan_grade}
                                                                </span>
                                                                <span className={`inline-flex items-center rounded-lg px-3 py-1 text-sm font-bold ${s.bg} ${s.text} border-2 border-[currentColor]/10`}>
                                                                    {test.pramaan_score}
                                                                </span>
                                                            </div>
                                                        </div>
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
                                                <td className="p-2 align-middle">
                                                    {test.technician_name || test.technician_username ? (
                                                        <span className="inline-flex items-center gap-2 text-slate-900 font-medium">
                                                            <span className="max-w-[120px] truncate" title={test.technician_name || test.technician_username}>
                                                                {test.technician_name || test.technician_username}
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 text-xs">Unassigned</span>
                                                    )}
                                                </td>
                                            )}
                                            <td className="p-2 align-middle text-slate-900 leading-tight max-w-[200px]">
                                                <div className="truncate max-w-[200px]" title={`${test.system_manufacturer} ${test.system_model}`}>
                                                    {test.system_manufacturer} {test.system_model}
                                                </div>
                                            </td>
                                            <td className="p-2 align-middle text-slate-500 break-words">{formatAppVersion(test.app_version)}</td>
                                            <td className="p-2 align-middle text-slate-500 break-words">
                                                <div className="truncate" title={test.system_serial}>{test.system_serial}</div>
                                            </td>
                                            <td className="p-2 align-middle text-slate-500">
                                                <div>{dateStr}</div>
                                                <div className="text-xs text-slate-400 mt-0.5">{timeStr}</div>
                                            </td>
                                            <td className="p-2 align-middle text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Link href={`/dashboard/results/${test.id}`}>
                                                        <Button variant="outline" size="sm" className="rounded-full px-4 border-slate-200 text-slate-700 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-8">
                                                            VIEW
                                                        </Button>
                                                    </Link>
                                                    <Link href={`/report/${test.id}`} target="_blank">
                                                        <Button variant="ghost" size="sm" className="rounded-full w-8 h-8 p-0 text-slate-400 hover:text-[var(--brand-purple)]">
                                                            <Printer className="h-4 w-4" />
                                                        </Button>
                                                    </Link>
                                                </div>
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
