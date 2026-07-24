"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createLicenseKey, getLicenses, toggleLicenseKeyActive, updateLicenseExpiry } from "@/lib/api"
import { Wand2, Search, CheckCircle2, Copy, X, Key, Loader2, Calendar, Power, PowerOff } from "lucide-react"
import { Pagination } from "@/components/ui/pagination"
import { formatDateTimeDMY } from "@/lib/utils"

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
    demo_customer_name?: string | null
    customer_name?: string | null
    demo_runs_used?: number | null
    demo_max_runs?: number | null
    product_scope?: string[] | null
    platform_caps?: Record<string, number> | null
}

const PLATFORMS: { id: string; label: string }[] = [
    { id: "windows", label: "Windows (PC)" },
    { id: "android", label: "Android" },
    { id: "ios", label: "iPhone (iOS)" },
    { id: "mac", label: "Mac" },
]
const PLATFORM_LABELS: Record<string, string> = {
    windows: "Windows", android: "Android", ios: "iOS", mac: "Mac",
}
const PAGE_SIZE = 20

export default function LicensesPage() {
    const { user } = useAuth()
    const router = useRouter()

    const [keys, setKeys] = useState<LicenseKey[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "exhausted" | "expired" | "revoked">("all")
    const [sortBy, setSortBy] = useState<"created_desc" | "created_asc" | "activation_desc" | "activation_asc" | "status">("created_desc")
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)

    // Modal States
    const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false)
    const [isExtendModalOpen, setIsExtendModalOpen] = useState(false)

    // Generation Form States
    const [isGenerating, setIsGenerating] = useState(false)
    const [newType, setNewType] = useState("single_use")
    const [newMaxUses, setNewMaxUses] = useState("1")
    // Per-platform selection + device caps for the key being generated.
    const [platformSel, setPlatformSel] = useState<Record<string, { on: boolean; cap: string }>>({
        windows: { on: true, cap: "1" },
        android: { on: false, cap: "1" },
        ios: { on: false, cap: "1" },
        mac: { on: false, cap: "1" },
    })
    const [demoCustomerName, setDemoCustomerName] = useState("")
    const [durationMode, setDurationMode] = useState<"forever" | "temporary">("forever")
    const [expiresAt, setExpiresAt] = useState("")
    const [selectedDurationDays, setSelectedDurationDays] = useState(30)
    const [generatedKeyString, setGeneratedKeyString] = useState("")
    const [generateError, setGenerateError] = useState("")
    const [togglingId, setTogglingId] = useState<number | null>(null)

    // Extend Modal States
    const [extendingLicense, setExtendingLicense] = useState<LicenseKey | null>(null)
    const [extendDurationMode, setExtendDurationMode] = useState<"forever" | "temporary">("forever")
    const [extendExpiresAt, setExtendExpiresAt] = useState("")
    const [isExtending, setIsExtending] = useState(false)
    const [extendError, setExtendError] = useState("")

    // Redirect unauthorized users.
    useEffect(() => {
        if (!user) {
            router.push("/login")
            return
        }
        if (user.role !== "Refurbisher" && user.role !== "Enterprise" && user.role !== "OEM" && user.role !== "Insurer" && user.role !== "Reseller" && user.role !== "Client" && user.role !== "SuperAdmin" && user.role !== "Employee") {
            router.push("/dashboard")
        }
    }, [user, router])

    const fetchKeys = useCallback(async () => {
        try {
            setLoading(true)
            const data = await getLicenses({ search, status: statusFilter, sort: sortBy, page, limit: PAGE_SIZE })
            setKeys(data.keys)
            setTotal(data.pagination.total)
        } catch (err) {
            console.error("Error connecting to the server.", err)
        } finally {
            setLoading(false)
        }
    }, [search, statusFilter, sortBy, page])

    // Reload from the server whenever the filters/sort/page change (once authorized).
    useEffect(() => {
        if (user) fetchKeys()
    }, [user, fetchKeys])

    // Employees may only generate non-demo keys for the platforms SuperAdmin granted them.
    // (Demo keys are unrestricted; other roles have no per-platform restriction.)
    const platformAllowed = (id: string) => {
        if (user?.role !== "Employee" || newType === "demo") return true
        const flags: Record<string, boolean | undefined> = {
            windows: user?.allow_windows_keys,
            android: user?.allow_android_keys,
            ios: user?.allow_ios_keys,
            mac: user?.allow_mac_keys,
        }
        return !!flags[id]
    }

    // Toggle a platform on/off. For single_use, only one platform may be selected at a time.
    const togglePlatform = (id: string) => {
        if (!platformAllowed(id)) return
        setPlatformSel((prev) => {
            const next = { ...prev, [id]: { ...prev[id], on: !prev[id].on } }
            // single_use and demo are single-device → only one platform may be selected.
            if ((newType === "single_use" || newType === "demo") && next[id].on) {
                for (const p of PLATFORMS) if (p.id !== id) next[p.id] = { ...next[p.id], on: false }
            }
            return next
        })
    }
    const setPlatformCap = (id: string, cap: string) =>
        setPlatformSel((prev) => ({ ...prev, [id]: { ...prev[id], cap } }))

    const selectedPlatforms = useMemo(
        () => PLATFORMS.filter((p) => platformSel[p.id]?.on),
        [platformSel]
    )
    const totalDevices = useMemo(
        () => selectedPlatforms.reduce((sum, p) => sum + (parseInt(platformSel[p.id].cap, 10) || 0), 0),
        [selectedPlatforms, platformSel]
    )

    const handleGenerate = async () => {
        setGenerateError("")
        setIsGenerating(true)

        try {
            const trimmedCustomerName = demoCustomerName.trim()
            if (newType === "demo" && !trimmedCustomerName) {
                setGenerateError("Customer name is required for demo keys.")
                return
            }

            // Build per-platform caps from the selection. single_use & demo are single-device (cap 1).
            if (selectedPlatforms.length === 0) {
                setGenerateError("Select at least one platform for this key.")
                return
            }
            const disallowed = selectedPlatforms.filter((p) => !platformAllowed(p.id))
            if (disallowed.length > 0) {
                setGenerateError(`You are not permitted to generate ${disallowed.map((p) => p.label).join(", ")} license keys.`)
                return
            }
            const singleDevice = newType === "single_use" || newType === "demo"
            const platformCaps: Record<string, number> = {}
            for (const p of selectedPlatforms) {
                const cap = singleDevice ? 1 : parseInt(platformSel[p.id].cap, 10)
                if (Number.isNaN(cap) || cap < 1) {
                    setGenerateError(`Device limit for ${p.label} must be 1 or more.`)
                    return
                }
                platformCaps[p.id] = cap
            }
            const productScope = selectedPlatforms.map((p) => p.id)
            const maxUses = Object.values(platformCaps).reduce((a, b) => a + b, 0)

            let computedExpiresAt = null;
            const isPrivilegedUser = user?.role === "SuperAdmin" || user?.role === "Employee";

            if (durationMode === "temporary") {
                if (isPrivilegedUser && expiresAt) {
                    computedExpiresAt = new Date(expiresAt).toISOString();
                } else if (!isPrivilegedUser && selectedDurationDays > 0) {
                    const d = new Date();
                    d.setDate(d.getDate() + selectedDurationDays);
                    computedExpiresAt = d.toISOString();
                }
            }

            const data = await createLicenseKey({
                type: newType as any,
                max_uses: maxUses,
                demo_customer_name: trimmedCustomerName ? trimmedCustomerName : undefined,
                expires_at: computedExpiresAt,
                product_scope: productScope,
                platform_caps: platformCaps,
            })

            setGeneratedKeyString(data.key.key)
            setIsGenerateModalOpen(false)
            setIsSuccessModalOpen(true)
            fetchKeys()
        } catch (err) {
            setGenerateError(err instanceof Error ? err.message : "Server error while generating key.")
        } finally {
            setIsGenerating(false)
        }
    }

    const handleCopy = (keyString: string) => {
        navigator.clipboard.writeText(keyString)
        alert("Copied to clipboard!")
    }

    const handleExtend = async () => {
        if (!extendingLicense) return
        setExtendError("")
        setIsExtending(true)
        try {
            const newExpiry = extendDurationMode === "temporary" && extendExpiresAt ? new Date(extendExpiresAt).toISOString() : null
            await updateLicenseExpiry({ id: extendingLicense.id, expires_at: newExpiry })
            setIsExtendModalOpen(false)
            fetchKeys()
        } catch (err) {
            setExtendError(err instanceof Error ? err.message : "Server error while updating expiry.")
        } finally {
            setIsExtending(false)
        }
    }

    const openExtendModal = (k: LicenseKey) => {
        setExtendingLicense(k)
        if (k.expires_at) {
            setExtendDurationMode("temporary")
            setExtendExpiresAt(new Date(k.expires_at).toISOString().split('T')[0])
        } else {
            setExtendDurationMode("forever")
            setExtendExpiresAt("")
        }
        setExtendError("")
        setIsExtendModalOpen(true)
    }

    const handleToggleActive = async (licenseKey: LicenseKey) => {
        const nextActive = !licenseKey.is_active
        if (!nextActive) {
            const confirmed = confirm("Disable this license key? It will stop working immediately.")
            if (!confirmed) return
        }

        try {
            setTogglingId(licenseKey.id)
            await toggleLicenseKeyActive({ id: licenseKey.id, is_active: nextActive })

            await fetchKeys()
        } catch (err) {
            alert(err instanceof Error ? err.message : "Server error while updating license key.")
        } finally {
            setTogglingId(null)
        }
    }

    const getEffectiveUses = (k: LicenseKey) => {
        const currentUses = typeof k.current_uses === "number" ? k.current_uses : 0
        const activationCount = parseInt(k.activations_count || "0", 10)
        return Math.max(currentUses, Number.isFinite(activationCount) ? activationCount : 0)
    }

    const parseDateMs = (value?: string | null) => {
        if (!value) return 0
        const ms = new Date(value).getTime()
        return Number.isFinite(ms) ? ms : 0
    }

    const formatDate = (value?: string | null) => formatDateTimeDMY(value)

    const renderPlatforms = (k: LicenseKey) => {
        const scope = k.product_scope && k.product_scope.length ? k.product_scope : ["windows"]
        return (
            <div className="flex flex-wrap gap-1 mt-1">
                {scope.map((p) => (
                    <span key={p} className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {PLATFORM_LABELS[p] || p}{k.platform_caps?.[p] ? ` ×${k.platform_caps[p]}` : ""}
                    </span>
                ))}
            </div>
        )
    }

    const getKeyStatus = (k: LicenseKey, nowMs: number) => {
        if (!k.is_active) return "revoked" as const
        const expiresMs = parseDateMs(k.expires_at)
        if (expiresMs > 0 && expiresMs <= nowMs) return "expired" as const
        const effectiveUses = getEffectiveUses(k)
        if (effectiveUses >= k.max_uses) return "exhausted" as const
        return "active" as const
    }

    // Search/filter/sort/pagination are all server-side (see licenses repo).
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">License management</h1>
                <p className="text-slate-500 text-sm mt-1">View all the registered machines and their details</p>
            </div>

            <div className="pt-2">
                <Button
                    className="bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white px-6 h-11 rounded-lg font-medium shadow-sm transition-colors"
                    onClick={() => {
                        const isPrivileged = user?.role === "SuperAdmin" || user?.role === "Employee"
                        // Platforms an Employee may generate non-demo keys for.
                        const employeePlatforms = ["windows", "android", "ios", "mac"].filter((id) => {
                            const flags: Record<string, boolean | undefined> = {
                                windows: user?.allow_windows_keys, android: user?.allow_android_keys,
                                ios: user?.allow_ios_keys, mac: user?.allow_mac_keys,
                            }
                            return !!flags[id]
                        })
                        // Employees with at least one platform default to single_use; otherwise demo only.
                        const defaultType = user?.role === "Employee"
                            ? (employeePlatforms.length ? "single_use" : "demo")
                            : "single_use"
                        // First platform to pre-select (Employees: their first allowed; others: windows).
                        const defaultPlatform = user?.role === "Employee" && defaultType !== "demo"
                            ? (employeePlatforms[0] ?? "windows")
                            : "windows"
                        setNewType(defaultType)
                        setNewMaxUses("1")
                        setPlatformSel({
                            windows: { on: defaultPlatform === "windows", cap: "1" },
                            android: { on: defaultPlatform === "android", cap: "1" },
                            ios: { on: defaultPlatform === "ios", cap: "1" },
                            mac: { on: defaultPlatform === "mac", cap: "1" },
                        })
                        setDemoCustomerName("")
                        setExpiresAt("")
                        setGenerateError("")
                        // Default duration based on user permissions:
                        // non-privileged users without perpetual access should start on "temporary"
                        if (!isPrivileged && !user?.allow_perpetual_keys) {
                            setDurationMode("temporary")
                            // Pick first allowed duration
                            const firstDuration =
                                user?.allow_monthly_keys ? 30
                                : user?.allow_quarterly_keys ? 90
                                : user?.allow_6month_keys ? 180
                                : user?.allow_yearly_keys ? 365
                                : 30
                            setSelectedDurationDays(firstDuration)
                        } else {
                            setDurationMode("forever")
                        }
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

                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                                className="pl-9 w-full sm:w-[250px] bg-white border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                            />
                        </div>

                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1) }}
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)]"
                            title="Filter by status"
                        >
                            <option value="all">All statuses</option>
                            <option value="active">Active</option>
                            <option value="exhausted">Exhausted</option>
                            <option value="expired">Expired</option>
                            <option value="revoked">Revoked</option>
                        </select>

                        <select
                            value={sortBy}
                            onChange={(e) => { setSortBy(e.target.value as any); setPage(1) }}
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)]"
                            title="Sort"
                        >
                            <option value="created_desc">Created: Newest</option>
                            <option value="created_asc">Created: Oldest</option>
                            <option value="activation_desc">Activation size: High</option>
                            <option value="activation_asc">Activation size: Low</option>
                            <option value="status">Status</option>
                        </select>
                    </div>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden flex flex-col gap-4 p-4 bg-slate-50 rounded-b-xl">
                    {loading ? (
                        <div className="py-8 text-center text-slate-500">Loading licenses...</div>
                    ) : keys.length === 0 ? (
                        <div className="py-8 text-center text-slate-500">No licenses found</div>
                    ) : (
                        keys.map((k) => {
                            const effectiveUses = getEffectiveUses(k)
                            const usagePercent = Math.min(100, Math.round(((effectiveUses || 0) / k.max_uses) * 100));
                            const customerLabel = (k.customer_name || k.demo_customer_name || "").trim()
                            const computedStatus = getKeyStatus(k, Date.now())

                            return (
                                <div key={k.id} className="bg-white border text-left border-slate-200 rounded-xl p-4 flex flex-col shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Key className="h-4 w-4 text-[var(--brand-purple)]" />
                                            <span className="font-mono font-medium text-slate-900 text-sm tracking-tight truncate max-w-[140px] sm:max-w-xs">{k.key}</span>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-slate-900" onClick={() => handleCopy(k.key)}>
                                                <Copy className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                        {computedStatus === "active" ? (
                                            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                                                Active
                                            </span>
                                        ) : computedStatus === "exhausted" ? (
                                            <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                                                Exhausted
                                            </span>
                                        ) : computedStatus === "expired" ? (
                                            <span className="inline-flex items-center rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                                                Expired
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700 uppercase tracking-wider">
                                                Revoked
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-3">
                                        <div>
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Type</div>
                                            <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700 font-mono">
                                                {k.type === "bulk" ? "Bulk" : k.type === "demo" ? "Demo" : "Single use"}
                                            </span>
                                        </div>
                                        {customerLabel ? (
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Customer</div>
                                                <div className="text-xs text-slate-600 truncate">{customerLabel}</div>
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="mb-3">
                                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Platforms</div>
                                        {renderPlatforms(k)}
                                    </div>

                                    <div className="text-xs text-slate-400 mb-3">
                                        Created: {formatDate(k.created_at)}
                                        {k.type !== 'demo' && (
                                            <div className="mt-1 font-medium text-slate-500">
                                                Expires: {k.expires_at ? formatDate(k.expires_at) : 'Forever'}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mb-4">
                                        <div className="flex justify-between items-end mb-1.5">
                                            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Usage</span>
                                            <span className="text-xs font-mono font-medium text-slate-700">{effectiveUses || 0} / {k.max_uses}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div 
                                                className={`h-1.5 rounded-full ${usagePercent >= 90 ? 'bg-rose-500' : usagePercent >= 75 ? 'bg-amber-400' : 'bg-[var(--brand-purple)]'}`} 
                                                style={{ width: `${usagePercent}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                        {k.type !== 'demo' && (user?.role === "SuperAdmin" || user?.role === "Employee") && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openExtendModal(k)}
                                                className="h-7 px-3 text-xs font-medium rounded-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                            >
                                                Extend
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleToggleActive(k)}
                                            className={`h-7 px-3 text-xs font-medium rounded-full ${k.is_active ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                                            disabled={togglingId === k.id}
                                        >
                                            {togglingId === k.id ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
                                            {togglingId === k.id ? "Updating..." : k.is_active ? "Disable" : "Enable"}
                                        </Button>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b border-slate-200">
                            <tr className="border-b transition-colors hover:bg-slate-50/50">
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 whitespace-nowrap">License Key</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 text-center whitespace-nowrap">Type</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 text-center whitespace-nowrap">Created</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 text-center whitespace-nowrap">Expires</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 text-center whitespace-nowrap">Activations</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 text-center whitespace-nowrap">Status</th>
                                <th className="h-12 px-4 align-middle font-medium text-slate-500 text-center whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-500">Loading...</td>
                                </tr>
                            ) : keys.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-500">
                                        No license keys found. Generate one above.
                                    </td>
                                </tr>
                            ) : (
                                keys.map((k) => {
                                    const effectiveUses = getEffectiveUses(k)
                                    const customerLabel = (k.customer_name || k.demo_customer_name || "").trim()
                                    const computedStatus = getKeyStatus(k, Date.now())
                                    return (
                                    <tr key={k.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50">
                                        <td className="py-4 px-4 align-middle text-slate-600 font-medium tracking-wide">
                                            <div className="font-mono text-sm">{k.key}</div>
                                            {customerLabel ? (
                                                <div className="text-xs text-slate-400 mt-0.5">Customer: {customerLabel}</div>
                                            ) : null}
                                            {renderPlatforms(k)}
                                        </td>
                                        <td className="py-4 px-4 align-middle text-center">
                                            <span className="inline-flex items-center px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-600 text-xs font-medium">
                                                {k.type === "bulk" ? "Bulk" : k.type === "demo" ? "Demo" : "Single use"}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 align-middle text-center text-slate-600 whitespace-nowrap text-sm">
                                            {formatDate(k.created_at)}
                                        </td>
                                        <td className="py-4 px-4 align-middle text-center text-slate-600 whitespace-nowrap text-sm">
                                            {k.type === 'demo' ? '—' : (k.expires_at ? formatDate(k.expires_at) : 'Forever')}
                                        </td>
                                        <td className="py-4 px-4 align-middle text-center text-slate-600 text-sm">
                                            {effectiveUses}/{k.max_uses}
                                        </td>
                                        <td className="py-4 px-4 align-middle text-center">
                                            {computedStatus === "active" ? (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium">
                                                    Active
                                                </span>
                                            ) : computedStatus === "exhausted" ? (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium">
                                                    Exhausted
                                                </span>
                                            ) : computedStatus === "expired" ? (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700 text-xs font-medium">
                                                    Expired
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium">
                                                    Revoked
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-4 px-4 align-middle text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                {/* Copy */}
                                                <button
                                                    title="Copy key"
                                                    onClick={() => handleCopy(k.key)}
                                                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-[var(--brand-purple)] hover:bg-purple-50 transition-colors"
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </button>

                                                {/* Extend expiry — SuperAdmin & Employee only */}
                                                {k.type !== 'demo' && (user?.role === "SuperAdmin" || user?.role === "Employee") && (
                                                    <button
                                                        title="Edit expiry date"
                                                        onClick={() => openExtendModal(k)}
                                                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                    >
                                                        <Calendar className="h-4 w-4" />
                                                    </button>
                                                )}

                                                {/* Enable / Disable */}
                                                <button
                                                    title={k.is_active ? 'Disable key' : 'Enable key'}
                                                    onClick={() => handleToggleActive(k)}
                                                    disabled={togglingId === k.id}
                                                    className={`inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors disabled:opacity-50 ${
                                                        k.is_active
                                                            ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                                    }`}
                                                >
                                                    {togglingId === k.id
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : k.is_active
                                                            ? <PowerOff className="h-4 w-4" />
                                                            : <Power className="h-4 w-4" />
                                                    }
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-slate-100">
                        <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
                        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
                    </div>
                )}
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
                                        const t = e.target.value
                                        setNewType(t)
                                        if (t === "single_use" || t === "demo") {
                                            setNewMaxUses("1")
                                            // Collapse to a single selected platform (prefer windows, else first selected).
                                            setPlatformSel((prev) => {
                                                const firstOn = PLATFORMS.find((p) => prev[p.id].on)?.id ?? "windows"
                                                const keep = prev.windows.on ? "windows" : firstOn
                                                const next: typeof prev = { ...prev }
                                                for (const p of PLATFORMS) next[p.id] = { on: p.id === keep, cap: "1" }
                                                return next
                                            })
                                        }
                                    }}
                                    className="w-full h-12 px-4 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)] text-[var(--brand-purple)] font-medium bg-white appearance-none cursor-pointer"
                                >
                                    <option value="single_use">Single Use (1 Device)</option>
                                    <option value="bulk">Bulk Use (Multi Device)</option>
                                    {(user?.role === "SuperAdmin" || user?.role === "Employee") && <option value="demo">Demo Key (1 Full QC)</option>}
                                </select>
                            </div>

                            {newType !== "demo" && (() => {
                                const isPrivileged = user?.role === "SuperAdmin" || user?.role === "Employee";
                                const hasPerms = user?.allow_monthly_keys || user?.allow_quarterly_keys || user?.allow_6month_keys || user?.allow_yearly_keys || user?.allow_perpetual_keys;
                                
                                if (!isPrivileged && !hasPerms) {
                                    return (
                                        <div className="text-sm text-rose-500 mb-4 p-3 bg-rose-50 rounded-lg">
                                            You do not have permission to generate licenses of this type.
                                        </div>
                                    );
                                }

                                if (isPrivileged) {
                                    return (
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-900 mb-2">
                                                Duration
                                            </label>
                                            <select
                                                value={durationMode}
                                                onChange={(e) => setDurationMode(e.target.value as any)}
                                                className="w-full h-12 px-4 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)] text-[var(--brand-purple)] font-medium bg-white appearance-none cursor-pointer mb-4"
                                            >
                                                <option value="forever">Forever</option>
                                                <option value="temporary">Temporary</option>
                                            </select>

                                            {durationMode === "temporary" && (
                                                <div>
                                                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                                                        Expiration Date
                                                    </label>
                                                    <Input
                                                        type="date"
                                                        value={expiresAt}
                                                        onChange={(e) => setExpiresAt(e.target.value)}
                                                        className="w-full h-12 px-4 text-base border border-slate-200 rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--brand-purple)] text-[var(--brand-purple)] font-medium bg-white"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                // Non-privileged but has perms -> Dropdown of specific durations
                                return (
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                                            Duration
                                        </label>
                                        <select
                                            value={durationMode === "forever" ? "forever" : String(selectedDurationDays)}
                                            onChange={(e) => {
                                                if (e.target.value === "forever") {
                                                    setDurationMode("forever");
                                                } else {
                                                    setDurationMode("temporary");
                                                    setSelectedDurationDays(Number(e.target.value));
                                                }
                                            }}
                                            className="w-full h-12 px-4 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)] text-[var(--brand-purple)] font-medium bg-white appearance-none cursor-pointer mb-4"
                                        >
                                            {user?.allow_perpetual_keys && <option value="forever">Perpetual (Forever)</option>}
                                            {user?.allow_monthly_keys && <option value="30">Monthly (30 Days)</option>}
                                            {user?.allow_quarterly_keys && <option value="90">Quarterly (90 Days)</option>}
                                            {user?.allow_6month_keys && <option value="180">6-Month (180 Days)</option>}
                                            {user?.allow_yearly_keys && <option value="365">Yearly (365 Days)</option>}
                                        </select>
                                    </div>
                                );
                            })()}

                            {(() => {
                                const singleDevice = newType === "single_use" || newType === "demo"
                                return (
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                                            Platforms &amp; device limits
                                        </label>
                                        <p className="mb-3 text-xs text-slate-500">
                                            {newType === "demo"
                                                ? "Demo keys run one full QC on a single device — pick the platform."
                                                : newType === "single_use"
                                                    ? "Single-use keys cover one platform and one device."
                                                    : "Pick each platform this key unlocks and how many devices it allows on that platform."}
                                        </p>
                                        <div className="space-y-2">
                                            {PLATFORMS.map((p) => {
                                                const sel = platformSel[p.id]
                                                const allowed = platformAllowed(p.id)
                                                return (
                                                    <div key={p.id} className={`flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 ${!allowed ? 'opacity-50' : ''}`}>
                                                        <label className={`flex items-center gap-2 flex-1 ${allowed ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={sel.on && allowed}
                                                                disabled={!allowed}
                                                                onChange={() => togglePlatform(p.id)}
                                                                className="h-4 w-4 rounded border-slate-300 text-[var(--brand-purple)] focus:ring-[var(--brand-purple)] disabled:cursor-not-allowed"
                                                            />
                                                            <span className="text-sm font-medium text-slate-700">{p.label}</span>
                                                            {!allowed && <span className="text-[10px] text-slate-400">(not permitted)</span>}
                                                        </label>
                                                        <Input
                                                            type="number"
                                                            inputMode="numeric"
                                                            min={1}
                                                            step={1}
                                                            value={singleDevice ? "1" : sel.cap}
                                                            onChange={(e) => setPlatformCap(p.id, e.target.value)}
                                                            disabled={!sel.on || singleDevice}
                                                            title="Device limit for this platform"
                                                            className="w-24 h-9 px-3 text-sm border border-slate-200 rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--brand-purple)] text-[var(--brand-purple)] font-medium bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                                                        />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                        <div className="mt-3 flex items-center justify-between text-xs">
                                            <span className="text-slate-500">
                                                Scope: {selectedPlatforms.length ? selectedPlatforms.map((p) => p.label).join(", ") : "none selected"}
                                            </span>
                                            <span className="font-semibold text-slate-700">
                                                Total devices: {singleDevice ? (selectedPlatforms.length ? 1 : 0) : totalDevices}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })()}

                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">
                                    Customer Name
                                </label>
                                <Input
                                    type="text"
                                    value={demoCustomerName}
                                    onChange={(e) => setDemoCustomerName(e.target.value)}
                                    placeholder="Acme Retail"
                                    className="w-full h-12 px-4 text-base border border-slate-200 rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--brand-purple)] text-[var(--brand-purple)] font-medium bg-white"
                                />
                                <p className="mt-2 text-xs text-slate-500">
                                    {newType === "demo" ? "Required for demo keys." : "Optional identifier."}
                                </p>
                            </div>

                            <Button
                                className="w-full h-12 mt-6 rounded-xl bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white text-base font-medium transition-colors"
                                onClick={handleGenerate}
                                disabled={isGenerating || (newType !== 'demo' && !(user?.role === 'SuperAdmin' || user?.role === 'Employee') && !(user?.allow_monthly_keys || user?.allow_quarterly_keys || user?.allow_6month_keys || user?.allow_yearly_keys || user?.allow_perpetual_keys))}
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

            {/* EXTEND MODAL */}
            {isExtendModalOpen && extendingLicense && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-[500px] p-8 rounded-2xl shadow-xl relative animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setIsExtendModalOpen(false)}
                            className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="mb-6">
                            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Extend License Key</h2>
                            <p className="text-slate-500 text-base mt-2 font-mono text-xs break-all">
                                {extendingLicense.key}
                            </p>
                        </div>

                        {extendError && (
                            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">
                                {extendError}
                            </div>
                        )}

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-900 mb-2">
                                    Duration
                                </label>
                                <select
                                    value={extendDurationMode}
                                    onChange={(e) => setExtendDurationMode(e.target.value as any)}
                                    className="w-full h-12 px-4 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-purple)] text-[var(--brand-purple)] font-medium bg-white appearance-none cursor-pointer mb-4"
                                >
                                    <option value="forever">Forever</option>
                                    <option value="temporary">Temporary</option>
                                </select>

                                {extendDurationMode === "temporary" && (
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                                            Expiration Date
                                        </label>
                                        <Input
                                            type="date"
                                            value={extendExpiresAt}
                                            onChange={(e) => setExtendExpiresAt(e.target.value)}
                                            className="w-full h-12 px-4 text-base border border-slate-200 rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--brand-purple)] text-[var(--brand-purple)] font-medium bg-white"
                                        />
                                    </div>
                                )}
                            </div>

                            <Button
                                className="w-full h-12 mt-6 rounded-xl bg-[var(--brand-purple)] hover:bg-[var(--brand-purple-hover)] text-white text-base font-medium transition-colors"
                                onClick={handleExtend}
                                disabled={isExtending}
                            >
                                {isExtending ? "Updating..." : "Update Expiry Date"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
