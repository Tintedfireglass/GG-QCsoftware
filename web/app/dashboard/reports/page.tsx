"use client"

import { useState } from "react"
import { Monitor, Smartphone } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { cn } from "@/lib/utils"
import { ResultsView } from "../results/results-view"
import { MobileReportsView } from "../mobile-reports/mobile-reports-view"

type Tab = "pc" | "mobile"

// Roles allowed to view B2C mobile reports (mirrors the backend /api/admin/mobile-reports scope).
const MOBILE_ROLES = ["SuperAdmin", "Reseller", "Refurbisher", "Enterprise", "OEM", "Insurer"]

export default function ReportsPage() {
    const { user } = useAuth()
    const canViewMobile = !!user && MOBILE_ROLES.includes(user.role)
    const [tab, setTab] = useState<Tab>("pc")

    const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { key: "pc", label: "PC QC", icon: Monitor },
        ...(canViewMobile ? [{ key: "mobile" as Tab, label: "Mobile", icon: Smartphone }] : []),
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reports</h1>
                <p className="text-slate-500 text-sm mt-1">
                    All quality-check reports in one place — desktop QC and Android mobile reports.
                </p>
            </div>

            {/* Source switch */}
            <div className="flex items-center gap-1 border-b border-slate-200">
                {tabs.map((t) => {
                    const Icon = t.icon
                    const active = tab === t.key
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={cn(
                                "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                                active
                                    ? "border-[var(--brand-purple)] text-[var(--brand-purple)]"
                                    : "border-transparent text-slate-500 hover:text-slate-800"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {/* Keep both mounted so each tab preserves its filters/page; just toggle visibility. */}
            <div className={tab === "pc" ? "" : "hidden"}>
                <ResultsView embedded />
            </div>
            {canViewMobile && (
                <div className={tab === "mobile" ? "" : "hidden"}>
                    <MobileReportsView embedded />
                </div>
            )}
        </div>
    )
}
