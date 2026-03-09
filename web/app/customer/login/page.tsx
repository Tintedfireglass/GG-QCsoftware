"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function CustomerLoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setLoading(true)

        try {
            const res = await fetch("/api/customer/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.message || "Login failed")

            localStorage.setItem("qc_customer_token", data.token)
            localStorage.setItem("qc_customer_user", JSON.stringify(data.customer))
            router.push("/customer/account")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Customer Login</CardTitle>
                    <CardDescription>Sign in to view your license purchases.</CardDescription>
                </CardHeader>
                <form onSubmit={onSubmit}>
                    <CardContent className="space-y-3">
                        <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
                        <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
                        {error ? <p className="text-sm text-red-600">{error}</p> : null}
                    </CardContent>
                    <CardFooter className="flex flex-col items-stretch gap-3">
                        <Button type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
                        <p className="text-sm text-slate-500 text-center">
                            No account? <Link href="/customer/register" className="text-blue-600 hover:underline">Register</Link>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
