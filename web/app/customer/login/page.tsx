"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Image from "next/image"

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

            {/* Right Section - Login Form */}
            <div className="flex w-full lg:w-1/2 items-center justify-center p-8 lg:p-12">
                <div className="w-full max-w-[400px]">
                    {/* Logo Area */}
                    <div className="mb-16">
                        <Image src="/Pramaan_logo_F1.png" alt="PRAMAAN Logo" width={180} height={40} className="w-auto h-8 lg:h-10 object-contain" />
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-wide">Customer Log In</h2>
                        <p className="text-slate-500 text-sm">Sign in to view your license purchases.</p>
                    </div>

                    <form onSubmit={onSubmit} className="space-y-6">
                        <div className="space-y-4">
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
                                className="hover:opacity-90 text-white px-8 h-10 rounded-md font-medium"
                            >
                                {loading ? "Signing in..." : "Sign In"}
                                {!loading && <span className="ml-2 font-black text-lg">›</span>}
                            </Button>
                        </div>

                        <div className="pt-6 text-center">
                            <p className="text-sm text-slate-500">
                                No account?{" "}
                                <Link href="/customer/register" className="text-[var(--brand-purple)] font-medium hover:underline">
                                    Register
                                </Link>
                            </p>
                            <p className="text-sm text-slate-500 mt-2">
                                Business user?{" "}
                                <Link href="/login" className="text-slate-700 font-medium hover:underline">
                                    Click here for business dashboard login
                                </Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
