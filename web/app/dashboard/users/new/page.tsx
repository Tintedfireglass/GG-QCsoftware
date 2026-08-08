"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { createUser, saveResellerBranding } from "@/lib/api"
import { ResellerBrandingFields, emptyBrandingDraft } from "@/components/reseller-branding-fields"
import { DEFAULT_PRIMARY_COLOR, normalizeHexColor } from "@/lib/shared/branding-color"
import { normalizeAssignableDomain } from "@/lib/shared/branding-host"
import { UserRole, UserRoleDisplayNames, UserRoleDescriptions } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    ArrowLeft,
    UserPlus,
    Shield,
    AlertCircle,
    Check
} from "lucide-react"

export default function NewUserPage() {
    const router = useRouter()
    const { isSuperAdmin, isEmployee, isEnterprise, isOEM, isInsurer, isRefurbisher, isReseller, canManageUsers } = useAuth()

    const [formData, setFormData] = useState({
        username: "",
        password: "",
        email: "",
        company_name: "",
        display_name: "",
        role: "Technician" as UserRole
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
    const [branding, setBranding] = useState(emptyBrandingDraft())
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Get roles that current user can create
    const creatableRoles: UserRole[] = isSuperAdmin()
        ? ['Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'OEM', 'Insurer', 'Client']
        : isEmployee()
            ? ['Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'OEM', 'Insurer', 'Client']
            : isReseller()
                ? ['Technician', 'Client']
                : isEnterprise() || isOEM() || isInsurer()
                    ? ['Technician']
                    : isRefurbisher()
                        ? ['Technician']
                        : []

    // Custom role mapping for the UI
    const customRoleDisplay: Record<UserRole, { title: string, description: string }> = {
        SuperAdmin: { title: "Super Admin", description: "Full system access" },
        Employee: { title: "Employee", description: "Sales/demo user who can generate demo keys only" },
        Refurbisher: { title: "Refurbisher", description: "Bulk reseller, manages technician team and grading" },
        Reseller: { title: "Reseller", description: "Enterprise features with client management" },
        Technician: { title: "Technician", description: "QC Technician, performs certifications on laptops" },
        Enterprise: { title: "Enterprise", description: "IT fleet manager, tracks company machines over time" },
        OEM: { title: "OEM", description: "OEM partner with fleet management access" },
        Insurer: { title: "Insurer", description: "Insurance partner with fleet management access" },
        Client: { title: "Client", description: "Reseller client with limited access" },
        B2CDevice: { title: "B2C Device", description: "Consumer devices initiated via B2C plans" }
    }

    const DURATION_OPTIONS = [
        { key: 'allow_monthly_keys' as const, label: 'Monthly', sub: 'Keys expire in exactly 30 days' },
        { key: 'allow_quarterly_keys' as const, label: 'Quarterly', sub: 'Keys expire in exactly 90 days' },
        { key: 'allow_6month_keys' as const, label: '6-Month', sub: 'Keys expire in exactly 180 days' },
        { key: 'allow_yearly_keys' as const, label: 'Yearly', sub: 'Keys expire in exactly 365 days' },
        { key: 'allow_perpetual_keys' as const, label: 'Perpetual', sub: 'Keys never expire (Forever keys)' },
    ]

    const showDurationSection = isSuperAdmin() && formData.role !== 'SuperAdmin' && formData.role !== 'Employee'
    // Branding is a Reseller-only concept: it themes the panel for the reseller
    // and the accounts beneath it. Only whoever can create the reseller sets it.
    const showBrandingSection = formData.role === 'Reseller'
    // Per-platform license permissions are assignable by SuperAdmin when creating an Employee.
    const showPlatformSection = isSuperAdmin() && formData.role === 'Employee'

    const PLATFORM_OPTIONS = [
        { key: 'allow_windows_keys' as const, label: 'Windows (PC)', sub: 'Generate Windows license keys' },
        { key: 'allow_android_keys' as const, label: 'Android', sub: 'Generate Android license keys' },
        { key: 'allow_ios_keys' as const, label: 'iPhone (iOS)', sub: 'Generate iOS license keys' },
        { key: 'allow_mac_keys' as const, label: 'Mac', sub: 'Generate Mac license keys' },
    ]

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (formData.password.length < 6) {
            setError("Password must be at least 6 characters")
            return
        }

        if (!creatableRoles.includes(formData.role)) {
            setError("You cannot create users with this role")
            return
        }

        if (!formData.email.trim()) {
            setError("Email is required")
            return
        }

        if ((formData.role === "Enterprise" || formData.role === "OEM" || formData.role === "Insurer" || formData.role === "Refurbisher" || formData.role === "Reseller") && !formData.company_name.trim()) {
            setError("Company name is required for Enterprise, OEM, Insurer, Refurbisher, and Reseller users")
            return
        }

        const brandingColor = normalizeHexColor(branding.primaryColor)
        if (showBrandingSection && !brandingColor) {
            setError("Primary colour must be a hex value like #8B3D88")
            return
        }
        const brandingDomain = branding.domain.trim()
            ? normalizeAssignableDomain(branding.domain)
            : ""
        if (showBrandingSection && brandingDomain === null) {
            setError("Branding domain must look like qc.acme.com — no scheme, port or path")
            return
        }

        setLoading(true)

        try {
            const created = await createUser({
                username: formData.username,
                password: formData.password,
                email: formData.email || undefined,
                company_name: formData.company_name.trim() || undefined,
                display_name: formData.display_name || undefined,
                role: formData.role,
                // Duration permission flags — only sent when role is eligible
                ...(showDurationSection ? durationPerms : {}),
                // Per-platform license permissions — only sent when creating an Employee
                ...(showPlatformSection ? platformPerms : {})
            })

            // Branding is a second call: it needs the new reseller's id, and the
            // logo travels as multipart. Only sent when something was chosen.
            const hasBranding = showBrandingSection
                && (Boolean(branding.logoFile) || Boolean(branding.faviconFile) || Boolean(brandingDomain)
                    || brandingColor !== DEFAULT_PRIMARY_COLOR.toLowerCase())
            if (hasBranding) {
                const newUserId = created?.user?.id as number | undefined
                if (newUserId == null) throw new Error("User was created but its id was not returned — set branding from the user's page")
                try {
                    await saveResellerBranding(newUserId, {
                        domain: brandingDomain,
                        primaryColor: brandingColor,
                        logo: branding.logoFile,
                        favicon: branding.faviconFile,
                    })
                } catch (err) {
                    // The account exists; only the branding failed. Say so rather
                    // than implying the whole create was rolled back.
                    setError(
                        `User created, but branding could not be saved: ${err instanceof Error ? err.message : "unknown error"}. Open the user to try again.`
                    )
                    setLoading(false)
                    return
                }
            }

            router.push("/dashboard/users")
        } catch (err) {
            console.error("Failed to create user:", err)
            setError(err instanceof Error ? err.message : "Failed to create user")
        } finally {
            setLoading(false)
        }
    }

    if (!canManageUsers()) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
                <p className="text-slate-600 mt-2">You don't have permission to create users.</p>
            </div>
        )
    }

    return (
        <div className="space-y-8 max-w-[800px]">
            <div className="flex items-center gap-4">
                <Link href="/dashboard/users">
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-500 hover:text-slate-900 rounded-full bg-white shadow-sm border border-slate-200">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-8 pb-6 border-b border-slate-100">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create New User</h1>
                    <p className="text-slate-500 mt-1">
                        Please fill your information below
                    </p>
                </div>

                <div className="p-8">
                    {error && (
                        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* 2-Column Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Username Row */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Enter Username <span className="text-rose-500">*</span>
                                </label>
                                <Input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    placeholder="aman123"
                                    required
                                    className="h-12 bg-slate-50/50 border-slate-200 focus-visible:ring-[var(--brand-purple)] focus-visible:bg-white"
                                />
                            </div>

                            {/* Display Name Row */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Display name
                                </label>
                                <Input
                                    type="text"
                                    value={formData.display_name}
                                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                    placeholder="Aman Gupta"
                                    className="h-12 bg-slate-50/50 border-slate-200 focus-visible:ring-[var(--brand-purple)] focus-visible:bg-white"
                                />
                            </div>

                            {/* Email Row */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Email <span className="text-rose-500">*</span>
                                </label>
                                <Input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="aman@example.com"
                                    required
                                    className="h-12 bg-slate-50/50 border-slate-200 focus-visible:ring-[var(--brand-purple)] focus-visible:bg-white"
                                />
                            </div>
                            <div className="hidden md:block"></div> {/* Empty spacer */}

                            {/* Company Name Row */}
                            {(formData.role === "Enterprise" || formData.role === "OEM" || formData.role === "Insurer" || formData.role === "Refurbisher" || formData.role === "Reseller" || formData.role === "Technician" || formData.role === "Client") && (
                                <>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                                            Company name {(formData.role === "Enterprise" || formData.role === "OEM" || formData.role === "Insurer" || formData.role === "Refurbisher" || formData.role === "Reseller") && <span className="text-rose-500">*</span>}
                                        </label>
                                        <Input
                                            type="text"
                                            value={formData.company_name}
                                            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                                            placeholder="Gadget Guruz"
                                            className="h-12 bg-slate-50/50 border-slate-200 focus-visible:ring-[var(--brand-purple)] focus-visible:bg-white"
                                        />
                                    </div>
                                    <div className="hidden md:block"></div> {/* Empty spacer */}
                                </>
                            )}

                            {/* Password Row */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Password <span className="text-rose-500">*</span>
                                </label>
                                <Input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                    className="h-12 bg-slate-50/50 border-slate-200 focus-visible:ring-[var(--brand-purple)] focus-visible:bg-white"
                                />
                            </div>
                            <div className="hidden md:block"></div> {/* Empty spacer */}
                        </div>

                        {/* Role Selection */}
                        <div className="pt-4 border-t border-slate-100">
                            <label className="block text-sm font-semibold text-slate-700 mb-4">
                                Role <span className="text-rose-500">*</span>
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {creatableRoles.map((role) => (
                                    <label
                                        key={role}
                                        className={`relative flex flex-col p-6 rounded-xl border-2 cursor-pointer transition-all ${formData.role === role
                                            ? 'border-[var(--brand-purple)] bg-[var(--brand-purple)]/5'
                                            : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="role"
                                            value={role}
                                            checked={formData.role === role}
                                            onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                                            className="sr-only"
                                        />

                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-bold text-slate-900 text-lg">
                                                {customRoleDisplay[role]?.title || UserRoleDisplayNames[role]}
                                            </span>
                                            {formData.role === role && (
                                                <div className="h-6 w-6 rounded-full bg-[var(--brand-purple)] flex items-center justify-center">
                                                    <Check className="h-3.5 w-3.5 text-white" />
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-500 mt-2">
                                            {customRoleDisplay[role]?.description || UserRoleDescriptions[role]}
                                        </p>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {showBrandingSection && (
                            <ResellerBrandingFields
                                value={branding}
                                onChange={setBranding}
                                disabled={loading}
                            />
                        )}

                        {showDurationSection && (
                            <div className="pt-6 border-t border-slate-100">
                                <div className="mb-4">
                                    <label className="block text-sm font-semibold text-slate-700">
                                        Key Permissions
                                    </label>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Choose which expiry durations this user can apply when generating license keys. If all are unchecked, they will not be able to generate keys.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {DURATION_OPTIONS.map(({ key, label, sub }) => (
                                        <label
                                            key={key}
                                            className={`relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all select-none ${
                                                durationPerms[key]
                                                    ? 'border-[var(--brand-purple)] bg-[var(--brand-purple)]/5'
                                                    : 'border-slate-100 bg-white hover:border-slate-200'
                                            }`}
                                        >
                                            <div className="mt-0.5">
                                                <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                    durationPerms[key]
                                                        ? 'border-[var(--brand-purple)] bg-[var(--brand-purple)]'
                                                        : 'border-slate-300 bg-white'
                                                }`}>
                                                    {durationPerms[key] && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={durationPerms[key]}
                                                onChange={(e) => setDurationPerms(prev => ({ ...prev, [key]: e.target.checked }))}
                                            />
                                            <div>
                                                <div className="font-semibold text-slate-900 text-sm">{label}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {showPlatformSection && (
                            <div className="pt-6 border-t border-slate-100">
                                <div className="mb-4">
                                    <label className="block text-sm font-semibold text-slate-700">
                                        License Platform Permissions
                                    </label>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Choose which platforms this employee can generate license keys for. If all are unchecked, they can only generate demo keys.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {PLATFORM_OPTIONS.map(({ key, label, sub }) => (
                                        <label
                                            key={key}
                                            className={`relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all select-none ${
                                                platformPerms[key]
                                                    ? 'border-[var(--brand-purple)] bg-[var(--brand-purple)]/5'
                                                    : 'border-slate-100 bg-white hover:border-slate-200'
                                            }`}
                                        >
                                            <div className="mt-0.5">
                                                <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                    platformPerms[key]
                                                        ? 'border-[var(--brand-purple)] bg-[var(--brand-purple)]'
                                                        : 'border-slate-300 bg-white'
                                                }`}>
                                                    {platformPerms[key] && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={platformPerms[key]}
                                                onChange={(e) => setPlatformPerms(prev => ({ ...prev, [key]: e.target.checked }))}
                                            />
                                            <div>
                                                <div className="font-semibold text-slate-900 text-sm">{label}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Submit Button */}
                        <div className="pt-6 border-t border-slate-100 flex justify-end">
                            <Button
                                type="submit"
                                disabled={loading}
                                className="h-12 px-8 bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white rounded-md font-medium text-base shadow-sm"
                            >
                                {loading ? "Creating..." : "Create User"}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
