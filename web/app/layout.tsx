import type { Metadata } from "next"
import { headers } from "next/headers"
import { AuthProvider } from "@/components/auth-provider"
import { BrandingProvider } from "@/components/branding-provider"
import { hostFromHeaders } from "@/lib/shared/branding-host"
import { getBrandingForHost } from "@/lib/shared/services/reseller-branding.service"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

// Branding is read from the database per render, so pages must not be baked at
// build time — otherwise a logo/name change would only appear on redeploy, and
// the host-based reseller theme could not be resolved at all. The dashboard
// fetches all its data client-side anyway, so nothing static is lost.
export const dynamic = "force-dynamic"

/** Branding for the host this request arrived on. */
async function requestBranding() {
  return getBrandingForHost(hostFromHeaders(await headers()))
}

// Tab title and icon follow the white-label branding set in System Settings.
export async function generateMetadata(): Promise<Metadata> {
  const branding = await requestBranding()
  return {
    title: branding.siteName,
    ...(branding.faviconUrl ? { icons: { icon: branding.faviconUrl } } : {}),
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Resolved server-side so the first paint is already the right brand — no
  // flash of the platform logo, and anonymous visitors get it too.
  const branding = await requestBranding()

  return (
    // The two custom properties every brand-coloured class in the app reads.
    // Setting them here rather than from an effect means the theme is part of
    // the server-rendered HTML: correct before any JavaScript runs.
    <html
      lang="en"
      style={{
        "--brand-purple": branding.primaryColor,
        "--brand-purple-hover": branding.primaryColorHover,
      } as React.CSSProperties}
    >
      <body className={inter.className}>
        <BrandingProvider value={branding}>
          <AuthProvider>
            {children}
          </AuthProvider>
        </BrandingProvider>
      </body>
    </html>
  )
}
