"use client"

import React, { createContext, useContext } from "react"
import type { Branding } from "@/lib/shared/services/branding.service"

export { verifyUrl, customerPortalUrl } from "@/lib/shared/branding-links"

/**
 * White-label branding for client components (sidebar, auth pages, reports).
 *
 * The value is resolved server-side in the root layout — from the request's
 * host, so a reseller's assigned domain serves that reseller's logo and colour
 * and every other host serves the platform's — and handed down as a prop. No
 * client fetch and no session lookup, so the brand is correct in the first paint
 * even for anonymous visitors scanning a certificate QR code.
 *
 * The primary colour reaches the UI as the `--brand-purple` /
 * `--brand-purple-hover` custom properties, set on <html> by the same layout;
 * every button, link, active state and sidebar highlight already reads them.
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
