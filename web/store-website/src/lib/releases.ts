import { apiUrl } from "./api-base";
import { config } from "@/data/config";

// The storefront "Download" buttons point at the admin app's STABLE latest
// installer URL (GET /api/updates/windows/download/latest), which always streams
// the newest published Windows release. We deliberately do NOT resolve a concrete
// /download/{id} URL here: that id changes whenever a release is re-uploaded, so
// any ISR-cached page would keep linking to a deleted release ("Release not
// found"). The stable URL resolves "latest" server-side on every click instead.
// Windows-only for now. Falls back to the static config.DOWNLOAD_URL when the API
// base is unset, so the page never breaks.

export async function getWindowsDownloadUrl(): Promise<string> {
  return apiUrl("updates/windows/download/latest") || config.DOWNLOAD_URL;
}
