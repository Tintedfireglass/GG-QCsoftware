"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { getUsers, deleteUser } from "@/lib/api"
import { UserRole, UserRoleDisplayNames } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Users,
    UserPlus,
    Search,
    Shield,
    Edit2,
    Trash2,
    UserCheck,
    UserX,
    ChevronLeft,
    ChevronRight
} from "lucide-react"

interface UserData {
    id: number
    username: string
    email?: string
    display_name?: string
    role: UserRole
    created_by?: number
    creator_username?: string
    team_size?: number
    is_active: boolean
    created_at: string
}

export default function UsersPage() {
    const { user: authUser, isSuperAdmin, isEnterprise, isReseller, canManageUsers } = useAuth()
    const [users, setUsers] = useState<UserData[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [roleFilter, setRoleFilter] = useState<UserRole | "">("")
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0
    })
    const [error, setError] = useState<string | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

    async function loadUsers(page = 1) {
        setLoading(true)
        setError(null)
        try {
            const filters: { search?: string; role?: UserRole } = {}
            if (searchQuery) filters.search = searchQuery
            if (roleFilter) filters.role = roleFilter

            const data = await getUsers(page, pagination.limit, filters)
            setUsers(data.users)
            setPagination(data.pagination)
        } catch (err) {
            console.error("Failed to load users:", err)
            setError(err instanceof Error ? err.message : "Failed to load users")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (canManageUsers()) {
            loadUsers()
        }
    }, [])

    async function handleDelete(userId: number) {
        try {
            await deleteUser(userId)
            setDeleteConfirm(null)
            loadUsers(pagination.page)
        } catch (err) {
            console.error("Failed to delete user:", err)
            setError(err instanceof Error ? err.message : "Failed to delete user")
        }
    }

    function getRoleBadgeColor(role: UserRole) {
        switch (role) {
            case 'SuperAdmin':
                return 'bg-purple-100 text-purple-800'
            case 'Refurbisher':
                return 'bg-blue-100 text-blue-800'
            case 'Enterprise':
                return 'bg-amber-100 text-amber-800'
            case 'Reseller':
                return 'bg-indigo-100 text-indigo-800'
            case 'Technician':
                return 'bg-green-100 text-green-800'
            case 'Client':
                return 'bg-teal-100 text-teal-800'
            default:
                return 'bg-slate-100 text-slate-800'
        }
    }

    const getCreatableRoles = (): UserRole[] => {
        if (isSuperAdmin()) return ['Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'Client']
        if (isReseller()) return ['Technician', 'Client']
        if (isEnterprise()) return ['Technician']
        return ['Technician']
    }

    if (!canManageUsers()) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
                <p className="text-slate-600 mt-2">You don't have permission to manage users.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                    <p className="text-slate-500 mt-1">
                        {isSuperAdmin()
                            ? "Manage all admins, technicians, and clients"
                            : isReseller()
                                ? "Manage your team of technicians and clients"
                                : isEnterprise()
                                    ? "Manage your team of technicians"
                                    : "Manage your team of technicians"}
                    </p>
                </div>
                <Link href="/dashboard/users/new">
                    <Button className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Add User
                    </Button>
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-slate-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pagination.total}</div>
                        <p className="text-xs text-slate-500">
                            {isSuperAdmin() ? "All users in system" : "Users in your team"}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                        <UserCheck className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {users.filter(u => u.is_active).length}
                        </div>
                        <p className="text-xs text-slate-500">Currently active</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Inactive Users</CardTitle>
                        <UserX className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {users.filter(u => !u.is_active).length}
                        </div>
                        <p className="text-xs text-slate-500">Deactivated accounts</p>
                    </CardContent>
                </Card>
            </div>

            {/* Search and Filter */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                        <CardTitle>Users</CardTitle>
                        <div className="flex w-full md:w-auto items-center gap-2 ml-auto">
                            <Input
                                type="text"
                                placeholder="Search by name or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadUsers(1)}
                                className="w-full md:w-64"
                            />
                            <select
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value as UserRole | "")}
                                className="h-10 px-3 border border-slate-200 rounded-md text-sm"
                            >
                                <option value="">All Roles</option>
                                {isSuperAdmin() && <option value="SuperAdmin">Super Admin</option>}
                                <option value="Refurbisher">Refurbisher</option>
                                <option value="Reseller">Reseller</option>
                                <option value="Technician">Technician</option>
                                <option value="Enterprise">Enterprise</option>
                                <option value="Client">Client</option>
                            </select>
                            <Button size="icon" onClick={() => loadUsers(1)}>
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading users...</div>
                    ) : (
                        <>
                            <div className="relative w-full overflow-auto">
                                <table className="w-full caption-bottom text-sm text-left whitespace-nowrap">
                                    <thead className="[&_tr]:border-b">
                                        <tr className="border-b transition-colors">
                                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">User</th>
                                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Role</th>
                                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Created By</th>
                                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Team Size</th>
                                            <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="[&_tr:last-child]:border-0">
                                        {users.map((userItem) => (
                                            <tr key={userItem.id} className="border-b transition-colors hover:bg-muted/50">
                                                <td className="p-4 align-middle">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white ${userItem.role === 'SuperAdmin' ? 'bg-purple-500' :
                                                            userItem.role === 'Refurbisher' ? 'bg-blue-500' :
                                                                userItem.role === 'Reseller' ? 'bg-indigo-500' :
                                                                    userItem.role === 'Enterprise' ? 'bg-amber-500' :
                                                                        userItem.role === 'Client' ? 'bg-teal-500' : 'bg-green-500'
                                                            }`}>
                                                            {userItem.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium">{userItem.display_name || userItem.username}</p>
                                                            <p className="text-xs text-slate-500">{userItem.email || userItem.username}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 align-middle">
                                                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleBadgeColor(userItem.role)}`}>
                                                        <Shield className="h-3 w-3" />
                                                        {UserRoleDisplayNames[userItem.role]}
                                                    </span>
                                                </td>
                                                <td className="p-4 align-middle text-slate-500">
                                                    {userItem.creator_username || '-'}
                                                </td>
                                                <td className="p-4 align-middle">
                                                    {userItem.is_active ? (
                                                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                                            Active
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                                                            Inactive
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4 align-middle text-slate-500">
                                                    {(userItem.role === 'Refurbisher' || userItem.role === 'Enterprise' || userItem.role === 'Reseller') ? userItem.team_size || 0 : '-'}
                                                </td>
                                                <td className="p-4 align-middle text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Link href={`/dashboard/users/${userItem.id}`}>
                                                            <Button variant="ghost" size="sm">
                                                                <Edit2 className="h-4 w-4" />
                                                            </Button>
                                                        </Link>
                                                        {authUser?.id !== userItem.id && (
                                                            deleteConfirm === userItem.id ? (
                                                                <div className="flex items-center gap-1">
                                                                    <Button
                                                                        variant="destructive"
                                                                        size="sm"
                                                                        onClick={() => handleDelete(userItem.id)}
                                                                    >
                                                                        Confirm
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => setDeleteConfirm(null)}
                                                                    >
                                                                        Cancel
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setDeleteConfirm(userItem.id)}
                                                                >
                                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                                </Button>
                                                            )
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {users.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="p-4 text-center text-slate-500">
                                                    No users found
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {pagination.totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                    <p className="text-sm text-slate-500">
                                        Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                                        {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                                        {pagination.total} users
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={pagination.page === 1}
                                            onClick={() => loadUsers(pagination.page - 1)}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            Previous
                                        </Button>
                                        <span className="text-sm text-slate-600">
                                            Page {pagination.page} of {pagination.totalPages}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={pagination.page === pagination.totalPages}
                                            onClick={() => loadUsers(pagination.page + 1)}
                                        >
                                            Next
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
