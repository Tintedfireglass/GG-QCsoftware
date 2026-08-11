import type { MetadataRoute } from "next";

// Must match `siteUrl` in layout.tsx (metadataBase).
const siteUrl = "https://pramaan.gadgetguruz.com";

// Bump when a page's content meaningfully changes. Kept as a constant rather
// than `new Date()` so lastModified doesn't churn on every build/deploy.
const lastModified = new Date("2026-08-11");

// /checkout is deliberately absent — it sets robots noindex/nofollow.
const routes: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/enterprise-license", changeFrequency: "monthly", priority: 0.8 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/delete-account", changeFrequency: "yearly", priority: 0.4 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms-conditions", changeFrequency: "yearly", priority: 0.3 },
  { path: "/eula", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map(({ path, changeFrequency, priority }) => ({
    url: `${siteUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
