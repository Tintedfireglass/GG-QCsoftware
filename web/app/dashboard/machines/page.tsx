"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { getMachines } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Monitor, ExternalLink } from "lucide-react"
import { formatDbDate } from "@/lib/utils"
import { getGradeStyle } from "@/lib/grades"

export default function MachinesPage() {
    const router = useRouter()
    const [machines, setMachines] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [navigating, setNavigating] = useState<number | null>(null)
    const [selectedGrades, setSelectedGrades] = useState<string[]>([])
    const [isGradeFilterOpen, setIsGradeFilterOpen] = useState(false)
    const [machineSort, setMachineSort] = useState<"grade_desc" | "grade_asc" | "last_seen_desc" | "last_seen_asc" | "id_asc">("grade_desc")

    useEffect(() => {
        async function load() {
            try {
                const data = await getMachines()
                setMachines(data.machines)
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) return <div className="p-8 text-center text-slate-500">Loading machines...</div>

    const gradeOptions = ["A+", "A", "B", "C", "Reject", "Unknown"]
    const gradeOrder: Record<string, number> = {
        "A+": 0,
        "A": 1,
        "B": 2,
        "C": 3,
        "Reject": 4,
        "Unknown": 5
    }

    const getGradeKey = (grade?: string) => {
        if (!grade) return "Unknown"
        const g = grade.toUpperCase() === "REJECT" ? "Reject" : grade.toUpperCase()
        if (g === "A+") return "A+"
        if (g === "A") return "A"
        if (g === "B") return "B"
        if (g === "C") return "C"
        if (g === "D" || g === "E" || g === "F") return "Reject"
        if (g === "REJECT") return "Reject"
        return "Unknown"
    }

    const isGradeSelected = (gradeKey: string) =>
        selectedGrades.length === 0 || selectedGrades.includes(gradeKey)

    const toggleGrade = (grade: string) => {
        setSelectedGrades((prev) =>
            prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
        )
    }

    const filteredMachines = useMemo(() => {
        return machines.filter((m) => isGradeSelected(getGradeKey(m?.latest_grade)))
    }, [machines, selectedGrades])

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

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Registered Machines</h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Showing {sortedMachines.length} of {machines.length} machines
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
                        value={machineSort}
                        onChange={(e) => setMachineSort(e.target.value as typeof machineSort)}
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
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

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {sortedMachines.map((machine) => (
                    <Card key={machine.id} className="shadow-none border border-slate-200">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                {(() => {
                                    const style = getGradeStyle(machine.latest_grade);
                                    return (
                                        <div className={`h-10 w-10 rounded-full ${style.bg} flex items-center justify-center shrink-0`}>
                                            <Monitor className={`h-5 w-5 ${style.text}`} />
                                        </div>
                                    );
                                })()}
                                <div>
                                    <CardTitle className="text-base font-semibold text-slate-900">
                                        Device ID: {machine.id}
                                    </CardTitle>
                                    <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]" title={(machine.custom_name || machine.computer_name) || ""}>
                                        {machine.custom_name ? `${machine.custom_name} • ` : ''}
                                        {!machine.custom_name && machine.computer_name ? `${machine.computer_name} • ` : ''}
                                        Seen {formatDbDate(machine.last_seen)}
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-sm text-slate-500">Hardware ID</div>
                                <div className="text-sm font-medium text-slate-900 truncate max-w-[150px]" title={machine.serial_number || "N/A"}>
                                    {machine.serial_number || "N/A"}
                                </div>
                            </div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-sm text-slate-500">IP Address</div>
                                <div className="text-sm font-mono text-slate-900 truncate max-w-[150px]" title={machine.latest_ip || "N/A"}>
                                    {machine.latest_ip || "N/A"}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
                                <div>
                                    <div className="text-2xl font-bold text-slate-900 leading-none">
                                        {machine.test_count}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">Total Tests</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Link href={`/dashboard/machines/${machine.id}`}>
                                        <Button
                                            variant="outline"
                                            className="rounded-full px-4 border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9 text-sm font-medium"
                                        >
                                            View History
                                        </Button>
                                    </Link>
                                    <Button
                                        variant="outline"
                                        className="rounded-full px-4 border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9 text-sm font-medium"
                                        disabled={navigating === machine.id || Number(machine.test_count) === 0}
                                        onClick={async () => {
                                            setNavigating(machine.id)
                                            try {
                                                const token = localStorage.getItem("qc_token")
                                                const res = await fetch(`/api/machines/${machine.id}`, {
                                                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                                                })
                                                const data = await res.json()
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
        </div>
    )
}
