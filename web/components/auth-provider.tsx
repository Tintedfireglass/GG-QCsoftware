"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { UserRole, UserRoleDisplayNames } from "@/lib/types"

interface User {
    id: number
    username: string
    role: UserRole
    display_name?: string
    // Temporary key duration permission flags (fetched fresh from /api/users/me)
    allow_monthly_keys?: boolean
    allow_monthly_keys?: boolean
    allow_quarterly_keys?: boolean
    allow_6month_keys?: boolean
    allow_yearly_keys?: boolean
    allow_perpetual_keys?: boolean
}

interface AuthContextType {
    user: User | null
    token: string | null
    login: (token: string, user: User) => void
    logout: () => void
    isLoading: boolean
    // Role-based helpers
    isSuperAdmin: () => boolean
    isEmployee: () => boolean
    isRefurbisher: () => boolean
    isReseller: () => boolean
    isTechnician: () => boolean
    isEnterprise: () => boolean
    isOEM: () => boolean
    isInsurer: () => boolean
    isClient: () => boolean
    // Legacy aliases (backward compat during transition)
    isAdmin: () => boolean
    isUser: () => boolean
    // Permission checks
    canManageUsers: () => boolean
    canViewAllResults: () => boolean
    canViewMachines: () => boolean
    canManageFleet: () => boolean
    canExportBulk: () => boolean
    getRoleDisplayName: () => string
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    login: () => { },
    logout: () => { },
    isLoading: true,
    isSuperAdmin: () => false,
    isEmployee: () => false,
    isRefurbisher: () => false,
    isReseller: () => false,
    isTechnician: () => false,
    isEnterprise: () => false,
    isOEM: () => false,
    isInsurer: () => false,
    isClient: () => false,
    isAdmin: () => false,
    isUser: () => false,
    canManageUsers: () => false,
    canViewAllResults: () => false,
    canViewMachines: () => false,
    canManageFleet: () => false,
    canExportBulk: () => false,
    getRoleDisplayName: () => "",
})

export function useAuth() {
    return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(() => {
        if (typeof window === "undefined") return null
        const storedUser = localStorage.getItem("qc_user")
        return storedUser ? (JSON.parse(storedUser) as User) : null
    })
    const [token, setToken] = useState<string | null>(() => {
        if (typeof window === "undefined") return null
        return localStorage.getItem("qc_token")
    })
    const router = useRouter()
    const pathname = usePathname()

    // On mount (or whenever token changes), fetch fresh user data including permission flags
    useEffect(() => {
        if (!token) return
        fetch("/api/users/me", {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => {
                if (!res.ok) return null
                return res.json()
            })
            .then((data) => {
                if (!data?.user) return
                setUser((prev) => {
                    if (!prev) return prev
                    return {
                        ...prev,
                        allow_monthly_keys: data.user.allow_monthly_keys ?? false,
                        allow_quarterly_keys: data.user.allow_quarterly_keys ?? false,
                        allow_6month_keys: data.user.allow_6month_keys ?? false,
                        allow_yearly_keys: data.user.allow_yearly_keys ?? false,
                        allow_perpetual_keys: data.user.allow_perpetual_keys ?? true,
                    }
                })
            })
            .catch(() => {
                // Silently fail — permission flags just won't be populated
            })
    }, [token])

    useEffect(() => {
        // Redirect logic
        const isPublicRoute =
            pathname.startsWith("/login") ||
            pathname.startsWith("/report") ||
            pathname.startsWith("/customer") ||
            pathname.startsWith("/verify")

        if (!token && !isPublicRoute) {
            router.push("/login")
        } else if (token && pathname === "/login") {
            router.push("/dashboard")
        } else if (token && pathname === "/") {
            router.push("/dashboard")
        }
    }, [token, pathname, router])

    const login = (newToken: string, newUser: User) => {
        localStorage.setItem("qc_token", newToken)
        localStorage.setItem("qc_user", JSON.stringify(newUser))
        setToken(newToken)
        setUser(newUser)
        router.push("/dashboard")
    }

    const logout = () => {
        localStorage.removeItem("qc_token")
        localStorage.removeItem("qc_user")
        setToken(null)
        setUser(null)
        router.push("/login")
    }

    // Role-based helper functions
    const isSuperAdmin = () => user?.role === "SuperAdmin"
    const isEmployee = () => user?.role === "Employee"
    const isRefurbisher = () => user?.role === "Refurbisher"
    const isReseller = () => user?.role === "Reseller"
    const isTechnician = () => user?.role === "Technician"
    const isEnterprise = () => user?.role === "Enterprise"
    const isOEM = () => user?.role === "OEM"
    const isInsurer = () => user?.role === "Insurer"
    const isClient = () => user?.role === "Client"

    // Legacy aliases — point to new names for backward compat
    const isAdmin = () => isRefurbisher()
    const isUser = () => isTechnician() || isClient()

    // Permission checks
    const canManageUsers = () => isSuperAdmin() || isRefurbisher() || isEnterprise() || isOEM() || isInsurer() || isReseller()
    const canViewAllResults = () => isSuperAdmin() || isRefurbisher() || isEnterprise() || isOEM() || isInsurer() || isReseller()
    const canViewMachines = () => isSuperAdmin() || isEnterprise() || isOEM() || isInsurer() || isReseller()
    const canManageFleet = () => isEnterprise() || isOEM() || isInsurer() || isReseller()
    const canExportBulk = () => isSuperAdmin() || isRefurbisher() || isEnterprise() || isOEM() || isInsurer() || isReseller()

    const getRoleDisplayName = () => {
        if (!user) return ""
        return UserRoleDisplayNames[user.role] || user.role
    }

    return (
        <AuthContext.Provider value={{
            user,
            token,
            login,
            logout,
            isLoading: false,
            isSuperAdmin,
            isEmployee,
            isRefurbisher,
            isReseller,
            isTechnician,
            isEnterprise,
            isOEM,
            isInsurer,
            isClient,
            isAdmin,
            isUser,
            canManageUsers,
            canViewAllResults,
            canViewMachines,
            canManageFleet,
            canExportBulk,
            getRoleDisplayName,
        }}>
            {children}
        </AuthContext.Provider>
    )
}
