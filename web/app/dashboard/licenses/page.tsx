"use client"

import React, { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Wand2, Search, CheckCircle2, Copy, X } from "lucide-react"

interface LicenseKey {
    id: number
    key: string
    type: string
    max_uses: number
    current_uses: number
    is_active: boolean
    expires_at: string | null
    created_at: string
    activations_count: string
}

export default function LicensesPage() {
    const { user, token } = useAuth()
    const router = useRouter()

    const [keys, setKeys] = useState<LicenseKey[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")

    // Modal States
    const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false)

    // Generation Form States
    const [isGenerating, setIsGenerating] = useState(false)
    const [newType, setNewType] = useState("single_use")
    const [newMaxUses, setNewMaxUses] = useState("1")
    const [generatedKeyString, setGeneratedKeyString] = useState("")
    const [generateError, setGenerateError] = useState("")
    const [togglingId, setTogglingId] = useState<number | null>(null)

    useEffect(() => {
        if (!user) {
            router.push("/login")
            return
        }
        if (user.role !== "Refurbisher" && user.role !== "Enterprise" && user.role !== "Reseller" && user.role !== "Client" && user.role !== "SuperAdmin") {
            router.push("/dashboard")
            return
        }
        fetchKeys()
    }, [user, router])

    const fetchKeys = async () => {
        try {
            setLoading(true)
            const res = await fetch("/api/licenses", {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setKeys(data.keys)
            }
        } catch (err) {
            console.error("Error connecting to the server.", err)
        } finally {
            setLoading(false)
        }
    }

    const handleGenerate = async () => {
        setGenerateError("")
        setIsGenerating(true)

        try {
            const maxUsesValue = parseInt(newMaxUses, 10)
            if (Number.isNaN(maxUsesValue) || maxUsesValue < 1) {
                setGenerateError("Max device activations must be a number of 1 or more.")
                return
            }
            const res = await fetch("/api/licenses", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    type: newType,
                    max_uses: maxUsesValue
                })
            })

            const data = await res.json()

            if (res.ok) {
                setGeneratedKeyString(data.key.key)
                setIsGenerateModalOpen(false)     // Close generation modal
                setIsSuccessModalOpen(true)       // Open success modal
                fetchKeys()                       // Refresh list immediately
            } else {
                setGenerateError(data.message || data.error || "Failed to generate key.")
            }
        } catch (err) {
            setGenerateError("Server error while generating key.")
        } finally {
            setIsGenerating(false)
        }
    }

    const handleCopy = (keyString: string) => {
        navigator.clipboard.writeText(keyString)
        alert("Copied to clipboard!")
    }

    const handleToggleActive = async (licenseKey: LicenseKey) => {
        const nextActive = !licenseKey.is_active
        if (!nextActive) {
            const confirmed = confirm("Disable this license key? It will stop working immediately.")
            if (!confirmed) return
        }

        try {
            setTogglingId(licenseKey.id)
            const res = await fetch("/api/licenses", {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    id: licenseKey.id,
                    is_active: nextActive
                })
            })

            const data = await res.json()
            if (!res.ok) {
                alert(data.message || data.error || "Failed to update license key.")
                return
            }

            await fetchKeys()
        } catch (err) {
            alert("Server error while updating license key.")
        } finally {
            setTogglingId(null)
        }
    }

    // Filter keys
    const filteredKeys = keys.filter(k => k.key.toLowerCase().includes(search.toLowerCase()))

    if (loading) return <div className="p-8 text-center text-slate-500">Loading licenses...</div>

    return (
        <div className="space-y-6 max-w-[1200px]">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">License management</h1>
                <p className="text-slate-500 text-sm mt-1">View all the registered machines and their details</p>
            </div>

            <div className="pt-2">
                <Button
                    className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white px-6 h-11 rounded-lg font-medium shadow-sm transition-colors"
                    onClick={() => {
                        setNewType("single_use")
                        setNewMaxUses("1")
                        setGenerateError("")
                        setIsGenerateModalOpen(true)
                    }}
                >
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate License Key
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 mt-8">
                <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 gap-4 sm:gap-0">
                    <h2 className="text-xl font-bold text-slate-900">Active License Keys</h2>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 w-[250px] bg-white border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                        />
                    </div>
                </div>

                <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b border-slate-200 bg-white">
                            <tr className="border-b transition-colors hover:bg-slate-50/50">
                                <th className="h-12 px-6 align-middle font-medium text-slate-900">License Key</th>
                                <th className="h-12 px-6 align-middle font-medium text-slate-900 text-center w-[150px]">Type</th>
                                <th className="h-12 px-6 align-middle font-medium text-slate-900 text-center w-[200px]">Activation (Uses /Max)</th>
                                <th className="h-12 px-6 align-middle font-medium text-slate-900 text-center w-[150px]">Status</th>
                                <th className="h-12 px-6 align-middle font-medium text-slate-900 text-right w-[150px]">Action</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {filteredKeys.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500">
                                        No license keys found. Generate one above.
                                    </td>
                                </tr>
                            ) : (
                                filteredKeys.map((k) => (
                                    <tr key={k.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50">
                                        <td className="p-6 align-middle text-slate-600 font-medium tracking-wide">
                                            {k.key}
                                        </td>
                                        <td className="p-6 align-middle text-center">
                                            <span className="inline-flex items-center px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-600 text-xs font-medium">
                                                {k.type === "bulk" ? "Bulk" : "Single use"}
                                            </span>
                                        </td>
                                        <td className="p-6 align-middle text-center text-slate-600">
                                            {k.current_uses}/{k.max_uses}
                                        </td>
                                        <td className="p-6 align-middle text-center">
                                            {k.is_active ? (
                                                k.current_uses >= k.max_uses ? (
                                                    <span className="inline-flex items-center px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium">
                                                        Exhausted
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium">
                                                        Active
                                                    </span>
                                                )
                                            ) : (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium">
                                                    Revoked
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-6 align-middle text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    className="rounded-full px-6 border-slate-200 text-slate-600 hover:text-[var(--brand-purple)] hover:border-[var(--brand-purple)] bg-white shadow-sm h-9"
                                                    onClick={() => handleCopy(k.key)}
                                                >
                                                    Copy
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className={
                                                        k.is_active
                                                            ? "rounded-full px-6 border-rose-200 text-rose-600 hover:text-rose-700 hover:border-rose-300 bg-white shadow-sm h-9"
                                                            : "rounded-full px-6 border-emerald-200 text-emerald-600 hover:text-emerald-700 hover:border-emerald-300 bg-white shadow-sm h-9"
                                                    }
                                                    onClick={() => handleToggleActive(k)}
                                                    disabled={togglingId === k.id}
                                                >
                                                    {togglingId === k.id ? "Updating..." : k.is_active ? "Disable" : "Enable"}
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* GENERATE MODAL */}
            {isGenerateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-[500px] p-8 rounded-2xl shadow-xl relative animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setIsGenerateModalOpen(false)}
                            className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="mb-6">
                            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Generate new License Key</h2>
                            <p className="text-slate-500 text-base mt-2">
                                Create a 16-digit code for Desktop Application Login
                            </p>
                        </div>

                        {generateError && (
                            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">
                                {generateError}
                            </div>
                        )}

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">
                                    License Type
                                </label>
                                <select
                                    value={newType}
                                    onChange={(e) => {
                                        setNewType(e.target.value)
                                        if (e.target.value === "single_use") setNewMaxUses("1")
                                    }}
                                    className="w-full h-12 px-4 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)] text-[var(--brand-purple)] font-medium bg-white appearance-none cursor-pointer"
                                >
                                    <option value="single_use">Single Use (1 Device)</option>
                                    <option value="bulk">Bulk Use (Multi Device)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">
                                    Max Device Activations
                                </label>
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    step={1}
                                    value={newMaxUses}
                                    onChange={(e) => setNewMaxUses(e.target.value)}
                                    disabled={newType === "single_use"}
                                    className="w-full h-12 px-4 text-base border border-slate-200 rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--brand-purple)] text-[var(--brand-purple)] font-medium bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                                <p className="mt-2 text-xs text-slate-500">
                                    Enter any number of activations you need (for example: 37 or 1000).
                                </p>
                            </div>

                            <Button
                                className="w-full h-12 mt-6 rounded-xl bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white text-base font-medium transition-colors"
                                onClick={handleGenerate}
                                disabled={isGenerating}
                            >
                                {isGenerating ? "Generating..." : "Generate License Key"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* SUCCESS MODAL */}
            {isSuccessModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-[450px] p-8 pt-10 rounded-2xl shadow-xl text-center flex flex-col items-center relative animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setIsSuccessModalOpen(false)}
                            className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="mb-6 rounded-full bg-emerald-500 p-3 shadow-lg shadow-emerald-500/20">
                            <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={2.5} />
                        </div>

                        <h2 className="text-2xl font-bold text-slate-900 mb-6">
                            License Key Generated
                        </h2>

                        <div className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm relative group overflow-hidden">
                            <div className="font-medium text-slate-600 tracking-wider text-lg">
                                {generatedKeyString}
                            </div>
                            <button
                                onClick={() => handleCopy(generatedKeyString)}
                                className="text-slate-400 hover:text-[var(--brand-purple)] transition-colors p-2"
                            >
                                <Copy className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
