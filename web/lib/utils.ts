import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

function toDate(value: string | number | Date): Date | null {
    const parsed = value instanceof Date ? value : new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

// Database timestamps are stored as local time (IST) by the desktop app.
export function formatDbDateTime(value: string | number | Date): string {
    const date = toDate(value)
    if (!date) return "-"

    const datePart = date.toLocaleDateString()
    const timePart = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    })

    return `${datePart} ${timePart}`
}

export function formatDbDate(value: string | number | Date): string {
    const date = toDate(value)
    if (!date) return "-"
    return date.toLocaleDateString()
}

export function formatBytes(bytes?: number | null): string {
    if (bytes == null || Number.isNaN(bytes)) return "-"
    const gb = bytes / (1024 * 1024 * 1024)
    const precision = gb >= 100 ? 0 : 1
    return `${gb.toFixed(precision)} GB`
}

export function formatAppVersion(version?: string | null): string {
    if (!version) return "Unknown"
    return version.split("+")[0]
}
