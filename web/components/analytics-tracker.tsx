"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { trackPageview } from "@/lib/analytics-client"

/** Fires a pageview on mount and on every client-side route change. Render once
 *  inside the storefront layout. Renders nothing. */
export function AnalyticsTracker() {
    const pathname = usePathname()
    useEffect(() => {
        trackPageview()
    }, [pathname])
    return null
}
