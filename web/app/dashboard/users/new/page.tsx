"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { createUser } from "@/lib/api"
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
    const { isSuperAdmin, canManageUsers } = useAuth()

    const [formData, setFormData] = useState({
        username: "",
        password: "",
        email: "",
        company_name: "",
        display_name: "",
        role: "Technician" as UserRole
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Get roles that current user can create
    const creatableRoles: UserRole[] = isSuperAdmin() ? ['Refurbisher', 'Technician', 'Enterprise'] : ['Technician']

    // Custom role mapping for the UI
    const customRoleDisplay: Record<UserRole, { title: string, description: string }> = {
        SuperAdmin: { title: "Super Admin", description: "Full system access" },
        Refurbisher: { title: "Refurbisher", description: "Bulk reseller, manages technician team and grading" },
        Technician: { title: "Technician", description: "QC Technician, performs certifications on laptops" },
        Enterprise: { title: "Enterprise", description: "IT fleet manager, tracks company machines over time" },
        B2CDevice: { title: "B2C Device", description: "Consumer devices initiated via B2C plans" }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        // Validate password length
        if (formData.password.length < 6) {
            setError("Password must be at least 6 characters")
            return
        }

        // Validate role
        if (!creatableRoles.includes(formData.role)) {
            setError("You cannot create users with this role")
            return
        }

        if ((formData.role === "Enterprise" || formData.role === "Refurbisher") && !formData.company_name.trim()) {
            setError("Company name is required for Enterprise and Refurbisher users")
            return
        }

        setLoading(true)

        try {
            await createUser({
                username: formData.username,
                password: formData.password,
                email: formData.email || undefined,
                company_name: formData.company_name.trim() || undefined,
                display_name: formData.display_name || undefined,
                role: formData.role
            })

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
                                    Email
                                </label>
                                <Input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="aman@example.com"
                                    className="h-12 bg-slate-50/50 border-slate-200 focus-visible:ring-[var(--brand-purple)] focus-visible:bg-white"
                                />
                            </div>
                            <div className="hidden md:block"></div> {/* Empty spacer */}

                            {/* Company Name Row */}
                            {(formData.role === "Enterprise" || formData.role === "Refurbisher" || formData.role === "Technician") && (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                                        Company name {(formData.role === "Enterprise" || formData.role === "Refurbisher") && <span className="text-rose-500">*</span>}
                                    </label>
                                    <Input
                                        type="text"
                                        value={formData.company_name}
                                        onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                                        placeholder="Gadget Guruz"
                                        className="h-12 bg-slate-50/50 border-slate-200 focus-visible:ring-[var(--brand-purple)] focus-visible:bg-white"
                                    />
                                </div>
                            )}
                            <div className="hidden md:block"></div> {/* Empty spacer */}

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
                            <div className="hidden md:block"></div> {/* Empty spacer (removed Time Zone per user request) */}
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

                        {/* Submit Button */}
                        <div className="pt-6 border-t border-slate-100 flex justify-end">
                            <Button
                                type="submit"
                                disabled={loading}
                                className="h-12 px-8 bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white rounded-full font-medium text-base shadow-sm"
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
