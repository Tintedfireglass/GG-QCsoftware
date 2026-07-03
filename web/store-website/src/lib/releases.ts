import { apiUrl } from "./api-base";
import { config } from "@/data/config";

// The storefront "Download" button resolves the newest published installer per
// platform/architecture from the admin update API. Each option points at the
// admin app's STABLE latest URL (GET /api/updates/{platform}/download/latest?arch=…),
// which resolves "latest" server-side on every click — we deliberately never bake
// a concrete /download/{id} URL, since that id changes on every re-upload and any
// ISR-cached page would then link to a deleted release ("Release not found").
//
// We probe each candidate's /latest manifest so the dropdown only ever shows
// builds that are actually published. Falls back to the static config.DOWNLOAD_URL
// when the API base is unset, so the page never breaks.

export interface DownloadOption {
  /** User-facing label, e.g. "macOS (Apple Silicon)". */
  label: string;
  /** Where the download button/link points. */
  url: string;
  platform: string;
  arch: string;
  /** Published version, when known (from the manifest). */
  version?: string;
  /** Release channel this build came from ("stable", "beta", …). */
  channel?: string;
  /** "file" = direct installer download, "store" = external store link. */
  kind: "file" | "store";
}

// User-facing choices, in display order. Each maps to a (platform, arch) the
// update API understands. A client's arch also matches "universal" builds
// server-side, so a single universal mac/win build still satisfies both entries.
const CANDIDATES: { platform: string; arch: string; label: string }[] = [
  { platform: "windows", arch: "x64", label: "Windows (64-bit)" },
  { platform: "windows", arch: "arm64", label: "Windows (ARM64)" },
  { platform: "mac", arch: "arm64", label: "macOS (Apple Silicon)" },
  { platform: "mac", arch: "x64", label: "macOS (Intel)" },
  { platform: "linux", arch: "x64", label: "Linux (64-bit)" },
  { platform: "linux", arch: "arm64", label: "Linux (ARM64)" },
];

// Channels to offer downloads from, in preference order. A build published on
// "stable" wins over the same platform/arch on "beta". We probe beta too so
// pre-release desktop builds (e.g. the current mac/linux betas) still surface on
// the storefront instead of silently vanishing because only Windows is stable.
const CHANNELS = ["stable", "beta"] as const;

interface Manifest {
  version?: string;
  kind?: "file" | "store";
  url?: string | null;
}

/**
 * Discover every published build the storefront can offer. Probes each
 * candidate's /latest manifest in parallel; a 404 (nothing published for that
 * platform/arch) simply drops the option. Cached ~5 min via ISR so we don't
 * hammer the API on every render.
 */
export async function getDownloadOptions(): Promise<DownloadOption[]> {
  // No API base configured → single static fallback, page still works.
  if (!apiUrl("updates/windows/latest")) {
    return [{ label: "Download", url: config.DOWNLOAD_URL, platform: "windows", arch: "x64", kind: "file" }];
  }

  const results = await Promise.all(
    CANDIDATES.map(async (c): Promise<DownloadOption | null> => {
      // Try each channel in preference order; first published build wins.
      for (const channel of CHANNELS) {
        try {
          const res = await fetch(
            apiUrl(`updates/${c.platform}/latest?arch=${c.arch}&channel=${channel}`),
            { next: { revalidate: 300 } },
          );
          if (!res.ok) continue;
          const m: Manifest = await res.json();
          // Store-pointer builds link to the external store; hosted builds use our
          // stable per-arch download endpoint (resolves "latest" on the same channel).
          const isStore = m.kind === "store";
          const url = isStore
            ? (m.url ?? config.DOWNLOAD_URL)
            : apiUrl(`updates/${c.platform}/download/latest?arch=${c.arch}&channel=${channel}`);
          return {
            label: c.label,
            url,
            platform: c.platform,
            arch: c.arch,
            version: m.version,
            channel,
            kind: isStore ? ("store" as const) : ("file" as const),
          };
        } catch {
          // try next channel
        }
      }
      return null;
    }),
  );

  const options = results.filter((o): o is DownloadOption => o !== null);
  // If nothing is published yet, keep the button usable with the static URL.
  if (options.length === 0) {
    return [{ label: "Download", url: config.DOWNLOAD_URL, platform: "windows", arch: "x64", kind: "file" }];
  }
  return options;
}

/** Newest Windows installer URL — kept for callers that need a single link. */
export async function getWindowsDownloadUrl(): Promise<string> {
  return apiUrl("updates/windows/download/latest") || config.DOWNLOAD_URL;
}
