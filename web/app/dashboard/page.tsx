"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { getMachines, getQCResults, getUsers } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { getGradeStyle } from "@/lib/grades"
import { formatDbDateTime, cn } from "@/lib/utils"
import {
    Activity,
    CheckCircle,
    XCircle,
    Monitor,
    Search,
    Users,
    Shield,
    UserCheck,
    TrendingUp,
    Download
} from "lucide-react"

export default function DashboardPage() {
    const { user, isSuperAdmin, isRefurbisher, isReseller, isTechnician, isEnterprise, isAdmin, isUser, isClient, getRoleDisplayName } = useAuth()
    const [stats, setStats] = useState({
        totalTests: 0,
        passRate: 0,
        activeMachines: 0,
        totalUsers: 0,
        totalAdmins: 0,
        totalTechnicians: 0,
        recentTests: [] as any[]
    })
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    async function loadData(query = "") {
        setLoading(true)
        try {
            const [resultsData, machinesData] = await Promise.all([
                getQCResults(1, 10, { search: query }),
                getMachines()
            ])

            const total = resultsData.pagination.total

            // Calculate average score from recent tests
            const scoredTests = resultsData.results.filter((t: any) => t.pramaan_score > 0)
            const avgScore = scoredTests.length > 0
                ? Math.round(scoredTests.reduce((sum: number, t: any) => sum + t.pramaan_score, 0) / scoredTests.length)
                : 0

            let userStats = { totalUsers: 0, totalAdmins: 0, totalTechnicians: 0 }

            // Load user stats for admins
            if (isSuperAdmin() || isAdmin() || isEnterprise() || isReseller()) {
                try {
                    const usersData = await getUsers(1, 100)
                    userStats.totalUsers = usersData.pagination.total
                    userStats.totalAdmins = usersData.users.filter((u: any) => u.role === 'Refurbisher' || u.role === 'Enterprise' || u.role === 'Reseller').length
                    userStats.totalTechnicians = usersData.users.filter((u: any) => u.role === 'Technician').length
                } catch (err) {
                    console.error("Failed to load user stats", err)
                }
            }

            setStats({
                totalTests: total,
                passRate: avgScore,
                activeMachines: machinesData.machines.length,
                ...userStats,
                recentTests: resultsData.results
            })
        } catch (error) {
            console.error("Failed to load dashboard data", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>
    }

    return (
        <div className="space-y-6">
            {/* Welcome Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        Welcome back, {user?.display_name || user?.username}
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Pramaan • {isSuperAdmin() ? "Full system access" : isEnterprise() ? "Fleet management" : isReseller() ? "Reseller access" : isRefurbisher() ? "Team management access" : isClient() ? "Client access" : "QC Technician access"}
                    </p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="shadow-none border-slate-200">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">
                            {isUser() ? "My QC Tests" : "Total QC Tests"}
                        </CardTitle>
                        <div className="h-8 w-8 rounded-lg bg-[var(--brand-purple)]/10 flex items-center justify-center">
                            <Activity className="h-4 w-4 text-[var(--brand-purple)]" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">{stats.totalTests}</div>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            {isUser() ? "Your tests" : "All time records"}
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-none border-slate-200">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">AVG Score</CardTitle>
                        <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">{stats.passRate}/100</div>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            From recent tests
                        </p>
                    </CardContent>
                </Card>

                {/* Show different stats based on role */}
                {(isSuperAdmin() || isAdmin() || isEnterprise() || isReseller()) && (
                    <>
                        <Card className="shadow-none border-slate-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-slate-600">Active Stations</CardTitle>
                                <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                    <Monitor className="h-4 w-4 text-blue-600" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">{stats.activeMachines}</div>
                                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">Registered machines</p>
                            </CardContent>
                        </Card>

                        <Card className="shadow-none border-slate-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-slate-600">
                                    {isSuperAdmin() ? "Total Users" : "Team Members"}
                                </CardTitle>
                                <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center">
                                    <Users className="h-4 w-4 text-orange-600" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">{stats.totalUsers}</div>
                                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                {isSuperAdmin()
                                    ? `${stats.totalAdmins} refurb/enterprise/reseller, ${stats.totalTechnicians} technicians`
                                    : "Technicians in your team"
                                }
                            </p>
                            </CardContent>
                        </Card>
                    </>
                )}

                {isUser() && (
                    <>
                        <Card className="shadow-none border-slate-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-slate-600">Recent Activity</CardTitle>
                                <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                    <CheckCircle className="h-4 w-4 text-blue-600" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">{stats.recentTests.length}</div>
                                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">Tests in last batch</p>
                            </CardContent>
                        </Card>

                        <Card className="shadow-none border-slate-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-slate-600">Status</CardTitle>
                                <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                                    <UserCheck className="h-4 w-4 text-emerald-600" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-emerald-600">Active</div>
                                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">Your account status</p>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* Quick Actions for Admins */}
            {(isSuperAdmin() || isAdmin() || isEnterprise() || isReseller()) && (
                <div className="grid gap-4 md:grid-cols-3">
                    <Link href="/dashboard/users/new">
                        <Card className="cursor-pointer hover:border-[var(--brand-purple)] transition-colors shadow-none border border-slate-200">
                            <CardContent className="flex items-center gap-4 p-6">
                                <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center">
                                    <Users className="h-6 w-6 text-slate-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-900">Add User</h3>
                                    <p className="text-sm text-slate-500 mt-1">
                                        {isSuperAdmin()
                                            ? "Create admin or technician"
                                            : isReseller()
                                                ? "Add technician or client"
                                                : isEnterprise()
                                                    ? "Add new technician"
                                                    : "Add new technician"}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/dashboard/results">
                        <Card className="cursor-pointer hover:border-[var(--brand-purple)] transition-colors shadow-none border border-slate-200">
                            <CardContent className="flex items-center gap-4 p-6">
                                <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center">
                                    <Activity className="h-6 w-6 text-slate-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-900">View Results</h3>
                                    <p className="text-sm text-slate-500 mt-1">Browse all QC test results</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/dashboard/machines">
                        <Card className="cursor-pointer hover:border-[var(--brand-purple)] transition-colors shadow-none border border-slate-200">
                            <CardContent className="flex items-center gap-4 p-6">
                                <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center">
                                    <Monitor className="h-6 w-6 text-slate-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-900">Manage Machines</h3>
                                    <p className="text-sm text-slate-500 mt-1">View registered stations</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            )}

            {/* Recent Results Table */}
            <Card className="border-none shadow-none">
                <CardHeader className="px-0 pt-0 pb-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <CardTitle className="text-xl">
                            {isUser() ? "My Recent QC Results" : "Recent QC Results"}
                        </CardTitle>
                        <div className="flex w-full max-w-sm items-center space-x-2">
                            <Input
                                type="text"
                                placeholder="Search Test ID, Serial..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadData(searchQuery)}
                                className="border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                            />
                            <Button size="icon" onClick={() => loadData(searchQuery)} className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)]">
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="px-0">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm text-left whitespace-nowrap">
                            <thead className="[&_tr]:border-b border-slate-200">
                                <tr className="border-b transition-colors hover:bg-slate-50/50 data-[state=selected]:bg-slate-50">
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Test ID</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Status</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Model name</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Serial No.</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Date</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {stats.recentTests.map((test) => {
                                    const dateObj = new Date(test.timestamp);
                                    const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                    const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                                    return (
                                        <tr key={test.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50">
                                            <td className="p-4 align-middle font-medium text-slate-900">#{test.id}</td>
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

                                            <td className="p-4 align-middle text-slate-900">{test.system_model}</td>
                                            <td className="p-4 align-middle text-slate-500">{test.system_serial}</td>
                                            <td className="p-4 align-middle text-slate-500">
                                                <div>{dateStr}</div>
                                                <div className="text-xs text-slate-400 mt-0.5">{timeStr}</div>
                                            </td>
                                            <td className="p-4 align-middle text-right">
                                                <Link href={`/dashboard/results/${test.id}`}>
                                                    <Button variant="outline" size="sm" className="rounded-full px-6 border-slate-200 text-slate-700 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)]">
                                                        VIEW
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {stats.recentTests.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500">No test results found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {stats.recentTests.length > 0 && (
                        <div className="mt-6 text-center">
                            <Link href="/dashboard/results">
                                <Button variant="outline" className="border-slate-200 text-slate-700 hover:text-[var(--brand-purple)]">
                                    View All Results
                                </Button>
                            </Link>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
