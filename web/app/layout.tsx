import type { Metadata } from "next"
import { AuthProvider } from "@/components/auth-provider"
import { BrandingProvider } from "@/components/branding-provider"
import { getBranding } from "@/lib/shared/services/branding.service"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

// Branding is read from the database per render, so pages must not be baked at
// build time — otherwise a logo/name change would only appear on redeploy. The
// dashboard fetches all its data client-side anyway, so nothing static is lost.
export const dynamic = "force-dynamic"

// Tab title and icon follow the white-label branding set in System Settings.
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding()
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
  // Resolved server-side so client components paint the right brand on the
  // first render instead of flashing the default logo and swapping.
  const branding = await getBranding()

  return (
    <html lang="en">
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
