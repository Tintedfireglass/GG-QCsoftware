"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function CustomerRegisterPage() {
    const searchParams = useSearchParams()
    const selectedPlan = useMemo(() => searchParams.get("plan") || "yearly", [searchParams])

    const [fullName, setFullName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setLoading(true)

        try {
            const registerRes = await fetch("/api/customer/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fullName, email, password }),
            })
            const registerData = await registerRes.json()
            if (!registerRes.ok) throw new Error(registerData.message || "Registration failed")

            localStorage.setItem("qc_customer_token", registerData.token)
            localStorage.setItem("qc_customer_user", JSON.stringify(registerData.customer))

            const checkoutRes = await fetch("/api/customer/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${registerData.token}`,
                },
                body: JSON.stringify({ plan: selectedPlan }),
            })
            const checkoutData = await checkoutRes.json()
            if (!checkoutRes.ok) throw new Error(checkoutData.message || "Unable to start checkout")

            window.location.href = checkoutData.redirectUrl
        } catch (err) {
            setError(err instanceof Error ? err.message : "Registration failed")
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Create Customer Account</CardTitle>
                    <CardDescription>Selected plan: <span className="font-medium capitalize">{selectedPlan}</span></CardDescription>
                </CardHeader>
                <form onSubmit={onSubmit}>
                    <CardContent className="space-y-3">
                        <Input placeholder="Full Name (optional)" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={loading} />
                        <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
                        <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
                        {error ? <p className="text-sm text-red-600">{error}</p> : null}
                    </CardContent>
                    <CardFooter className="flex flex-col items-stretch gap-3">
                        <Button type="submit" disabled={loading}>{loading ? "Creating account..." : "Register & Continue to Payment"}</Button>
                        <p className="text-sm text-slate-500 text-center">
                            Already registered? <Link href="/customer/login" className="text-blue-600 hover:underline">Login</Link>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
