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
    AlertCircle
} from "lucide-react"

export default function NewUserPage() {
    const router = useRouter()
    const { isSuperAdmin, canManageUsers } = useAuth()

    const [formData, setFormData] = useState({
        username: "",
        password: "",
        confirmPassword: "",
        email: "",
        display_name: "",
        role: "User" as UserRole
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Get roles that current user can create
    const creatableRoles: UserRole[] = isSuperAdmin() ? ['Admin', 'User'] : ['User']

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        // Validate passwords match
        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match")
            return
        }

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

        setLoading(true)

        try {
            await createUser({
                username: formData.username,
                password: formData.password,
                email: formData.email || undefined,
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
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-4">
                <Link href="/dashboard/users">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Create New User</h1>
                    <p className="text-slate-500 mt-1">
                        {isSuperAdmin()
                            ? "Create a new admin or technician account"
                            : "Create a new technician account for your team"}
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        User Details
                    </CardTitle>
                    <CardDescription>
                        Fill in the details below to create a new user account.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Username */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Username *
                            </label>
                            <Input
                                type="text"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                placeholder="Enter username"
                                required
                            />
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
                                placeholder="Enter display name (optional)"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                This name will be shown in the UI. Defaults to username if not provided.
                            </p>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Email
                            </label>
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="Enter email (optional)"
                            />
                        </div>

                        {/* Password */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Password *
                                </label>
                                <Input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="Enter password"
                                    required
                                    minLength={6}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Confirm Password *
                                </label>
                                <Input
                                    type="password"
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    placeholder="Confirm password"
                                    required
                                />
                            </div>
                        </div>

                        {/* Role Selection */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Role *
                            </label>
                            <div className="space-y-2">
                                {creatableRoles.map((role) => (
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
                                                <Shield className={`h-4 w-4 ${role === 'Admin' ? 'text-blue-500' : 'text-green-500'
                                                    }`} />
                                                <span className="font-medium">{UserRoleDisplayNames[role]}</span>
                                                <span className="text-xs text-slate-400">({role})</span>
                                            </div>
                                            <p className="text-sm text-slate-500 mt-0.5">
                                                {UserRoleDescriptions[role]}
                                            </p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="flex items-center gap-3 pt-4 border-t">
                            <Button type="submit" disabled={loading}>
                                {loading ? "Creating..." : "Create User"}
                            </Button>
                            <Link href="/dashboard/users">
                                <Button type="button" variant="outline">
                                    Cancel
                                </Button>
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
