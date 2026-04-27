"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { enrollFleetMachine, getFleet, getMachine } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDbDate, formatDbDateTime } from "@/lib/utils"
import {
    Search,
    Server,
    Plus,
    RefreshCcw,
    ExternalLink,
    Tag,
    Cpu,
    Layers,
} from "lucide-react"

type FleetMachine = {
    id: number
    machine_id: string
    serial_number?: string
    manufacturer?: string
    model?: string
    asset_tag?: string
    group_id?: number | null
    group_name?: string | null
    last_seen?: string
    latest_score?: number | null
    latest_grade?: string | null
    latest_test_date?: string | null
    lifecycle_event_count?: number | null
}

type FleetSummary = {
    total: number
    tested: number
    untested: number
    avgScore: number
}

export default function FleetPage() {
    const router = useRouter()
    const [machines, setMachines] = useState<FleetMachine[]>([])
    const [summary, setSummary] = useState<FleetSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [search, setSearch] = useState("")
    const [groupFilter, setGroupFilter] = useState("")
    const [showEnroll, setShowEnroll] = useState(false)
    const [enrolling, setEnrolling] = useState(false)
    const [navigating, setNavigating] = useState<number | null>(null)

    const [enrollForm, setEnrollForm] = useState({
        machine_id: "",
        asset_tag: "",
        serial_number: "",
        manufacturer: "",
        model: "",
        group_id: "",
    })

    const groupOptions = useMemo(() => {
        const map = new Map<number, string>()
        machines.forEach((m) => {
            if (m.group_id && m.group_name) map.set(m.group_id, m.group_name)
        })
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
    }, [machines])

    async function loadFleet(currentSearch = search, currentGroup = groupFilter) {
        setLoading(true)
        setError(null)
        try {
            const data = await getFleet({
                search: currentSearch.trim() || undefined,
                groupId: currentGroup || undefined,
            })
            setMachines(data.machines || [])
            setSummary(data.summary || null)
        } catch (err) {
            console.error(err)
            setError(err instanceof Error ? err.message : "Failed to load fleet")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadFleet()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function handleEnroll(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (!enrollForm.machine_id.trim()) {
            setError("Machine ID is required to enroll.")
            return
        }

        setEnrolling(true)
        try {
            await enrollFleetMachine({
                machine_id: enrollForm.machine_id.trim(),
                asset_tag: enrollForm.asset_tag.trim() || undefined,
                serial_number: enrollForm.serial_number.trim() || undefined,
                manufacturer: enrollForm.manufacturer.trim() || undefined,
                model: enrollForm.model.trim() || undefined,
                group_id: enrollForm.group_id ? Number(enrollForm.group_id) : null,
            })
            setEnrollForm({
                machine_id: "",
                asset_tag: "",
                serial_number: "",
                manufacturer: "",
                model: "",
                group_id: "",
            })
            setShowEnroll(false)
            await loadFleet()
        } catch (err) {
            console.error(err)
            setError(err instanceof Error ? err.message : "Failed to enroll machine")
        } finally {
            setEnrolling(false)
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading fleet...</div>
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Enterprise Fleet</h1>
                    <p className="text-slate-500 mt-1">Monitor owned machines, lifecycle, and latest health scores.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        className="rounded-full border-slate-200 bg-white text-slate-700 hover:text-[var(--brand-purple)]"
                        onClick={() => loadFleet()}
                    >
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                    <Button
                        className="rounded-full bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white"
                        onClick={() => setShowEnroll((prev) => !prev)}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Enroll Machine
                    </Button>
                </div>
            </div>

            {summary && (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="border border-slate-200 shadow-none">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm text-slate-500">Total Machines</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold text-slate-900">{summary.total}</div>
                        </CardContent>
                    </Card>
                    <Card className="border border-slate-200 shadow-none">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm text-slate-500">Tested</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold text-slate-900">{summary.tested}</div>
                        </CardContent>
                    </Card>
                    <Card className="border border-slate-200 shadow-none">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm text-slate-500">Untested</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold text-slate-900">{summary.untested}</div>
                        </CardContent>
                    </Card>
                    <Card className="border border-slate-200 shadow-none">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm text-slate-500">Average Score</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold text-slate-900">{summary.avgScore}</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700">
                    {error}
                </div>
            )}

            {showEnroll && (
                <Card className="border border-slate-200 shadow-none">
                    <CardHeader>
                        <CardTitle className="text-lg text-slate-900">Enroll a Machine</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleEnroll} className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Machine ID <span className="text-rose-500">*</span>
                                </label>
                                <Input
                                    value={enrollForm.machine_id}
                                    onChange={(e) => setEnrollForm({ ...enrollForm, machine_id: e.target.value })}
                                    placeholder="QC-MCH-000123"
                                    required
                                    className="h-11 bg-slate-50/50 border-slate-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Asset Tag</label>
                                <Input
                                    value={enrollForm.asset_tag}
                                    onChange={(e) => setEnrollForm({ ...enrollForm, asset_tag: e.target.value })}
                                    placeholder="GG-FT-9842"
                                    className="h-11 bg-slate-50/50 border-slate-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Serial Number</label>
                                <Input
                                    value={enrollForm.serial_number}
                                    onChange={(e) => setEnrollForm({ ...enrollForm, serial_number: e.target.value })}
                                    placeholder="C02ZK123ABC"
                                    className="h-11 bg-slate-50/50 border-slate-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Manufacturer</label>
                                <Input
                                    value={enrollForm.manufacturer}
                                    onChange={(e) => setEnrollForm({ ...enrollForm, manufacturer: e.target.value })}
                                    placeholder="Dell"
                                    className="h-11 bg-slate-50/50 border-slate-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Model</label>
                                <Input
                                    value={enrollForm.model}
                                    onChange={(e) => setEnrollForm({ ...enrollForm, model: e.target.value })}
                                    placeholder="Latitude 7400"
                                    className="h-11 bg-slate-50/50 border-slate-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Group</label>
                                <select
                                    value={enrollForm.group_id}
                                    onChange={(e) => setEnrollForm({ ...enrollForm, group_id: e.target.value })}
                                    className="h-11 w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)]"
                                >
                                    <option value="">No group</option>
                                    {groupOptions.map((group) => (
                                        <option key={group.id} value={group.id}>
                                            {group.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full border-slate-200 bg-white text-slate-700"
                                    onClick={() => setShowEnroll(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="rounded-full bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white"
                                    disabled={enrolling}
                                >
                                    {enrolling ? "Enrolling..." : "Enroll Machine"}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <Card className="border border-slate-200 shadow-none">
                <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <CardTitle className="text-lg text-slate-900">Fleet Inventory</CardTitle>
                        <p className="text-sm text-slate-500 mt-1">
                            {machines.length} machine{machines.length === 1 ? "" : "s"} in your fleet.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by ID, serial, model..."
                                className="h-10 pl-9 bg-slate-50/50 border-slate-200"
                            />
                        </div>
                        <select
                            value={groupFilter}
                            onChange={(e) => setGroupFilter(e.target.value)}
                            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                        >
                            <option value="">All Groups</option>
                            {groupOptions.map((group) => (
                                <option key={group.id} value={String(group.id)}>
                                    {group.name}
                                </option>
                            ))}
                        </select>
                        <Button
                            variant="outline"
                            className="rounded-full border-slate-200 bg-white text-slate-700"
                            onClick={() => loadFleet()}
                        >
                            Apply
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {machines.map((machine) => (
                        <Card key={machine.id} className="border border-slate-200 shadow-none">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center">
                                        <Server className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base font-semibold text-slate-900">
                                            {machine.machine_id}
                                        </CardTitle>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            Last seen {machine.last_seen ? formatDbDateTime(machine.last_seen) : "-"}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-slate-500">Lifecycle</div>
                                    <div className="text-sm font-semibold text-slate-800">
                                        {machine.lifecycle_event_count ?? 0} events
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Tag className="h-4 w-4 text-slate-400" />
                                        <span>{machine.asset_tag || "No asset tag"}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Layers className="h-4 w-4 text-slate-400" />
                                        <span>{machine.group_name || "Ungrouped"}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Cpu className="h-4 w-4 text-slate-400" />
                                        <span>{machine.manufacturer || "Unknown"} {machine.model || ""}</span>
                                    </div>
                                    <div className="text-slate-600">
                                        Serial: {machine.serial_number || "N/A"}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-xs text-slate-500">Latest Score</div>
                                        <div className="text-2xl font-semibold text-slate-900">
                                            {machine.latest_score ?? "--"}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {machine.latest_test_date ? `Tested ${formatDbDate(machine.latest_test_date)}` : "Not tested"}
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="rounded-full px-4 border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9 text-sm font-medium"
                                        disabled={navigating === machine.id || machine.latest_score === null}
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
                                        {navigating !== machine.id && <ExternalLink className="ml-1.5 h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {machines.length === 0 && (
                        <div className="col-span-full text-center text-slate-500 py-10">
                            No machines in fleet yet. Enroll a machine to get started.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
