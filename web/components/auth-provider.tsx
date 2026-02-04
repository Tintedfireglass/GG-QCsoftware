"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { UserRole, UserRoleDisplayNames } from "@/lib/types"

interface User {
    id: number
    username: string
    role: UserRole
    display_name?: string
}

interface AuthContextType {
    user: User | null
    token: string | null
    login: (token: string, user: User) => void
    logout: () => void
    isLoading: boolean
    // Role-based helpers
    isSuperAdmin: () => boolean
    isAdmin: () => boolean
    isUser: () => boolean
    canManageUsers: () => boolean
    canViewAllResults: () => boolean
    canViewMachines: () => boolean
    getRoleDisplayName: () => string
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    login: () => { },
    logout: () => { },
    isLoading: true,
    isSuperAdmin: () => false,
    isAdmin: () => false,
    isUser: () => false,
    canManageUsers: () => false,
    canViewAllResults: () => false,
    canViewMachines: () => false,
    getRoleDisplayName: () => "",
})

export function useAuth() {
    return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        // Check local storage on mount
        const storedToken = localStorage.getItem("qc_token")
        const storedUser = localStorage.getItem("qc_user")

        if (storedToken && storedUser) {
            setToken(storedToken)
            setUser(JSON.parse(storedUser))
        }

        setIsLoading(false)
    }, [])

    useEffect(() => {
        // Redirect logic
        if (!isLoading) {
            const isPublicRoute = pathname.startsWith("/login") || pathname.startsWith("/report")

            if (!token && !isPublicRoute) {
                router.push("/login")
            } else if (token && pathname === "/login") {
                router.push("/dashboard")
            } else if (token && pathname === "/") {
                router.push("/dashboard")
            }
        }
    }, [token, isLoading, pathname, router])

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
    const isAdmin = () => user?.role === "Admin"
    const isUser = () => user?.role === "User"

    // Permission checks
    const canManageUsers = () => user?.role === "SuperAdmin" || user?.role === "Admin"
    const canViewAllResults = () => user?.role === "SuperAdmin" || user?.role === "Admin"
    const canViewMachines = () => user?.role === "SuperAdmin" || user?.role === "Admin"

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
            isLoading,
            isSuperAdmin,
            isAdmin,
            isUser,
            canManageUsers,
            canViewAllResults,
            canViewMachines,
            getRoleDisplayName,
        }}>
            {children}
        </AuthContext.Provider>
    )
}

