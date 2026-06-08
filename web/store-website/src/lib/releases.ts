import { apiUrl } from "./api-base";
import { config } from "@/data/config";

// Resolve the app's download link from the admin app's update API
// (GET /api/updates/windows/latest) so the storefront's "Download" buttons
// always point at the newest published Windows installer. Windows-only for now.
// Falls back to the static config.DOWNLOAD_URL if the API base is unset or the
// call fails, so the page never breaks.

export async function getWindowsDownloadUrl(): Promise<string> {
  const endpoint = apiUrl("updates/windows/latest");
  if (!endpoint) return config.DOWNLOAD_URL;

  try {
    // Cache for 5 min (ISR) — a new upload shows up within the window.
    const res = await fetch(endpoint, { next: { revalidate: 300 } });
    if (!res.ok) return config.DOWNLOAD_URL;

    const data = await res.json();
    // Hosted installer → use its download URL; otherwise fall back.
    if (data?.kind === "file" && typeof data?.url === "string" && data.url) {
      return data.url;
    }
    return config.DOWNLOAD_URL;
  } catch {
    return config.DOWNLOAD_URL;
  }
}
