"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { getMachines, getQCResults, getUsers } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Activity,
    CheckCircle,
    XCircle,
    Monitor,
    Search,
    Users,
    Shield,
    UserCheck,
    TrendingUp
} from "lucide-react"
import { UserRoleDisplayNames } from "@/lib/types"

export default function DashboardPage() {
    const { user, isSuperAdmin, isAdmin, isUser, getRoleDisplayName } = useAuth()
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

            // Calculate pass rate from recent tests
            const passedTests = resultsData.results.filter((t: any) => t.overall_pass).length
            const passRate = resultsData.results.length > 0
                ? Math.round((passedTests / resultsData.results.length) * 100)
                : 0

            let userStats = { totalUsers: 0, totalAdmins: 0, totalTechnicians: 0 }

            // Load user stats for admins
            if (isSuperAdmin() || isAdmin()) {
                try {
                    const usersData = await getUsers(1, 100)
                    userStats.totalUsers = usersData.pagination.total
                    userStats.totalAdmins = usersData.users.filter((u: any) => u.role === 'Admin').length
                    userStats.totalTechnicians = usersData.users.filter((u: any) => u.role === 'User').length
                } catch (err) {
                    console.error("Failed to load user stats", err)
                }
            }

            setStats({
                totalTests: total,
                passRate,
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
                    <h1 className="text-3xl font-bold tracking-tight">
                        Welcome back, {user?.display_name || user?.username}
                    </h1>
                    <p className="text-slate-500">
                        <span className="inline-flex items-center gap-1">
                            <Shield className="h-4 w-4" />
                            {getRoleDisplayName()}
                        </span>
                        {' • '}
                        {isSuperAdmin() && "Full system access"}
                        {isAdmin() && "Team management access"}
                        {isUser() && "QC Technician access"}
                    </p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {isUser() ? "My QC Tests" : "Total QC Tests"}
                        </CardTitle>
                        <Activity className="h-4 w-4 text-slate-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalTests}</div>
                        <p className="text-xs text-slate-500">
                            {isUser() ? "Your tests" : "All time records"}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.passRate}%</div>
                        <p className="text-xs text-slate-500">From recent tests</p>
                    </CardContent>
                </Card>

                {/* Show different stats based on role */}
                {(isSuperAdmin() || isAdmin()) && (
                    <>
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
                                <CardTitle className="text-sm font-medium">
                                    {isSuperAdmin() ? "Total Users" : "Team Members"}
                                </CardTitle>
                                <Users className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.totalUsers}</div>
                                <p className="text-xs text-slate-500">
                                    {isSuperAdmin()
                                        ? `${stats.totalAdmins} admins, ${stats.totalTechnicians} technicians`
                                        : "Technicians in your team"
                                    }
                                </p>
                            </CardContent>
                        </Card>
                    </>
                )}

                {isUser() && (
                    <>
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

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Status</CardTitle>
                                <UserCheck className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">Active</div>
                                <p className="text-xs text-slate-500">Your account status</p>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* Quick Actions for Admins */}
            {(isSuperAdmin() || isAdmin()) && (
                <div className="grid gap-4 md:grid-cols-3">
                    <Link href="/dashboard/users/new">
                        <Card className="cursor-pointer hover:border-blue-300 transition-colors">
                            <CardContent className="flex items-center gap-4 p-6">
                                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                                    <Users className="h-6 w-6 text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold">Add User</h3>
                                    <p className="text-sm text-slate-500">
                                        {isSuperAdmin() ? "Create admin or technician" : "Add new technician"}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/dashboard/results">
                        <Card className="cursor-pointer hover:border-green-300 transition-colors">
                            <CardContent className="flex items-center gap-4 p-6">
                                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                                    <Activity className="h-6 w-6 text-green-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold">View Results</h3>
                                    <p className="text-sm text-slate-500">Browse all QC test results</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/dashboard/machines">
                        <Card className="cursor-pointer hover:border-purple-300 transition-colors">
                            <CardContent className="flex items-center gap-4 p-6">
                                <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                                    <Monitor className="h-6 w-6 text-purple-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold">Manage Machines</h3>
                                    <p className="text-sm text-slate-500">View registered stations</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            )}

            {/* Recent Results Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>
                            {isUser() ? "My Recent QC Results" : "Recent QC Results"}
                        </CardTitle>
                        <div className="flex w-full max-w-sm items-center space-x-2">
                            <Input
                                type="text"
                                placeholder="Search Test ID, Serial..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadData(searchQuery)}
                            />
                            <Button size="icon" onClick={() => loadData(searchQuery)}>
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm text-left">
                            <thead className="[&_tr]:border-b">
                                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Test ID</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>

                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Model</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Serial</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Date</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Action</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {stats.recentTests.map((test) => (
                                    <tr key={test.id} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle font-medium text-slate-500">#{test.id}</td>
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

                                        <td className="p-4 align-middle">{test.system_model}</td>
                                        <td className="p-4 align-middle">{test.system_serial}</td>
                                        <td className="p-4 align-middle text-slate-500">
                                            {new Date(test.timestamp).toLocaleDateString()} {new Date(test.timestamp).toLocaleTimeString()}
                                        </td>
                                        <td className="p-4 align-middle">
                                            <Link href={`/dashboard/results/${test.id}`}>
                                                <Button variant="ghost" size="sm">View</Button>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {stats.recentTests.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-4 text-center text-slate-500">No test results found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {stats.recentTests.length > 0 && (
                        <div className="mt-4 text-center">
                            <Link href="/dashboard/results">
                                <Button variant="outline">View All Results</Button>
                            </Link>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

