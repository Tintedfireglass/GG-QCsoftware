"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"

interface User {
    id: number
    username: string
    role: string
}

interface AuthContextType {
    user: User | null
    token: string | null
    login: (token: string, user: User) => void
    logout: () => void
    isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    login: () => { },
    logout: () => { },
    isLoading: true,
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
            if (!token && !pathname.startsWith("/login")) {
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

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    )
}
