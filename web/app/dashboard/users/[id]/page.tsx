"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { getUser, updateUser, deleteUser, getResellerBranding, saveResellerBranding, resetResellerBranding } from "@/lib/api"
import { ResellerBrandingFields, emptyBrandingDraft } from "@/components/reseller-branding-fields"
import { PartnerApiKeysPanel } from "@/components/partner/api-keys-panel"
import { PartnerWebhooksPanel } from "@/components/partner/webhooks-panel"
import { canOwnPartnerKey } from "@/lib/partner/scopes"
import { normalizeHexColor } from "@/lib/shared/branding-color"
import { normalizeAssignableDomain } from "@/lib/shared/branding-host"
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
import { formatDateDMY } from "@/lib/utils"

export default function EditUserPage() {
    const router = useRouter()
    const params = useParams()
    const userId = parseInt(params.id as string)
    const { user: authUser, isSuperAdmin, isEmployee, isAdmin, isRefurbisher, isEnterprise, isReseller, canManageUsers } = useAuth()

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
        allow_perpetual_keys: false,
    })
    const [platformPerms, setPlatformPerms] = useState({
        allow_windows_keys: false,
        allow_android_keys: false,
        allow_ios_keys: false,
        allow_mac_keys: false,
    })
    const [featurePerms, setFeaturePerms] = useState({
        allow_qr_label_download: true,
    })
    // Reseller branding — loaded and saved through its own endpoint, since the
    // logo and favicon are multipart uploads rather than user columns.
    const [brandingDraft, setBrandingDraft] = useState(emptyBrandingDraft())
    const [brandingStorageReady, setBrandingStorageReady] = useState(true)
    const [savingBranding, setSavingBranding] = useState(false)
    const [resettingBranding, setResettingBranding] = useState(false)
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
                allow_perpetual_keys: data.user.allow_perpetual_keys ?? false,
            })
            setPlatformPerms({
                allow_windows_keys: data.user.allow_windows_keys ?? false,
                allow_android_keys: data.user.allow_android_keys ?? false,
                allow_ios_keys: data.user.allow_ios_keys ?? false,
                allow_mac_keys: data.user.allow_mac_keys ?? false,
            })
            setFeaturePerms({
                allow_qr_label_download: data.user.allow_qr_label_download ?? true,
            })
            if (data.user.role === 'Reseller' && (isSuperAdmin() || isEmployee())) await loadBranding()
        } catch (err) {
            console.error("Failed to load user:", err)
            setError(err instanceof Error ? err.message : "Failed to load user")
        } finally {
            setLoading(false)
        }
    }

    async function loadBranding() {
        try {
            const data = await getResellerBranding(userId)
            setBrandingDraft({
                siteName: data.branding.siteName,
                domain: data.branding.domain,
                primaryColor: data.branding.primaryColor,
                logoFile: null,
                existingLogoUrl: data.branding.logoUrl,
                faviconFile: null,
                existingFaviconUrl: data.branding.faviconUrl,
            })
            setBrandingStorageReady(data.storageConfigured)
        } catch (err) {
            // Branding is secondary to the profile — surface it, but never block
            // the rest of the page from rendering.
            console.error("Failed to load branding:", err)
        }
    }

    async function handleSaveBranding() {
        const color = normalizeHexColor(brandingDraft.primaryColor)
        if (!color) {
            setError("Primary colour must be a hex value like #8B3D88")
            return
        }
        const domain = brandingDraft.domain.trim() ? normalizeAssignableDomain(brandingDraft.domain) : ""
        if (domain === null) {
            setError("Branding domain must look like qc.acme.com — no scheme, port or path")
            return
        }
        setError(null)
        setSuccess(null)
        setSavingBranding(true)
        try {
            const saved = await saveResellerBranding(userId, {
                siteName: brandingDraft.siteName.trim(),
                domain,
                primaryColor: color,
                logo: brandingDraft.logoFile,
                favicon: brandingDraft.faviconFile,
            })
            setBrandingDraft({ siteName: saved.siteName, domain: saved.domain, primaryColor: saved.primaryColor, logoFile: null, existingLogoUrl: saved.logoUrl, faviconFile: null, existingFaviconUrl: saved.faviconUrl })
            setSuccess("Branding updated successfully")
        } catch (err) {
            console.error("Failed to save branding:", err)
            setError(err instanceof Error ? err.message : "Failed to save branding")
        } finally {
            setSavingBranding(false)
        }
    }

    async function handleResetBranding() {
        setError(null)
        setSuccess(null)
        setResettingBranding(true)
        try {
            const saved = await resetResellerBranding(userId)
            setBrandingDraft({ siteName: saved.siteName, domain: saved.domain, primaryColor: saved.primaryColor, logoFile: null, existingLogoUrl: saved.logoUrl, faviconFile: null, existingFaviconUrl: saved.faviconUrl })
            setSuccess("Branding reset to the platform default")
        } catch (err) {
            console.error("Failed to reset branding:", err)
            setError(err instanceof Error ? err.message : "Failed to reset branding")
        } finally {
            setResettingBranding(false)
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
                updateData.allow_perpetual_keys = durationPerms.allow_perpetual_keys
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

    async function handleSavePermissions() {
        setError(null)
        setSuccess(null)
        setSaving(true)
        try {
            await updateUser(userId, {
                allow_monthly_keys: durationPerms.allow_monthly_keys,
                allow_quarterly_keys: durationPerms.allow_quarterly_keys,
                allow_6month_keys: durationPerms.allow_6month_keys,
                allow_yearly_keys: durationPerms.allow_yearly_keys,
                allow_perpetual_keys: durationPerms.allow_perpetual_keys,
            })
            setSuccess("Permissions updated successfully")
            loadUser()
        } catch (err) {
            console.error("Failed to update permissions:", err)
            setError(err instanceof Error ? err.message : "Failed to update permissions")
        } finally {
            setSaving(false)
        }
    }

    async function handleSavePlatformPermissions() {
        setError(null)
        setSuccess(null)
        setSaving(true)
        try {
            await updateUser(userId, {
                allow_windows_keys: platformPerms.allow_windows_keys,
                allow_android_keys: platformPerms.allow_android_keys,
                allow_ios_keys: platformPerms.allow_ios_keys,
                allow_mac_keys: platformPerms.allow_mac_keys,
            })
            setSuccess("Platform permissions updated successfully")
            loadUser()
        } catch (err) {
            console.error("Failed to update platform permissions:", err)
            setError(err instanceof Error ? err.message : "Failed to update platform permissions")
        } finally {
            setSaving(false)
        }
    }

    async function handleSaveFeaturePermissions() {
        setError(null)
        setSuccess(null)
        setSaving(true)
        try {
            await updateUser(userId, {
                allow_qr_label_download: featurePerms.allow_qr_label_download,
            })
            setSuccess("Feature permissions updated successfully")
            loadUser()
        } catch (err) {
            console.error("Failed to update feature permissions:", err)
            setError(err instanceof Error ? err.message : "Failed to update feature permissions")
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
                                    Joined {formatDateDMY(userData.created_at)}
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

                    {/* Reseller Branding — logo + primary colour for this tenant */}
                    {/* Only the roles that canManageUser() lets edit a Reseller —
                        otherwise a reseller viewing its own profile would be shown
                        a branding form that 403s on save. */}
                    {userData.role === 'Reseller' && (isSuperAdmin() || isEmployee()) && (
                        <div className="mt-6">
                            <ResellerBrandingFields
                                value={brandingDraft}
                                onChange={setBrandingDraft}
                                storageConfigured={brandingStorageReady}
                                onReset={handleResetBranding}
                                resetting={resettingBranding}
                                disabled={savingBranding}
                            />
                            <div className="mt-4">
                                <Button
                                    type="button"
                                    onClick={handleSaveBranding}
                                    disabled={savingBranding || resettingBranding}
                                    className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white"
                                >
                                    {savingBranding ? 'Saving...' : 'Save Branding'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Duration Permissions — SuperAdmin only, eligible roles only */}
                    {isSuperAdmin() && userData.role !== 'SuperAdmin' && userData.role !== 'Employee' && (
                        <div className="mt-6 pt-6 border-t">
                            <h3 className="text-sm font-semibold text-slate-700 mb-1">Key Permissions</h3>
                            <p className="text-xs text-slate-500 mb-4">
                                Choose which expiry durations this user can apply when generating license keys. If all are unchecked, they will not be able to generate keys.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                {([
                                    { key: 'allow_monthly_keys' as const, label: 'Monthly', sub: '30-day keys' },
                                    { key: 'allow_quarterly_keys' as const, label: 'Quarterly', sub: '90-day keys' },
                                    { key: 'allow_6month_keys' as const, label: '6-Month', sub: '180-day keys' },
                                    { key: 'allow_yearly_keys' as const, label: 'Yearly', sub: '365-day keys' },
                                    { key: 'allow_perpetual_keys' as const, label: 'Perpetual', sub: 'Forever keys' },
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
                                    onClick={handleSavePermissions}
                                    disabled={saving}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {saving ? 'Saving...' : 'Save Permissions'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* License Platform Permissions — SuperAdmin only, Employees only */}
                    {isSuperAdmin() && userData.role === 'Employee' && (
                        <div className="mt-6 pt-6 border-t">
                            <h3 className="text-sm font-semibold text-slate-700 mb-1">License Platform Permissions</h3>
                            <p className="text-xs text-slate-500 mb-4">
                                Choose which platforms this employee can generate license keys for. If all are unchecked, they can only generate demo keys.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                {([
                                    { key: 'allow_windows_keys' as const, label: 'Windows (PC)', sub: 'Windows license keys' },
                                    { key: 'allow_android_keys' as const, label: 'Android', sub: 'Android license keys' },
                                    { key: 'allow_ios_keys' as const, label: 'iPhone (iOS)', sub: 'iOS license keys' },
                                    { key: 'allow_mac_keys' as const, label: 'Mac', sub: 'Mac license keys' },
                                ]).map(({ key, label, sub }) => (
                                    <label
                                        key={key}
                                        className={`relative flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all select-none ${
                                            platformPerms[key]
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                            platformPerms[key] ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                                        }`}>
                                            {platformPerms[key] && (
                                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={platformPerms[key]}
                                            onChange={(e) => setPlatformPerms(prev => ({ ...prev, [key]: e.target.checked }))}
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
                                    onClick={handleSavePlatformPermissions}
                                    disabled={saving}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {saving ? 'Saving...' : 'Save Platform Permissions'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Feature Permissions — SuperAdmin or admin-tier for their own team members */}
                    {(isSuperAdmin() || (canManageUsers() && !isEmployee())) && userData.role !== 'SuperAdmin' && userData.role !== 'Employee' && (
                        <div className="mt-6 pt-6 border-t">
                            <h3 className="text-sm font-semibold text-slate-700 mb-1">Feature Permissions</h3>
                            <p className="text-xs text-slate-500 mb-4">
                                Control which features this user can access. Changes take effect on their next page load.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                {([
                                    { key: 'allow_qr_label_download' as const, label: 'Download QR Label', sub: 'Export QR sticker labels for devices' },
                                ]).map(({ key, label, sub }) => (
                                    <label
                                        key={key}
                                        className={`relative flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all select-none ${
                                            featurePerms[key]
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                            featurePerms[key] ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                                        }`}>
                                            {featurePerms[key] && (
                                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={featurePerms[key]}
                                            onChange={(e) => setFeaturePerms(prev => ({ ...prev, [key]: e.target.checked }))}
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
                                    onClick={handleSaveFeaturePermissions}
                                    disabled={saving}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {saving ? 'Saving...' : 'Save Feature Permissions'}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* API Access — partner keys, for roles that can integrate their own backend */}
            {isSuperAdmin() && userData && canOwnPartnerKey(userData.role) && (
                <>
                    <PartnerApiKeysPanel userId={userId} />
                    <PartnerWebhooksPanel userId={userId} />
                </>
            )}

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
