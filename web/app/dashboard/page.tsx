"use client"

import { useEffect, useState } from "react"
import { getMachines, getQCResults } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, CheckCircle, XCircle, Monitor } from "lucide-react"

export default function DashboardPage() {
    const [stats, setStats] = useState({
        totalTests: 0,
        passRate: 0,
        activeMachines: 0,
        recentTests: [] as any[]
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadData() {
            try {
                const [resultsData, machinesData] = await Promise.all([
                    getQCResults(1, 10), // Get recent 10
                    getMachines()
                ])

                const total = resultsData.pagination.total
                // We don't have pass rate from API yet, so we'll just display what we have or calculate from the page
                //Ideally backend should provide stats. 
                // For MVP layout, we'll just show the total count.

                setStats({
                    totalTests: total,
                    passRate: 0, // Placeholder
                    activeMachines: machinesData.machines.length,
                    recentTests: resultsData.results
                })
            } catch (error) {
                console.error("Failed to load dashboard data", error)
            } finally {
                setLoading(false)
            }
        }

        loadData()
    }, [])

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total QC Tests</CardTitle>
                        <Activity className="h-4 w-4 text-slate-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalTests}</div>
                        <p className="text-xs text-slate-500">All time records</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Stations</CardTitle>
                        <Monitor className="h-4 w-4 text-slate-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeMachines}</div>
                        <p className="text-xs text-slate-500">Registered machines</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                        <CheckCircle className="h-4 w-4 text-slate-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.recentTests.length}</div>
                        <p className="text-xs text-slate-500">Tests in last batch</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Recent QC Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="relative w-full overflow-auto">
                            <table className="w-full caption-bottom text-sm text-left">
                                <thead className="[&_tr]:border-b">
                                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Refurb ID</th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Model</th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Serial</th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Date</th>
                                    </tr>
                                </thead>
                                <tbody className="[&_tr:last-child]:border-0">
                                    {stats.recentTests.map((test) => (
                                        <tr key={test.id} className="border-b transition-colors hover:bg-muted/50">
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
                                            <td className="p-4 align-middle">{test.system_model}</td>
                                            <td className="p-4 align-middle">{test.system_serial}</td>
                                            <td className="p-4 align-middle text-slate-500">
                                                {new Date(test.timestamp).toLocaleDateString()} {new Date(test.timestamp).toLocaleTimeString()}
                                            </td>
                                        </tr>
                                    ))}
                                    {stats.recentTests.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-4 text-center text-slate-500">No test results found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
