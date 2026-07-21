"use client"

import { useBranding } from "@/components/branding-provider"

/**
 * The configured brand wordmark.
 *
 * Deliberately a plain <img> rather than next/image: an admin-uploaded logo
 * lives on whatever object-storage/CDN host the deployment is configured with,
 * and next/image would reject any host not listed in next.config remotePatterns.
 * Logos are a few KB, so the optimizer buys nothing here.
 */
export function BrandLogo({ className = "w-auto h-8 object-contain" }: { className?: string }) {
    const { logoUrl, siteName } = useBranding()
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={`${siteName} logo`} className={className} />
}

/** The login/register illustration, likewise admin-replaceable. */
export function BrandLoginImage({ className }: { className?: string }) {
    const { loginImageUrl, siteName } = useBranding()
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={loginImageUrl} alt={`${siteName} device testing illustration`} className={className} />
}
