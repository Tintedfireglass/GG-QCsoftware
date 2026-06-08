"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { getMachineHistoryAlerts, getMachinesCount, getQCResults, getQCResultsCount, getUserStats, getIssuesSummary } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { getGradeStyle, gradeHeroColor } from "@/lib/platforms/windows/grades"
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
    Download,
    AlertTriangle,
    AlertOctagon
} from "lucide-react"

export default function DashboardPage() {
    const { user, isSuperAdmin, isEmployee, isRefurbisher, isReseller, isTechnician, isEnterprise, isOEM, isInsurer, isAdmin, isUser, isClient, getRoleDisplayName } = useAuth()
    const [stats, setStats] = useState({
        totalTests: 0,
        passRate: 0,
        activeMachines: 0,
        totalUsers: 0,
        totalAdmins: 0,
        totalTechnicians: 0,
        recentTests: [] as any[]
    })
    const [alerts, setAlerts] = useState<any[]>([])
    const [issueStats, setIssueStats] = useState<{ devicesWithIssues: number; totalDevices: number }>({ devicesWithIssues: 0, totalDevices: 0 })
    const [loading, setLoading] = useState(true)
    const [secondaryLoading, setSecondaryLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const countRequestId = useRef(0)

    async function loadRecentTests(query = "") {
        setLoading(true)
        try {
            const searchTerm = query.trim()
            const requestId = ++countRequestId.current
            const resultsData = await getQCResults(
                1,
                10,
                searchTerm ? { search: searchTerm } : {},
                { includeTotal: false }
            )

            // Calculate average score from recent tests
            const scoredTests = resultsData.results.filter((t: any) => t.pramaan_score > 0)
            const avgScore = scoredTests.length > 0
                ? Math.round(scoredTests.reduce((sum: number, t: any) => sum + t.pramaan_score, 0) / scoredTests.length)
                : 0

            setStats({
                totalTests: 0,
                passRate: avgScore,
                activeMachines: 0,
                totalUsers: 0,
                totalAdmins: 0,
                totalTechnicians: 0,
                recentTests: resultsData.results
            })

            getQCResultsCount(searchTerm ? { search: searchTerm } : {})
                .then((countData) => {
                    if (requestId !== countRequestId.current) return
                    setStats((prev) => ({ ...prev, totalTests: countData.total ?? 0 }))
                })
                .catch((err) => console.error("Failed to count QC results", err))
        } catch (error) {
            console.error("Failed to load dashboard data", error)
        } finally {
            setLoading(false)
        }
    }

    async function loadSecondary() {
        setSecondaryLoading(true)
        try {
            const [machinesCount, alertsData, issueData] = await Promise.all([
                getMachinesCount().catch(() => ({ total: 0 })),
                getMachineHistoryAlerts().catch(() => ({ alerts: [] })),
                getIssuesSummary().catch(() => ({ devicesWithIssues: 0, totalDevices: 0 }))
            ])

            setStats((prev) => ({
                ...prev,
                activeMachines: machinesCount.total ?? 0,
            }))
            setAlerts(alertsData.alerts || [])
            setIssueStats(issueData)

            if (isSuperAdmin() || isAdmin() || isEnterprise() || isOEM() || isInsurer() || isReseller()) {
                try {
                    const userStats = await getUserStats()
                    setStats((prev) => ({
                        ...prev,
                        totalUsers: userStats.totalUsers ?? 0,
                        totalAdmins: userStats.totalAdmins ?? 0,
                        totalTechnicians: userStats.totalTechnicians ?? 0,
                    }))
                } catch (err) {
                    console.error("Failed to load user stats", err)
                }
            }
        } catch (err) {
            console.error("Failed to load secondary dashboard data", err)
        } finally {
            setSecondaryLoading(false)
        }
    }

    useEffect(() => {
        loadRecentTests()
        loadSecondary()
    }, [])

    return (
        <div className="space-y-6">
            {/* Welcome Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        Welcome back, {user?.display_name || user?.username}
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Pramaan • {isSuperAdmin() ? "Full system access" : isEmployee() ? "Demo access" : isEnterprise() || isOEM() || isInsurer() ? "Fleet management" : isReseller() ? "Reseller access" : isRefurbisher() ? "Team management access" : isClient() ? "Client access" : "QC Technician access"}
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
                        <div className="text-2xl font-bold text-slate-900">{loading ? "—" : stats.totalTests}</div>
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
                        <div className="text-2xl font-bold text-slate-900">{loading ? "—" : `${stats.passRate}/100`}</div>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            From recent tests
                        </p>
                    </CardContent>
                </Card>

                {/* Issues Card — always visible, all roles */}
                <Link href="/dashboard/results?hasIssues=true">
                    <Card className={cn(
                        "shadow-none cursor-pointer transition-colors",
                        issueStats.devicesWithIssues > 0
                            ? "border-red-200 hover:border-red-400 bg-red-50/40"
                            : "border-emerald-200 hover:border-emerald-400 bg-emerald-50/30"
                    )}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-slate-600">
                                {isUser() ? "My Systems with Issues" : "Systems with Issues"}
                            </CardTitle>
                            <div className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center",
                                issueStats.devicesWithIssues > 0 ? "bg-red-100" : "bg-emerald-100"
                            )}>
                                <AlertOctagon className={cn(
                                    "h-4 w-4",
                                    issueStats.devicesWithIssues > 0 ? "text-red-600" : "text-emerald-600"
                                )} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className={cn(
                                "text-2xl font-bold",
                                issueStats.devicesWithIssues > 0 ? "text-red-600" : "text-emerald-600"
                            )}>
                                {secondaryLoading ? "—" : issueStats.devicesWithIssues}
                            </div>
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                {secondaryLoading
                                    ? "Loading issue stats..."
                                    : issueStats.devicesWithIssues > 0
                                    ? `of ${issueStats.totalDevices} ${issueStats.totalDevices === 1 ? 'system' : 'systems'} tested`
                                    : "All systems healthy"}
                            </p>
                        </CardContent>
                    </Card>
                </Link>

                {/* Show different stats based on role */}
                {(isSuperAdmin() || isAdmin() || isEnterprise() || isOEM() || isInsurer() || isReseller()) && (
                    <>
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
                                <div className="text-2xl font-bold text-slate-900">{secondaryLoading ? "—" : stats.totalUsers}</div>
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
            {(isSuperAdmin() || isAdmin() || isEnterprise() || isOEM() || isInsurer() || isReseller()) && (
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

            {/* Degradation Alerts */}
            {alerts.length > 0 && (
                <Card className="shadow-none border-slate-200">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Degradation Alerts</CardTitle>
                        <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {alerts.map((alert) => (
                            <div key={`${alert.machine_id}-${alert.component}-${alert.latest_timestamp}`} className="flex items-center justify-between gap-4 border border-amber-100 rounded-lg px-4 py-3 bg-amber-50">
                                <div className="text-sm text-slate-700">
                                    <span className="font-semibold text-slate-900">
                                        {alert.custom_name || alert.machine_identifier}
                                    </span>
                                    <span className="text-slate-500">: </span>
                                    <span>{alert.component} dropped {alert.previous_grade} → {alert.latest_grade} (last 30 days)</span>
                                </div>
                                <div className="text-xs text-slate-500 whitespace-nowrap">
                                    {formatDbDateTime(alert.latest_timestamp)}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
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
                                onKeyDown={(e) => e.key === 'Enter' && loadRecentTests(searchQuery)}
                                className="border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                            />
                            <Button size="icon" onClick={() => loadRecentTests(searchQuery)} className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)]">
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="px-0">
                    {/* Mobile Card View */}
                    <div className="md:hidden flex flex-col gap-4 p-4">
                        {loading ? (
                            <div className="p-8 text-center text-slate-500">Loading...</div>
                        ) : stats.recentTests.map((test) => {
                            const dateObj = new Date(test.timestamp);
                            const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                            return (
                                <div key={test.id} className="bg-white border text-left border-slate-200 rounded-xl p-4 flex flex-col shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <span className="font-bold text-[var(--brand-purple)] bg-[var(--brand-purple)]/10 px-2 py-0.5 rounded-md">#{test.id}</span>
                                            <span>{timeStr}</span>
                                        </div>
                                        <div>
                                            {test.pramaan_grade ? (() => {
                                                const s = getGradeStyle(test.pramaan_grade);
                                                return (
                                                    <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${s.bg} ${s.text}`}>
                                                        {test.pramaan_grade}-{test.pramaan_score}
                                                    </span>
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
                                        <div className="font-bold text-slate-900 text-base leading-tight mb-1">{test.system_model}</div>
                                        <div className="text-xs text-slate-500">
                                            <span className="font-semibold text-slate-700">Serial No:</span> {test.system_serial}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-sm pt-3 border-t border-slate-100">
                                        <div className="text-slate-500 text-xs">{dateStr}</div>
                                        <Link href={`/dashboard/results/${test.id}`} className="text-[var(--brand-purple)] font-semibold text-xs tracking-wider uppercase hover:underline">
                                            View Details &gt;
                                        </Link>
                                    </div>
                                </div>
                            )
                        })}
                        {!loading && stats.recentTests.length === 0 && (
                            <div className="text-center text-slate-500 py-6">No test results found</div>
                        )}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm text-left">
                            <thead className="[&_tr]:border-b border-slate-200">
                                <tr className="border-b transition-colors hover:bg-slate-50/50 data-[state=selected]:bg-slate-50">
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500 whitespace-nowrap">Test ID</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500 whitespace-nowrap">Status</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500 max-w-[200px]">Model name</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500">Serial No.</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500 whitespace-nowrap">Date</th>
                                    <th className="h-12 px-4 align-middle font-medium text-slate-500 text-right whitespace-nowrap">Action</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500">Loading...</td>
                                    </tr>
                                ) : stats.recentTests.map((test) => {
                                    const dateObj = new Date(test.timestamp);
                                    const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                    const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                                    return (
                                        <tr key={test.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50">
                                            <td className="p-4 align-middle font-medium text-slate-900 whitespace-nowrap">#{test.id}</td>
                                            <td className="p-4 align-middle whitespace-nowrap">
                                                {test.pramaan_grade ? (() => {
                                                    const s = getGradeStyle(test.pramaan_grade);
                                                    return (
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[15px] font-bold ${gradeHeroColor(test.pramaan_grade)}`}>
                                                                {test.pramaan_grade}
                                                            </span>
                                                            <span className={`inline-flex items-center rounded-lg px-3 py-1 text-sm font-bold ${s.bg} ${s.text} border-2 border-[currentColor]/10`}>
                                                                {test.pramaan_score}
                                                            </span>
                                                        </div>
                                                    );
                                                })() : (
                                                    test.overall_pass ? (
                                                        <span className="font-medium text-emerald-600 flex items-center gap-1.5 whitespace-nowrap">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-600"></div> Pass
                                                        </span>
                                                    ) : (
                                                        <span className="font-medium text-rose-500 flex items-center gap-1.5 whitespace-nowrap">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-rose-500"></div> Fail
                                                        </span>
                                                    )
                                                )}
                                            </td>

                                            <td className="p-4 align-middle text-slate-900 min-w-[200px] max-w-[200px] leading-tight"><div className="truncate max-w-[200px]" title={test.system_model}>{test.system_model}</div></td>
                                            <td className="p-4 align-middle text-slate-500 min-w-[150px] break-all sm:break-normal">{test.system_serial}</td>
                                            <td className="p-4 align-middle text-slate-500 whitespace-nowrap">
                                                <div>{dateStr}</div>
                                                <div className="text-xs text-slate-400 mt-0.5">{timeStr}</div>
                                            </td>
                                            <td className="p-4 align-middle text-right whitespace-nowrap">
                                                <Link href={`/dashboard/results/${test.id}`}>
                                                    <Button variant="outline" size="sm" className="rounded-full px-6 border-slate-200 text-slate-700 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)]">
                                                        VIEW
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {!loading && stats.recentTests.length === 0 && (
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
