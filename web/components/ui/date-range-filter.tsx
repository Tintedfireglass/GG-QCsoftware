"use client"

import { Input } from "@/components/ui/input"

/**
 * From/To date-range picker used by the dashboard list filters. Emits the full
 * { startDate, endDate } pair on every change so callers can apply both at once.
 * Values are "YYYY-MM-DD" strings (native date inputs); "" means unset.
 */
export function DateRangeFilter({
    startDate,
    endDate,
    onChange,
    className,
}: {
    startDate: string
    endDate: string
    onChange: (next: { startDate: string; endDate: string }) => void
    className?: string
}) {
    return (
        <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
            <Input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => onChange({ startDate: e.target.value, endDate })}
                className="h-10 w-[150px] border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                aria-label="From date"
            />
            <span className="text-slate-400 text-sm">–</span>
            <Input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => onChange({ startDate, endDate: e.target.value })}
                className="h-10 w-[150px] border-slate-200 focus-visible:ring-[var(--brand-purple)]"
                aria-label="To date"
            />
            {(startDate || endDate) && (
                <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-900 px-1"
                    onClick={() => onChange({ startDate: "", endDate: "" })}
                    aria-label="Clear date range"
                >
                    Clear
                </button>
            )}
        </div>
    )
}
