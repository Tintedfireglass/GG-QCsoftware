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
    KeyRound
} from "lucide-react"
import { Pagination } from "@/components/ui/pagination"

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
    license_credits?: number | null
    created_at: string
}

export default function UsersPage() {
    const { user: authUser, isSuperAdmin, isEnterprise, isOEM, isInsurer, isReseller, canManageUsers } = useAuth()
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
            case 'Employee':
                return 'bg-rose-100 text-rose-800'
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
        if (isSuperAdmin()) return ['Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'OEM', 'Insurer', 'Client']
        if (isReseller()) return ['Technician', 'Client']
        if (isEnterprise() || isOEM() || isInsurer()) return ['Technician']
        return ['Technician']
    }

    if (!canManageUsers()) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
                <p className="text-slate-600 mt-2">You don&apos;t have permission to manage users.</p>
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
                                : isEnterprise() || isOEM() || isInsurer()
                                    ? "Manage your team of technicians"
                                    : "Manage your team of technicians"}
                    </p>
                </div>
                <Link href="/dashboard/users/new">
                    <Button className="flex items-center gap-2 bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white">
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
                                {isSuperAdmin() && <option value="Employee">Employee</option>}
                                <option value="Refurbisher">Refurbisher</option>
                                <option value="Reseller">Reseller</option>
                                <option value="Technician">Technician</option>
                                <option value="Enterprise">Enterprise</option>
                                <option value="OEM">OEM</option>
                                <option value="Insurer">Insurer</option>
                                <option value="Client">Client</option>
                            </select>
                            <Button size="icon" onClick={() => loadUsers(1)} className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white">
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
                            {/* Mobile Card View */}
                            <div className="md:hidden flex flex-col gap-4">
                                {users.map((userItem) => (
                                    <div key={userItem.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col shadow-sm">
                                        <div className="flex items-start justify-between mb-3 relative">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white ${userItem.role === 'SuperAdmin' ? 'bg-purple-500' :
                                                    userItem.role === 'Employee' ? 'bg-rose-500' :
                                                        userItem.role === 'Refurbisher' ? 'bg-blue-500' :
                                                            userItem.role === 'Reseller' ? 'bg-indigo-500' :
                                                                userItem.role === 'Enterprise' || userItem.role === 'OEM' || userItem.role === 'Insurer' ? 'bg-amber-500' :
                                                                    userItem.role === 'Client' ? 'bg-teal-500' : 'bg-green-500'
                                                    }`}>
                                                    {userItem.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="max-w-[150px] sm:max-w-xs overflow-hidden">
                                                    <div className="font-bold text-slate-900 truncate">{userItem.display_name || userItem.username}</div>
                                                    <div className="text-xs text-slate-500 truncate">{userItem.email || userItem.username}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Link href={`/dashboard/users/${userItem.id}`}>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-[var(--brand-purple)]">
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                {authUser?.id !== userItem.id && (
                                                    deleteConfirm === userItem.id ? (
                                                        <div className="flex flex-col gap-1 items-end absolute right-0 top-10 bg-white border border-slate-200 p-2 rounded-lg shadow-lg z-10">
                                                            <Button onClick={() => handleDelete(userItem.id)} variant="destructive" size="sm" className="w-full">Confirm Action</Button>
                                                            <Button onClick={() => setDeleteConfirm(null)} variant="outline" size="sm" className="w-full">Cancel</Button>
                                                        </div>
                                                    ) : (
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-red-600" onClick={() => setDeleteConfirm(userItem.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t border-slate-100">
                                            <div>
                                                <div className="text-xs text-slate-400 mb-1">Status</div>
                                                {userItem.is_active ? (
                                                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                                                        Inactive
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400 mb-1">Role</div>
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleBadgeColor(userItem.role)}`}>
                                                    <Shield className="h-3 w-3 shrink-0" />
                                                    <span className="truncate max-w-[80px] sm:max-w-none">{UserRoleDisplayNames[userItem.role]}</span>
                                                </span>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400 mb-1">Team Size</div>
                                                <div className="font-medium text-slate-700">{(userItem.role === 'Refurbisher' || userItem.role === 'Enterprise' || userItem.role === 'OEM' || userItem.role === 'Insurer' || userItem.role === 'Reseller') ? userItem.team_size || 0 : '-'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400 mb-1">Created By</div>
                                                <div className="font-medium text-slate-700 truncate">{userItem.creator_username || '-'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400 mb-1">License Credits</div>
                                                {userItem.license_credits != null && userItem.license_credits > 0 ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                                                        <KeyRound className="h-3 w-3" />
                                                        {userItem.license_credits}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 text-xs">—</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {users.length === 0 && (
                                    <div className="p-8 text-center text-slate-500">No users found</div>
                                )}
                            </div>

                            {/* Desktop Table View */}
                            <div className="hidden md:block relative w-full overflow-auto">
                                <table className="w-full caption-bottom text-sm text-left">
                                    <thead className="[&_tr]:border-b border-slate-200">
                                        <tr className="border-b transition-colors hover:bg-slate-50/50">
                                            <th className="h-12 px-4 align-middle font-medium text-slate-500">User</th>
                                            <th className="h-12 px-4 align-middle font-medium text-slate-500 whitespace-nowrap">Role</th>
                                            <th className="h-12 px-4 align-middle font-medium text-slate-500 whitespace-nowrap">Created By</th>
                                            <th className="h-12 px-4 align-middle font-medium text-slate-500 whitespace-nowrap">Status</th>
                                            <th className="h-12 px-4 align-middle font-medium text-slate-500 whitespace-nowrap">Team Size</th>
                                            <th className="h-12 px-4 align-middle font-medium text-slate-500 whitespace-nowrap">License Credits</th>
                                            <th className="h-12 px-4 align-middle font-medium text-slate-500 text-right whitespace-nowrap">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="[&_tr:last-child]:border-0">
                                        {users.map((userItem) => (
                                            <tr key={userItem.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50">
                                                <td className="p-4 align-middle leading-tight min-w-[200px]">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white ${userItem.role === 'SuperAdmin' ? 'bg-purple-500' :
                                                            userItem.role === 'Employee' ? 'bg-rose-500' :
                                                                userItem.role === 'Refurbisher' ? 'bg-blue-500' :
                                                                    userItem.role === 'Reseller' ? 'bg-indigo-500' :
                                                                        userItem.role === 'Enterprise' || userItem.role === 'OEM' || userItem.role === 'Insurer' ? 'bg-amber-500' :
                                                                            userItem.role === 'Client' ? 'bg-teal-500' : 'bg-green-500'
                                                            }`}>
                                                            {userItem.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="break-all sm:break-normal">
                                                            <p className="font-medium">{userItem.display_name || userItem.username}</p>
                                                            <p className="text-xs text-slate-500">{userItem.email || userItem.username}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 align-middle whitespace-nowrap">
                                                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleBadgeColor(userItem.role)}`}>
                                                        <Shield className="h-3 w-3" />
                                                        {UserRoleDisplayNames[userItem.role]}
                                                    </span>
                                                </td>
                                                <td className="p-4 align-middle text-slate-500 whitespace-nowrap">
                                                    {userItem.creator_username || '-'}
                                                </td>
                                                <td className="p-4 align-middle whitespace-nowrap">
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
                                                <td className="p-4 align-middle text-slate-500 whitespace-nowrap">
                                                    {(userItem.role === 'Refurbisher' || userItem.role === 'Enterprise' || userItem.role === 'OEM' || userItem.role === 'Insurer' || userItem.role === 'Reseller') ? userItem.team_size || 0 : '-'}
                                                </td>
                                                <td className="p-4 align-middle whitespace-nowrap">
                                                    {userItem.license_credits != null && userItem.license_credits > 0 ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                                                            <KeyRound className="h-3 w-3" />
                                                            {userItem.license_credits}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="p-4 align-middle text-right whitespace-nowrap">
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
                                                <td colSpan={7} className="p-4 text-center text-slate-500">
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
                                    <Pagination
                                        page={pagination.page}
                                        totalPages={pagination.totalPages}
                                        onPageChange={loadUsers}
                                        disabled={loading}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
