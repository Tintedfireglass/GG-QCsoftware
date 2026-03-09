"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check } from "lucide-react"
import Image from "next/image"

export default function LoginPage() {
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const { login } = useAuth()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setLoading(true)

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.message || "Login failed")
            }

            login(data.token, data.user)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen w-full bg-white">
            {/* Left Section - Hero */}
            <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 bg-slate-50 border-r border-slate-100">
                <div className="max-w-xl">
                    <h1 className="text-4xl lg:text-5xl font-semibold text-slate-900 leading-tight mb-8">
                        Smart <span className="text-[var(--brand-purple)]">device health testing</span>
                        <br />for reliable performance
                    </h1>

                    <div className="flex gap-4 mb-16">
                        <div className="px-6 py-4 bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-[var(--brand-purple)] font-medium text-sm flex-1 text-center border border-slate-100">
                            Full QC
                        </div>
                        <div className="px-6 py-4 bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-[var(--brand-purple)] font-medium text-sm flex-1 text-center border border-slate-100">
                            Basic QC
                        </div>
                        <div className="px-6 py-4 bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-[var(--brand-purple)] font-medium text-sm flex-1 text-center border border-slate-100">
                            Stress Test
                        </div>
                    </div>
                </div>

                <div className="flex-1 relative flex items-center justify-center -mt-8">
                    <div className="relative w-full max-w-[500px] aspect-[4/3]">
                        <Image
                            src="/loginImg.png"
                            alt="Laptop QC Testing Illustration"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>
            </div>

            {/* Right Section - Login Form */}
            <div className="flex w-full lg:w-1/2 items-center justify-center p-8 lg:p-12">
                <div className="w-full max-w-[400px]">
                    {/* Logo Area */}
                    <div className="mb-16">
                        <div className="flex items-center gap-1 font-bold text-2xl tracking-wider text-slate-900">
                            P R A M <span className="text-[var(--brand-purple)] flex items-center"><Check strokeWidth={4} className="h-6 w-6 -mr-1" /> A A N</span>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-wide">Log In</h2>
                        <p className="text-slate-500 text-sm">Please fill your information below</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-1.5 relative pt-2">
                                <label className="absolute -top-1 left-2 bg-white px-1 text-[11px] font-medium text-slate-500 z-10">
                                    Username
                                </label>
                                <Input
                                    id="username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    disabled={loading}
                                    className="h-12 border-slate-300 rounded-lg focus-visible:ring-[var(--brand-purple)] text-base relative z-0"
                                />
                            </div>

                            <div className="space-y-1.5 relative pt-2">
                                <label className="absolute -top-1 left-2 bg-white px-1 text-[11px] font-medium text-slate-500 z-10">
                                    Password
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
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
                                {loading ? "Signing in..." : "Next"}
                                {!loading && <span className="ml-2 font-black text-lg">›</span>}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
