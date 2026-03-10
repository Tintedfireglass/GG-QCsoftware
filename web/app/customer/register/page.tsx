"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Image from "next/image"

export default function CustomerRegisterPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
            <CustomerRegisterContent />
        </Suspense>
    )
}

function CustomerRegisterContent() {
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
                body: JSON.stringify({}),
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
        <div className="flex min-h-screen w-full bg-white">
            {/* Left Section - Hero */}
            <div className="hidden lg:block w-1/2 relative bg-slate-50 border-r border-slate-100">
                <Image
                    src="/loginImg.png"
                    alt="Laptop QC Testing Illustration"
                    fill
                    className="object-cover"
                    priority
                />
            </div>

            {/* Right Section - Register Form */}
            <div className="flex w-full lg:w-1/2 items-center justify-center p-8 lg:p-12">
                <div className="w-full max-w-[400px]">
                    {/* Logo Area */}
                    <div className="mb-16">
                        <Image src="/prmn_logo.png" alt="PRAMAAN Logo" width={180} height={40} className="w-auto h-8 lg:h-10 object-contain" />
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-wide">Create Account</h2>
                        <p className="text-slate-500 text-sm">One-time license purchase: <span className="font-semibold text-slate-700">Rs.99</span></p>
                    </div>

                    <form onSubmit={onSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-1.5 relative pt-2">
                                <label className="absolute -top-1 left-2 bg-white px-1 text-[11px] font-medium text-slate-500 z-10">
                                    Full Name
                                </label>
                                <Input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    disabled={loading}
                                    className="h-12 border-slate-300 rounded-lg focus-visible:ring-[var(--brand-purple)] text-base relative z-0"
                                    placeholder="Optional"
                                />
                            </div>

                            <div className="space-y-1.5 relative pt-2">
                                <label className="absolute -top-1 left-2 bg-white px-1 text-[11px] font-medium text-slate-500 z-10">
                                    Email
                                </label>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                    required
                                    className="h-12 border-slate-300 rounded-lg focus-visible:ring-[var(--brand-purple)] text-base relative z-0"
                                />
                            </div>

                            <div className="space-y-1.5 relative pt-2">
                                <label className="absolute -top-1 left-2 bg-white px-1 text-[11px] font-medium text-slate-500 z-10">
                                    Password
                                </label>
                                <Input
                                    type="password"
                                    placeholder="••••••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                    required
                                    className="h-12 border-slate-300 rounded-lg focus-visible:ring-[var(--brand-purple)] text-base placeholder:text-slate-600 relative z-0 tracking-widest pt-2"
                                />
                            </div>
                        </div>

                        {error && <p className="text-sm text-red-500">{error}</p>}

                        <div className="pt-4 flex justify-end">
                            <Button
                                type="submit"
                                disabled={loading}
                                style={{ backgroundColor: 'var(--brand-purple)' }}
                                className="hover:opacity-90 w-full text-white px-8 h-12 rounded-lg font-medium text-lg"
                            >
                                {loading ? "Creating account..." : "Register & Pay"}
                                {!loading && <span className="ml-2 font-black text-xl">›</span>}
                            </Button>
                        </div>

                        <div className="pt-6 text-center">
                            <p className="text-sm text-slate-500">
                                Already registered?{" "}
                                <Link href="/customer/login" className="text-[var(--brand-purple)] font-medium hover:underline">
                                    Sign IN
                                </Link>
                            </p>
                            <p className="text-sm text-slate-500 mt-2">
                                Staff login?{" "}
                                <Link href="/login" className="text-slate-700 font-medium hover:underline">
                                    Go to admin login
                                </Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
