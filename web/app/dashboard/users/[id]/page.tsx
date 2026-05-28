"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { getUser, updateUser, deleteUser } from "@/lib/api"
import { UserRole, UserRoleDisplayNames, UserRoleDescriptions, UserWithCreator } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    ArrowLeft,
    Edit2,
    Shield,
    AlertCircle,
    Trash2,
    UserCheck,
    UserX,
    Calendar,
    Users
} from "lucide-react"

export default function EditUserPage() {
    const router = useRouter()
    const params = useParams()
    const userId = parseInt(params.id as string)
    const { user: authUser, isSuperAdmin, isAdmin, isRefurbisher, isEnterprise, isReseller, canManageUsers } = useAuth()

    const [userData, setUserData] = useState<UserWithCreator | null>(null)
    const [formData, setFormData] = useState({
        display_name: "",
        email: "",
        role: "Technician" as UserRole,
        is_active: true,
        password: "",
        confirmPassword: "",
        license_credits: 0
    })
    const [durationPerms, setDurationPerms] = useState({
        allow_monthly_keys: false,
        allow_quarterly_keys: false,
        allow_6month_keys: false,
        allow_yearly_keys: false,
    })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState(false)

    useEffect(() => {
        loadUser()
    }, [userId])

    async function loadUser() {
        try {
            const data = await getUser(userId)
            setUserData(data.user)
            setFormData({
                display_name: data.user.display_name || "",
                email: data.user.email || "",
                role: data.user.role,
                is_active: data.user.is_active,
                password: "",
                confirmPassword: "",
                license_credits: data.user.license_credits || 0
            })
            setDurationPerms({
                allow_monthly_keys: data.user.allow_monthly_keys ?? false,
                allow_quarterly_keys: data.user.allow_quarterly_keys ?? false,
                allow_6month_keys: data.user.allow_6month_keys ?? false,
                allow_yearly_keys: data.user.allow_yearly_keys ?? false,
            })
        } catch (err) {
            console.error("Failed to load user:", err)
            setError(err instanceof Error ? err.message : "Failed to load user")
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        // Validate passwords if changing
        if (formData.password) {
            if (formData.password !== formData.confirmPassword) {
                setError("Passwords do not match")
                return
            }
            if (formData.password.length < 6) {
                setError("Password must be at least 6 characters")
                return
            }
        }
        if (!formData.email.trim()) {
            setError("Email is required")
            return
        }

        setSaving(true)

        try {
            const updateData: any = {
                display_name: formData.display_name || undefined,
                email: formData.email || undefined,
                is_active: formData.is_active
            }

            // Only SuperAdmin can change roles
            if (isSuperAdmin()) {
                if (formData.role !== userData?.role) {
                    updateData.role = formData.role
                }
            }
            // License credits: SuperAdmin can set for supported roles, Reseller can allocate to Client
            if (isSuperAdmin() || (isReseller() && userData?.role === 'Client')) {
                updateData.license_credits = formData.license_credits
            }

            // Duration permission flags — SuperAdmin only, for eligible roles
            if (isSuperAdmin() && userData?.role !== 'SuperAdmin' && userData?.role !== 'Employee') {
                updateData.allow_monthly_keys = durationPerms.allow_monthly_keys
                updateData.allow_quarterly_keys = durationPerms.allow_quarterly_keys
                updateData.allow_6month_keys = durationPerms.allow_6month_keys
                updateData.allow_yearly_keys = durationPerms.allow_yearly_keys
            }

            // Include password if provided
            if (formData.password) {
                updateData.password = formData.password
            }

            await updateUser(userId, updateData)
            setSuccess("User updated successfully")

            // Reload user data
            loadUser()

            // Clear password fields
            setFormData(prev => ({ ...prev, password: "", confirmPassword: "" }))
        } catch (err) {
            console.error("Failed to update user:", err)
            setError(err instanceof Error ? err.message : "Failed to update user")
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete() {
        try {
            await deleteUser(userId)
            router.push("/dashboard/users")
        } catch (err) {
            console.error("Failed to delete user:", err)
            setError(err instanceof Error ? err.message : "Failed to delete user")
        }
    }

    if (!canManageUsers()) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
                <p className="text-slate-600 mt-2">You don't have permission to edit users.</p>
            </div>
        )
    }

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading user...</div>
    }

    if (!userData) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold text-slate-800">User Not Found</h1>
                <p className="text-slate-600 mt-2">The user you're looking for doesn't exist.</p>
                <Link href="/dashboard/users">
                    <Button className="mt-4">Back to Users</Button>
                </Link>
            </div>
        )
    }

    const isOwnProfile = authUser?.id === userId
    const canChangeRole = isSuperAdmin() && !isOwnProfile
    const canDeactivate = !isOwnProfile
    const canEditCredits = isSuperAdmin() || (isReseller() && userData.role === 'Client')

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-4">
                <Link href="/dashboard/users">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                </Link>
                <div className="flex-1">
                    <h1 className="text-3xl font-bold tracking-tight">Edit User</h1>
                    <p className="text-slate-500 mt-1">
                        {isOwnProfile ? "Edit your profile" : `Editing ${userData.display_name || userData.username}`}
                    </p>
                </div>
            </div>

            {/* User Info Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${userData.role === 'SuperAdmin' ? 'bg-purple-500' :
                            userData.role === 'Employee' ? 'bg-rose-500' :
                                userData.role === 'Refurbisher' ? 'bg-blue-500' :
                                    userData.role === 'Reseller' ? 'bg-indigo-500' :
                                        userData.role === 'Enterprise' || userData.role === 'OEM' || userData.role === 'Insurer' ? 'bg-amber-500' :
                                            userData.role === 'Client' ? 'bg-teal-500' : 'bg-green-500'
                            }`}>
                            {userData.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <CardTitle>{userData.display_name || userData.username}</CardTitle>
                            <CardDescription className="flex items-center gap-4 mt-1">
                                <span className="flex items-center gap-1">
                                    <Shield className="h-3 w-3" />
                                    {UserRoleDisplayNames[userData.role]}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Joined {new Date(userData.created_at).toLocaleDateString()}
                                </span>
                                {(userData.role === 'Refurbisher' || userData.role === 'Enterprise' || userData.role === 'OEM' || userData.role === 'Insurer' || userData.role === 'Reseller') && (
                                    <span className="flex items-center gap-1">
                                        <Users className="h-3 w-3" />
                                        {userData.team_size || 0} team members
                                    </span>
                                )}
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Edit Form */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Edit2 className="h-5 w-5" />
                        User Details
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md flex items-center gap-2">
                            <UserCheck className="h-4 w-4" />
                            {success}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Username (read-only) */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Username
                            </label>
                            <Input
                                type="text"
                                value={userData.username}
                                disabled
                                className="bg-slate-50"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Username cannot be changed
                            </p>
                        </div>

                        {/* Display Name */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Display Name
                            </label>
                            <Input
                                type="text"
                                value={formData.display_name}
                                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                placeholder="Enter display name"
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Email <span className="text-rose-500">*</span>
                            </label>
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="Enter email"
                                required
                            />
                        </div>

                        {/* Role (SuperAdmin only) */}
                        {canChangeRole && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Role
                                </label>
                                <div className="space-y-2">
                                    {(['SuperAdmin', 'Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'OEM', 'Insurer', 'Client'] as UserRole[]).map((role) => (
                                        <label
                                            key={role}
                                            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${formData.role === role
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="role"
                                                value={role}
                                                checked={formData.role === role}
                                                onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                                                className="mt-1"
                                            />
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Shield className={`h-4 w-4 ${role === 'SuperAdmin' ? 'text-purple-500' :
                                                        role === 'Employee' ? 'text-rose-500' :
                                                            role === 'Refurbisher' ? 'text-blue-500' :
                                                                role === 'Reseller' ? 'text-indigo-500' :
                                                                    role === 'Enterprise' || role === 'OEM' || role === 'Insurer' ? 'text-amber-500' :
                                                                        role === 'Client' ? 'text-teal-500' : 'text-green-500'
                                                        }`} />
                                                    <span className="font-medium">{UserRoleDisplayNames[role]}</span>
                                                </div>
                                                <p className="text-sm text-slate-500 mt-0.5">
                                                    {UserRoleDescriptions[role]}
                                                </p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Status Toggle */}
                        {canDeactivate && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Account Status
                                </label>
                                <div className="flex items-center gap-4">
                                    <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer ${formData.is_active ? 'border-green-500 bg-green-50' : 'border-slate-200'
                                        }`}>
                                        <input
                                            type="radio"
                                            name="status"
                                            checked={formData.is_active}
                                            onChange={() => setFormData({ ...formData, is_active: true })}
                                        />
                                        <UserCheck className="h-4 w-4 text-green-500" />
                                        <span>Active</span>
                                    </label>
                                    <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer ${!formData.is_active ? 'border-red-500 bg-red-50' : 'border-slate-200'
                                        }`}>
                                        <input
                                            type="radio"
                                            name="status"
                                            checked={!formData.is_active}
                                            onChange={() => setFormData({ ...formData, is_active: false })}
                                        />
                                        <UserX className="h-4 w-4 text-red-500" />
                                        <span>Inactive</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* License Credits (SuperAdmin or Reseller-to-Client) */}
                        {canEditCredits && (formData.role === 'Refurbisher' || formData.role === 'Enterprise' || formData.role === 'OEM' || formData.role === 'Insurer' || formData.role === 'Reseller' || formData.role === 'Client') && (
                            <div className="pt-4 border-t">
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    License Credits
                                </label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={formData.license_credits}
                                    onChange={(e) => setFormData({ ...formData, license_credits: parseInt(e.target.value) || 0 })}
                                    placeholder="Enter number of credits"
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    Number of machine activations this user is allowed to generate.
                                </p>
                            </div>
                        )}

                        {/* Change Password */}
                        <div className="pt-4 border-t">
                            <h3 className="text-sm font-medium text-slate-700 mb-3">Change Password (optional)</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        New Password
                                    </label>
                                    <Input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="Enter new password"
                                        minLength={6}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Confirm Password
                                    </label>
                                    <Input
                                        type="password"
                                        value={formData.confirmPassword}
                                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        placeholder="Confirm new password"
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Leave blank to keep the current password
                            </p>
                        </div>

                        {/* Submit Button */}
                        <div className="flex items-center gap-3 pt-4 border-t">
                            <Button type="submit" disabled={saving}>
                                {saving ? "Saving..." : "Save Changes"}
                            </Button>
                            <Link href="/dashboard/users">
                                <Button type="button" variant="outline">
                                    Cancel
                                </Button>
                            </Link>
                        </div>
                    </form>

                    {/* Duration Permissions — SuperAdmin only, eligible roles only */}
                    {isSuperAdmin() && userData.role !== 'SuperAdmin' && userData.role !== 'Employee' && (
                        <div className="mt-6 pt-6 border-t">
                            <h3 className="text-sm font-semibold text-slate-700 mb-1">Temporary Key Permissions</h3>
                            <p className="text-xs text-slate-500 mb-4">
                                Choose which expiry durations this user can apply when generating license keys.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                {([
                                    { key: 'allow_monthly_keys' as const, label: 'Monthly', sub: '30-day keys' },
                                    { key: 'allow_quarterly_keys' as const, label: 'Quarterly', sub: '90-day keys' },
                                    { key: 'allow_6month_keys' as const, label: '6-Month', sub: '180-day keys' },
                                    { key: 'allow_yearly_keys' as const, label: 'Yearly', sub: '365-day keys' },
                                ]).map(({ key, label, sub }) => (
                                    <label
                                        key={key}
                                        className={`relative flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all select-none ${
                                            durationPerms[key]
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                            durationPerms[key] ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                                        }`}>
                                            {durationPerms[key] && (
                                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={durationPerms[key]}
                                            onChange={(e) => setDurationPerms(prev => ({ ...prev, [key]: e.target.checked }))}
                                        />
                                        <div>
                                            <div className="font-medium text-slate-900 text-sm">{label}</div>
                                            <div className="text-xs text-slate-500">{sub}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                            <div className="mt-4">
                                <Button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={saving}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {saving ? 'Saving...' : 'Save Permissions'}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Danger Zone */}
            {canDeactivate && (
                <Card className="border-red-200">
                    <CardHeader>
                        <CardTitle className="text-red-600 flex items-center gap-2">
                            <Trash2 className="h-5 w-5" />
                            Danger Zone
                        </CardTitle>
                        <CardDescription>
                            Deactivating a user will prevent them from logging in.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {deleteConfirm ? (
                            <div className="flex items-center gap-3">
                                <p className="text-sm text-slate-600">Are you sure you want to deactivate this user?</p>
                                <Button variant="destructive" onClick={handleDelete}>
                                    Yes, Deactivate
                                </Button>
                                <Button variant="outline" onClick={() => setDeleteConfirm(false)}>
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button variant="destructive" onClick={() => setDeleteConfirm(true)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Deactivate User
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
