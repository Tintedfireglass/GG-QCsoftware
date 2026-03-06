"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type CustomerUser = {
    id: number
    email: string
    fullName?: string | null
}

type License = {
    id: number
    key: string
    is_active: boolean
    expires_at: string | null
    created_at: string
    plan: string | null
    payment_reference: string | null
}

const plans: Array<"monthly" | "yearly" | "lifetime"> = ["monthly", "yearly", "lifetime"]

export default function CustomerAccountPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
            <CustomerAccountContent />
        </Suspense>
    )
}

function CustomerAccountContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const status = useMemo(() => searchParams.get("status"), [searchParams])
    const message = useMemo(() => searchParams.get("message"), [searchParams])

    const [user, setUser] = useState<CustomerUser | null>(null)
    const [licenses, setLicenses] = useState<License[]>([])
    const [loading, setLoading] = useState(true)
    const [busyPlan, setBusyPlan] = useState<string | null>(null)
    const [error, setError] = useState("")

    useEffect(() => {
        const token = localStorage.getItem("qc_customer_token")
        const userRaw = localStorage.getItem("qc_customer_user")
        if (!token || !userRaw) {
            router.push("/customer/login")
            return
        }

        setUser(JSON.parse(userRaw) as CustomerUser)

        async function loadLicenses() {
            try {
                const res = await fetch("/api/customer/licenses", {
                    headers: { Authorization: `Bearer ${token}` },
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.message || "Failed to load licenses")
                setLicenses(data.licenses || [])
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load licenses")
            } finally {
                setLoading(false)
            }
        }
        loadLicenses()
    }, [router])

    async function startCheckout(plan: "monthly" | "yearly" | "lifetime") {
        const token = localStorage.getItem("qc_customer_token")
        if (!token) {
            router.push("/customer/login")
            return
        }

        setBusyPlan(plan)
        setError("")
        try {
            const res = await fetch("/api/customer/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ plan }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || "Unable to start checkout")
            window.location.href = data.redirectUrl
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to start checkout")
            setBusyPlan(null)
        }
    }

    function logout() {
        localStorage.removeItem("qc_customer_token")
        localStorage.removeItem("qc_customer_user")
        router.push("/customer/login")
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Customer Account</h1>
                        <p className="text-slate-600">{user?.fullName || user?.email}</p>
                    </div>
                    <Button variant="outline" onClick={logout}>Logout</Button>
                </div>

                {status === "success" ? (
                    <Card className="border-green-300 bg-green-50">
                        <CardContent className="py-4 text-green-800">Payment successful. Your license key is ready below.</CardContent>
                    </Card>
                ) : null}

                {status === "failed" ? (
                    <Card className="border-red-300 bg-red-50">
                        <CardContent className="py-4 text-red-700">{message || "Payment failed or cancelled."}</CardContent>
                    </Card>
                ) : null}

                {error ? (
                    <Card className="border-red-300 bg-red-50">
                        <CardContent className="py-4 text-red-700">{error}</CardContent>
                    </Card>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                    {plans.map((plan) => (
                        <Card key={plan}>
                            <CardHeader>
                                <CardTitle className="capitalize">{plan} Plan</CardTitle>
                                <CardDescription>Buy a new personal key</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    className="w-full"
                                    onClick={() => startCheckout(plan)}
                                    disabled={busyPlan !== null}
                                >
                                    {busyPlan === plan ? "Redirecting..." : "Buy Now"}
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Your License Keys</CardTitle>
                        <CardDescription>Use these keys in the desktop app activation dialog.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <p className="text-slate-500">Loading licenses...</p>
                        ) : licenses.length === 0 ? (
                            <p className="text-slate-500">No license keys yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {licenses.map((license) => (
                                    <div key={license.id} className="rounded border border-slate-200 p-3">
                                        <div className="font-mono text-lg tracking-wide">{license.key}</div>
                                        <div className="text-sm text-slate-600 mt-1">
                                            Plan: <span className="capitalize">{license.plan || "N/A"}</span>
                                            {" | "}
                                            Status: {license.is_active ? "Active" : "Inactive"}
                                            {" | "}
                                            Expires: {license.expires_at ? new Date(license.expires_at).toLocaleDateString() : "Never"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
