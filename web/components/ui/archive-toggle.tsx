"use client"

import { Archive, Clock } from "lucide-react"
import { REPORT_RETENTION_DAYS } from "@/lib/shared/domain/retention"

/**
 * Recent / Archive switch for the report lists. Report lists show only the last
 * REPORT_RETENTION_DAYS days by default; everything older lives behind "Archive".
 * Nothing is deleted or moved — this just flips which side of the cutoff the
 * list queries.
 */
export function ArchiveToggle({
    archived,
    onChange,
    className,
}: {
    archived: boolean
    onChange: (next: boolean) => void
    className?: string
}) {
    const base =
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium transition-colors"
    const active = "bg-white text-[var(--brand-purple)] shadow-sm"
    const idle = "text-slate-500 hover:text-slate-800"

    return (
        <div
            className={`inline-flex items-center gap-1 h-10 p-1 rounded-lg bg-slate-100 border border-slate-200 ${className ?? ""}`}
            role="group"
            aria-label="Report age"
        >
            <button
                type="button"
                aria-pressed={!archived}
                onClick={() => onChange(false)}
                className={`${base} ${archived ? idle : active}`}
            >
                <Clock className="h-4 w-4" />
                Last {REPORT_RETENTION_DAYS} days
            </button>
            <button
                type="button"
                aria-pressed={archived}
                onClick={() => onChange(true)}
                className={`${base} ${archived ? active : idle}`}
            >
                <Archive className="h-4 w-4" />
                Archive
            </button>
        </div>
    )
}
