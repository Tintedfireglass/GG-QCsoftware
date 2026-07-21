"use client"

import React, { createContext, useContext } from "react"
import type { Branding } from "@/lib/shared/services/branding.service"

export { verifyUrl, customerPortalUrl } from "@/lib/shared/branding-links"

/**
 * White-label branding for client components (sidebar, auth pages, reports).
 *
 * The value is resolved server-side in the root layout and handed down as a
 * prop — no client fetch, so the brand name and logo are correct in the first
 * paint instead of flashing the default and swapping.
 */
const BrandingContext = createContext<Branding | null>(null)

export function BrandingProvider({ value, children }: { value: Branding; children: React.ReactNode }) {
    return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding(): Branding {
    const value = useContext(BrandingContext)
    if (!value) throw new Error("useBranding must be used within <BrandingProvider>")
    return value
}
