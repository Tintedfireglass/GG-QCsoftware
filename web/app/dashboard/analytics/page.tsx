"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { getAnalyticsOverview, AnalyticsOverview } from "@/lib/api"
import { Users, MousePointerClick, Eye, LogOut, TrendingUp, Loader2 } from "lucide-react"
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell,
} from "recharts"

const RANGES = [
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
    { key: "90d", label: "90 days" },
]

const PIE_COLORS = ["#7c3aed", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe", "#f5f3ff"]

function KpiCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Icon className="h-4 w-4" /> {label}
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{value}</div>
            {sub ? <div className="text-xs text-slate-400 mt-0.5">{sub}</div> : null}
        </div>
    )
}

function BreakdownList({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
    const max = Math.max(1, ...rows.map((r) => r.value))
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
            {rows.length === 0 ? (
                <p className="text-sm text-slate-400">No data yet.</p>
            ) : (
                <div className="space-y-2">
                    {rows.map((r, i) => (
                        <div key={i}>
                            <div className="flex items-center justify-between text-sm mb-0.5">
                                <span className="text-slate-700 truncate pr-2">{r.label}</span>
                                <span className="text-slate-500 tabular-nums">{r.value.toLocaleString()}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full bg-[var(--brand-purple)]" style={{ width: `${(r.value / max) * 100}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function AnalyticsPage() {
    const { user } = useAuth()
    const router = useRouter()

    const [range, setRange] = useState("30d")
    const [data, setData] = useState<AnalyticsOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            setData(await getAnalyticsOverview(range))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load analytics")
        } finally {
            setLoading(false)
        }
    }, [range])

    useEffect(() => {
        if (!user) { router.push("/login"); return }
        if (user.role !== "SuperAdmin") { router.push("/dashboard"); return }
        fetchData()
    }, [user, router, fetchData])

    const fmtDay = (d: string) => {
        const dt = new Date(d)
        return `${dt.getDate()}/${dt.getMonth() + 1}`
    }

    const k = data?.kpis
    const f = data?.funnel
    const convRate = f && f.visitors > 0 ? Math.round((f.purchases / f.visitors) * 1000) / 10 : 0

    return (
        <div className="space-y-6 max-w-[1200px]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Visitor analytics</h1>
                    <p className="text-slate-500 text-sm mt-1">Storefront traffic, sources, devices, and conversion. Bots excluded.</p>
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                    {RANGES.map((r) => (
                        <button key={r.key} onClick={() => setRange(r.key)}
                            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${range === r.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{error}</div>}

            {loading || !data ? (
                <div className="p-12 text-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
            ) : (
                <>
                    {/* KPI cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <KpiCard icon={Users} label="Visitors" value={k!.visitors.toLocaleString()} />
                        <KpiCard icon={MousePointerClick} label="Sessions" value={k!.sessions.toLocaleString()} />
                        <KpiCard icon={Eye} label="Pageviews" value={k!.pageviews.toLocaleString()} />
                        <KpiCard icon={TrendingUp} label="Pages / session" value={k!.pagesPerSession} />
                        <KpiCard icon={LogOut} label="Bounce rate" value={`${k!.bounceRate}%`} />
                        <KpiCard icon={MousePointerClick} label="Events" value={k!.events.toLocaleString()} />
                    </div>

                    {/* Traffic over time */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="text-sm font-semibold text-slate-900 mb-4">Traffic over time</h3>
                        <div style={{ width: "100%", height: 280 }}>
                            <ResponsiveContainer>
                                <AreaChart data={data.timeseries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gPv" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gVis" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="pageviews" name="Pageviews" stroke="#7c3aed" fill="url(#gPv)" strokeWidth={2} />
                                    <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#10b981" fill="url(#gVis)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Conversion funnel */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="text-sm font-semibold text-slate-900 mb-4">Conversion funnel</h3>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-2xl font-bold text-slate-900">{f!.visitors.toLocaleString()}</div>
                                <div className="text-xs text-slate-500 mt-1">Visitors</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-slate-900">{f!.checkoutStarted.toLocaleString()}</div>
                                <div className="text-xs text-slate-500 mt-1">Checkout started</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-emerald-600">{f!.purchases.toLocaleString()}</div>
                                <div className="text-xs text-slate-500 mt-1">Purchases · {convRate}% conv.</div>
                            </div>
                        </div>
                    </div>

                    {/* Pages + sources */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <BreakdownList title="Top pages" rows={data.topPages.map((p) => ({ label: p.path, value: p.views }))} />
                        <BreakdownList title="Top sources" rows={data.sources.map((s) => ({ label: s.source, value: s.sessions }))} />
                    </div>

                    {/* Devices pie + browsers/os */}
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl border border-slate-200 p-5">
                            <h3 className="text-sm font-semibold text-slate-900 mb-3">Devices</h3>
                            {data.devices.length === 0 ? (
                                <p className="text-sm text-slate-400">No data yet.</p>
                            ) : (
                                <div style={{ width: "100%", height: 200 }}>
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie data={data.devices} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e) => e.name}>
                                                {data.devices.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                        <BreakdownList title="Browsers" rows={data.browsers.map((b) => ({ label: b.name, value: b.value }))} />
                        <BreakdownList title="Operating systems" rows={data.os.map((o) => ({ label: o.name, value: o.value }))} />
                    </div>

                    {/* Countries + events */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <BreakdownList title="Countries" rows={data.countries.map((c) => ({ label: c.name, value: c.value }))} />
                        <BreakdownList title="Custom events" rows={data.topEvents.map((e) => ({ label: e.name, value: e.count }))} />
                    </div>
                </>
            )}
        </div>
    )
}
