"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

/** Compact page list with ellipses: first, last, current ±1 (e.g. 1 … 4 5 6 … 20). */
function buildPageItems(page: number, totalPages: number): Array<number | "..."> {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const items: Array<number | "..."> = [1]
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    if (start > 2) items.push("...")
    for (let p = start; p <= end; p++) items.push(p)
    if (end < totalPages - 1) items.push("...")
    items.push(totalPages)
    return items
}

export interface PaginationProps {
    page: number
    /** Total page count, or null when unknown (cursor-style lists). */
    totalPages: number | null
    onPageChange: (page: number) => void
    /** Disables every control (e.g. while a page is loading). */
    disabled?: boolean
    /** Whether a next page exists. Only consulted when totalPages is null. */
    hasNext?: boolean
}

/**
 * Numbered pagination with icon-only prev/next buttons. When totalPages is null
 * (cursor-style lists with no known total) it falls back to a "Page N" label and
 * relies on `hasNext` to gate the next button.
 */
export function Pagination({ page, totalPages, onPageChange, disabled = false, hasNext }: PaginationProps) {
    const canPrev = page > 1
    const canNext = totalPages != null ? page < totalPages : !!hasNext

    return (
        <div className="flex items-center gap-1">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page - 1)}
                disabled={!canPrev || disabled}
                className="h-9 w-9 p-0 border-slate-200 text-slate-700"
                aria-label="Previous page"
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>

            {totalPages != null ? (
                buildPageItems(page, totalPages).map((item, idx) =>
                    item === "..." ? (
                        <span key={`ellipsis-${idx}`} className="px-1.5 text-sm text-slate-400 select-none">
                            …
                        </span>
                    ) : (
                        <Button
                            key={item}
                            variant={item === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => onPageChange(item)}
                            disabled={disabled}
                            aria-current={item === page ? "page" : undefined}
                            className={`h-9 w-9 p-0 ${item === page
                                ? "bg-slate-900 hover:bg-slate-800 text-white border-slate-900"
                                : "border-slate-200 text-slate-700"}`}
                        >
                            {item}
                        </Button>
                    )
                )
            ) : (
                <span className="px-2 text-sm font-medium text-slate-700">Page {page}</span>
            )}

            <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page + 1)}
                disabled={!canNext || disabled}
                className="h-9 w-9 p-0 border-slate-200 text-slate-700"
                aria-label="Next page"
            >
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    )
}
