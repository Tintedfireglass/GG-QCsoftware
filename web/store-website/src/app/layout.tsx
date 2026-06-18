import type { Metadata } from "next";
import AnalyticsTracker from "@/components/AnalyticsTracker";

// Global styles — order matters: Bootstrap first, then Font Awesome, then the
// site's custom stylesheet so it overrides Bootstrap (same order as the PHP site).
import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./style.css";

const defaultTitle = "Pramaan – Electronics Lifecycle Intelligence Platform";
const defaultDescription =
  "Standardized testing, certification and device intelligence for repair, refurbishment, insurance and asset management.";
const defaultKeywords =
  "laptop diagnostic software, device health testing software, hardware testing software, laptop QC testing tool, device lifecycle analytics, laptop performance testing, hardware diagnostics tool, refurbished device testing, IT asset testing software";
const siteUrl = "https://pramaan.gadgetguruz.com";
const previewImage = `${siteUrl}/assets/images/pramaan-preview.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: defaultTitle,
  description: defaultDescription,
  keywords: defaultKeywords,
  authors: [{ name: "GadgetGuruz" }],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/assets/images/favicon-16x16.png", sizes: "16x16", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "Pramaan",
    title: defaultTitle,
    description: defaultDescription,
    url: siteUrl,
    images: [{ url: previewImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: [previewImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <AnalyticsTracker />
      </body>
    </html>
  );
}
