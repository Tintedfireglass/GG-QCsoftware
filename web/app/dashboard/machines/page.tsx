"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { getMachine, getMachines, getUsers } from "@/lib/api"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { Monitor, ExternalLink, Search } from "lucide-react"
import { Pagination } from "@/components/ui/pagination"
import { formatDbDate } from "@/lib/utils"
import { getGradeStyle } from "@/lib/platforms/windows/grades"
import { isMachineActive, NOW_TICK_MS, POLL_INTERVAL_MS } from "@/lib/platforms/windows/machine-status"

const PAGE_SIZE = 12

export default function MachinesPage() {
    const router = useRouter()
    const { canManageUsers } = useAuth()
    const [machines, setMachines] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [navigating, setNavigating] = useState<number | null>(null)
    const [searchInput, setSearchInput] = useState("")
    const [appliedSearch, setAppliedSearch] = useState("")
    const [selectedGrades, setSelectedGrades] = useState<string[]>([])
    const [isGradeFilterOpen, setIsGradeFilterOpen] = useState(false)
    const [machineSort, setMachineSort] = useState<"grade_desc" | "grade_asc" | "last_seen_desc" | "last_seen_asc" | "id_asc">("grade_desc")
    const gradeFilterRef = useRef<HTMLDivElement | null>(null)
    const [nowMs, setNowMs] = useState(() => Date.now())
    // Client (owner) filter — only offered to user managers (SuperAdmin etc.).
    const [users, setUsers] = useState<Array<{ id: number; username: string; display_name?: string; is_active?: boolean }>>([])
    const [selectedClientId, setSelectedClientId] = useState("")
    const [isClientFilterOpen, setIsClientFilterOpen] = useState(false)
    const [clientFilterSearch, setClientFilterSearch] = useState("")
    const clientFilterRef = useRef<HTMLDivElement | null>(null)
    const [page, setPage] = useState(1)

    useEffect(() => {
        let mounted = true

        async function load(showLoading: boolean) {
            try {
                if (showLoading) setLoading(true)
                const data = await getMachines()
                if (mounted) setMachines(data.machines)
            } catch (error) {
                console.error(error)
            } finally {
                if (showLoading) setLoading(false)
            }
        }
        load(true)
        const poll = setInterval(() => load(false), POLL_INTERVAL_MS)
        return () => {
            mounted = false
            clearInterval(poll)
        }
    }, [])

    useEffect(() => {
        const t = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS)
        return () => clearInterval(t)
    }, [])

    useEffect(() => {
        let cancelled = false
        async function loadUsers() {
            if (!canManageUsers()) return
            try {
                const data = await getUsers(1, 500, {})
                if (!cancelled) setUsers(data.users || [])
            } catch (e) {
                console.error("Failed to load clients for filter:", e)
            }
        }
        loadUsers()
        return () => { cancelled = true }
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
        if (g.includes("REJECT")) return "Unknown"
        if (g.startsWith("D") || g.startsWith("E") || g.startsWith("F")) return "Unknown"
        return "Unknown"
    }

    const isGradeSelected = (gradeKey: string) =>
        selectedGrades.length === 0 || selectedGrades.includes(gradeKey)

    const toggleGrade = (grade: string) => {
        setSelectedGrades((prev) =>
            prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
        )
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        setAppliedSearch(searchInput.trim())
    }

    const getClientLabel = (u: { id: number; username: string; display_name?: string }) =>
        u.display_name || u.username || `Client #${u.id}`

    const sortedClients = useMemo(() => {
        // Only offer active clients as filter options.
        const list = users.filter((u) => u.is_active !== false)
        return list.sort((a, b) => getClientLabel(a).localeCompare(getClientLabel(b), undefined, { sensitivity: "base" }))
    }, [users])

    const filteredClients = useMemo(() => {
        const term = clientFilterSearch.trim().toLowerCase()
        if (!term) return sortedClients
        return sortedClients.filter((u) => getClientLabel(u).toLowerCase().includes(term))
    }, [sortedClients, clientFilterSearch])

    const selectedClientLabel = useMemo(() => {
        if (!selectedClientId) return "Client: All"
        const id = parseInt(selectedClientId, 10)
        const found = users.find((u) => u.id === id)
        return found ? `Client: ${getClientLabel(found)}` : "Client: Selected"
    }, [selectedClientId, users])

    const filteredMachines = useMemo(() => {
        const term = appliedSearch.trim().toLowerCase()
        const clientId = selectedClientId ? parseInt(selectedClientId, 10) : null

        return machines.filter((m) => {
            if (!isGradeSelected(getGradeKey(m?.latest_grade))) return false
            if (clientId !== null) {
                // A machine belongs to a client if that client tested it, or owns it (fleet).
                const testedBy = Array.isArray(m?.technician_ids) ? m.technician_ids.map(Number) : []
                const owned = Number(m?.owner_user_id) === clientId
                if (!owned && !testedBy.includes(clientId)) return false
            }
            if (!term) return true

            const haystack = [
                m?.id,
                m?.custom_name,
                m?.computer_name,
                m?.serial_number,
                m?.latest_ip,
                m?.latest_grade,
            ]
                .filter(Boolean)
                .map((v) => String(v).toLowerCase())
                .join(" | ")

            return haystack.includes(term)
        })
    }, [machines, selectedGrades, appliedSearch, selectedClientId])

    const sortedMachines = useMemo(() => {
        const list = [...filteredMachines]
        if (machineSort === "grade_desc") {
            return list.sort((a: any, b: any) => {
                const aRank = gradeOrder[getGradeKey(a?.latest_grade)] ?? gradeOrder.Unknown
                const bRank = gradeOrder[getGradeKey(b?.latest_grade)] ?? gradeOrder.Unknown
                if (aRank !== bRank) return aRank - bRank
                return String(a?.id ?? "").localeCompare(String(b?.id ?? ""))
            })
        }
        if (machineSort === "grade_asc") {
            return list.sort((a: any, b: any) => {
                const aRank = gradeOrder[getGradeKey(a?.latest_grade)] ?? gradeOrder.Unknown
                const bRank = gradeOrder[getGradeKey(b?.latest_grade)] ?? gradeOrder.Unknown
                if (aRank !== bRank) return bRank - aRank
                return String(a?.id ?? "").localeCompare(String(b?.id ?? ""))
            })
        }
        if (machineSort === "last_seen_desc") {
            return list.sort((a: any, b: any) => {
                const aTime = Date.parse(a?.last_seen || "") || 0
                const bTime = Date.parse(b?.last_seen || "") || 0
                return bTime - aTime
            })
        }
        if (machineSort === "last_seen_asc") {
            return list.sort((a: any, b: any) => {
                const aTime = Date.parse(a?.last_seen || "") || 0
                const bTime = Date.parse(b?.last_seen || "") || 0
                return aTime - bTime
            })
        }
        return list.sort((a: any, b: any) => String(a?.id ?? "").localeCompare(String(b?.id ?? "")))
    }, [filteredMachines, machineSort])

    const totalPages = Math.max(1, Math.ceil(sortedMachines.length / PAGE_SIZE))

    // Reset to the first page whenever the result set changes.
    useEffect(() => {
        setPage(1)
    }, [appliedSearch, selectedGrades, selectedClientId, machineSort])

    // Clamp the page if the list shrinks below the current page.
    useEffect(() => {
        if (page > totalPages) setPage(totalPages)
    }, [page, totalPages])

    const pagedMachines = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE
        return sortedMachines.slice(start, start + PAGE_SIZE)
    }, [sortedMachines, page])

    if (loading) return <div className="p-8 text-center text-slate-500">Loading machines...</div>

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Registered Machines</h1>
                    <p className="text-xs text-slate-500 mt-1">
                        {sortedMachines.length === 0
                            ? `0 of ${machines.length} machines`
                            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, sortedMachines.length)} of ${sortedMachines.length} machines`}
                        {sortedMachines.length !== machines.length ? ` (filtered from ${machines.length})` : ""}
                    </p>
                </div>
                <div className="flex w-full md:w-auto gap-2 flex-col sm:flex-row">
                    <form onSubmit={handleSearch} className="flex w-full md:w-auto gap-2 flex-col sm:flex-row">
                        <Input
                            placeholder="Search Device ID, Name, Serial..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full sm:w-[300px] border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                        />
                        <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white sm:shrink-0 w-full sm:w-auto">
                            <Search className="h-4 w-4 sm:mr-2" />
                            <span className="inline">Search</span>
                        </Button>
                    </form>
                    <div className="flex flex-wrap items-center gap-2">
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
                                                className={`w-full text-left px-2 py-2 rounded text-sm hover:bg-slate-50 ${selectedClientId === "" ? "bg-slate-50 font-semibold" : ""}`}
                                                onClick={() => {
                                                    setSelectedClientId("")
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
                                                    const isSelected = selectedClientId === value
                                                    return (
                                                        <button
                                                            key={u.id}
                                                            type="button"
                                                            className={`w-full text-left px-2 py-2 rounded text-sm hover:bg-slate-50 ${isSelected ? "bg-slate-50 font-semibold" : ""}`}
                                                            onClick={() => {
                                                                setSelectedClientId(value)
                                                                setIsClientFilterOpen(false)
                                                            }}
                                                        >
                                                            {getClientLabel(u)}
                                                        </button>
                                                    )
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
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
                        <select
                            value={machineSort}
                            onChange={(e) => setMachineSort(e.target.value as typeof machineSort)}
                            className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                            aria-label="Sort machines"
                        >
                            <option value="grade_desc">Sort: Grade high to low</option>
                            <option value="grade_asc">Sort: Grade low to high</option>
                            <option value="last_seen_desc">Sort: Last seen (newest)</option>
                            <option value="last_seen_asc">Sort: Last seen (oldest)</option>
                            <option value="id_asc">Sort: Device ID</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {pagedMachines.map((machine) => (
                    <Card key={machine.id} className="shadow-sm border border-slate-200 rounded-xl">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-slate-100">
                            <div className="flex items-start sm:items-center justify-between w-full">
                                <div className="flex items-center gap-3">
                                    {(() => {
                                        const style = getGradeStyle(machine.latest_grade);
                                        return (
                                            <div className={`h-10 w-10 rounded-lg ${style.bg} flex items-center justify-center shrink-0`}>
                                                <Monitor className={`h-5 w-5 ${style.text}`} />
                                            </div>
                                        );
                                    })()}
                                    <div>
                                        <CardTitle className="text-[15px] font-bold text-slate-900">
                                            Device ID: {machine.id}
                                        </CardTitle>
                                        <div className="text-[11px] font-medium text-slate-400 mt-0.5 truncate max-w-[180px] sm:max-w-[200px]" title={(machine.custom_name || machine.computer_name) || ""}>
                                            {machine.custom_name ? `${machine.custom_name} • ` : ''}
                                            {!machine.custom_name && machine.computer_name ? `${machine.computer_name} • ` : ''}
                                            Seen {formatDbDate(machine.last_seen)}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-1 sm:mt-0">
                                    {(() => {
                                        const active = isMachineActive(machine.last_seen, nowMs)
                                        return (
                                            <span
                                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${active ? "bg-emerald-50 text-emerald-600 border-emerald-200/50" : "bg-slate-100 text-slate-600 border-slate-200"}`}
                                            >
                                                {active ? "Active" : "Inactive"}
                                            </span>
                                        )
                                    })()}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-[13px] font-medium text-slate-400">Hardware ID</div>
                                <div className="text-[13px] font-bold text-slate-900 truncate max-w-[150px]" title={machine.serial_number || "N/A"}>
                                    {machine.serial_number || "N/A"}
                                </div>
                            </div>
                            <div className="flex items-center justify-between mb-6">
                                <div className="text-[13px] font-medium text-slate-400">IP Address</div>
                                <div className="text-[13px] font-medium text-slate-900 truncate max-w-[150px]" title={machine.latest_ip || "N/A"}>
                                    {machine.latest_ip || "N/A"}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 mt-6">
                                <div>
                                    <div className="text-[28px] font-bold text-slate-900 leading-none tracking-tight">
                                        {machine.test_count}
                                    </div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1.5">TOTAL TESTS</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Link href={`/dashboard/machines/${machine.id}`}>
                                        <Button
                                            variant="outline"
                                            className="rounded-full px-4 border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9 text-xs font-semibold"
                                        >
                                            View History
                                        </Button>
                                    </Link>
                                            <Button
                                                variant="outline"
                                                className="rounded-full px-4 border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9 text-xs font-semibold"
                                                disabled={navigating === machine.id || Number(machine.test_count) === 0}
                                                onClick={async () => {
                                                    setNavigating(machine.id)
                                                    try {
                                                        const data = await getMachine(String(machine.id))
                                                        if (data.test_history?.length > 0) {
                                                            router.push(`/dashboard/results/${data.test_history[0].id}`)
                                                        }
                                                    } catch (err) {
                                                        console.error(err)
                                            } finally {
                                                setNavigating(null)
                                            }
                                        }}
                                    >
                                        {navigating === machine.id ? "Loading..." : "Latest Report"}
                                        {navigating !== machine.id && <ExternalLink className="ml-1.5 shrink-0 h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {sortedMachines.length === 0 && (
                    <p className="col-span-full text-center text-slate-500 py-10">
                        No machines match the selected filters.
                    </p>
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        onPageChange={(p) => setPage(Math.min(totalPages, Math.max(1, p)))}
                    />
                </div>
            )}
        </div>
    )
}
