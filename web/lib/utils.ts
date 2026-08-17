import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { APP_TIME_ZONE, parseDbTimestamp } from "./timezone"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const toDate = parseDbTimestamp

type DateInput = string | number | Date | null | undefined

/**
 * Database timestamps are stored in UTC; every formatter below renders them in
 * APP_TIME_ZONE (Asia/Kolkata by default) so the output is identical whatever
 * timezone the server or the viewer's browser happens to be in.
 */
export function formatDbDateTime(value: DateInput, fallback = "-"): string {
    const date = toDate(value)
    if (!date) return fallback

    const datePart = date.toLocaleDateString("en-GB", { timeZone: APP_TIME_ZONE })
    const timePart = date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: APP_TIME_ZONE,
    })

    return `${datePart} ${timePart}`
}

export function formatDbDate(value: DateInput, fallback = "-"): string {
    const date = toDate(value)
    if (!date) return fallback
    return date.toLocaleDateString("en-GB", { timeZone: APP_TIME_ZONE })
}

/** "24 Jul 2026" — the table/report date style used across the dashboard. */
export function formatDateDMY(value: DateInput, fallback = "—"): string {
    const date = toDate(value)
    if (!date) return fallback
    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: APP_TIME_ZONE,
    })
}

/** "1:58 PM" — the table/report time style used across the dashboard. */
export function formatTime12(value: DateInput, fallback = ""): string {
    const date = toDate(value)
    if (!date) return fallback
    return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: APP_TIME_ZONE,
    })
}

/** "24 Jul 2026, 1:58 PM" — for single-line "created / updated at" labels. */
export function formatDateTimeDMY(value: DateInput, fallback = "—"): string {
    const date = toDate(value)
    if (!date) return fallback
    return `${formatDateDMY(date)}, ${formatTime12(date)}`
}

/** "2026-07-24" in APP_TIME_ZONE — for export filenames and date inputs. */
export function toAppZoneDateStamp(value: DateInput = new Date()): string {
    const date = toDate(value)
    if (!date) return ""
    // en-CA gives ISO-ordered YYYY-MM-DD.
    return date.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE })
}

export function formatBytes(bytes?: number | null): string {
    if (bytes == null || Number.isNaN(bytes)) return "-"
    const gb = bytes / (1024 * 1024 * 1024)
    const precision = gb >= 100 ? 0 : 1
    return `${gb.toFixed(precision)} GB`
}

export function formatAppVersion(version?: string | null): string {
    if (!version) return "Unknown"
    return version.split("+")[0]
}

/**
 * Mask a phone number for display, keeping the first 2 and last 2 digits and
 * replacing the rest with 'x' (e.g. 7512345600 → 75xxxxxx00). Non-digits (a
 * leading +country code, spaces) are stripped first so masking stays aligned.
 */
export function maskPhone(phone?: string | null): string {
    if (!phone) return "—"
    const digits = phone.replace(/\D/g, "")
    if (digits.length <= 4) return digits || "—"
    return digits.slice(0, 2) + "x".repeat(digits.length - 4) + digits.slice(-2)
}

function getWindowsClientRelease(build: number): string {
    if (build >= 26100) return '24H2';
    if (build >= 22631) return '23H2';
    if (build >= 22621) return '22H2';
    if (build >= 22000) return '21H2';
    if (build >= 19045) return '22H2';
    if (build >= 19044) return '21H2';
    if (build >= 19043) return '21H1';
    if (build >= 19042) return '20H2';
    if (build >= 19041) return '2004';
    if (build >= 18363) return '1909';
    if (build >= 18362) return '1903';
    if (build >= 17763) return '1809';
    if (build >= 17134) return '1803';
    if (build >= 16299) return '1709';
    if (build >= 15063) return '1703';
    if (build >= 14393) return '1607';
    if (build >= 10586) return '1511';
    if (build >= 10240) return '1507';
    return '';
}

function getWindowsServerRelease(build: number): string {
    if (build >= 26100) return '2025';
    if (build >= 20348) return '2022';
    if (build >= 17763) return '2019';
    if (build >= 14393) return '2016';
    return '';
}

/**
 * Parse the raw Environment.OSVersion string (e.g. "Microsoft Windows NT 10.0.22631.0")
 * and return a friendly edition name and a release version label.
 * Returns null if the string is not a recognised Windows NT version string.
 */
export function parseWindowsVersion(osVersionRaw: string, productNameRaw?: string | null): { edition: string; release: string } | null {
    if (!osVersionRaw) return null;

    // Only attempt Windows parsing for strings that look like NT version strings
    if (!/microsoft windows nt/i.test(osVersionRaw) && !/^\d+\.\d+\.\d+/.test(osVersionRaw)) {
        return null;
    }

    const match = osVersionRaw.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;

    const major = parseInt(match[1], 10);
    const build = parseInt(match[3], 10);
    const productName = productNameRaw || '';
    const isServer = /server/i.test(productName);

    if (isServer) {
        return {
            edition: 'Windows Server',
            release: getWindowsServerRelease(build),
        };
    }

    const winVersion = major === 10 && build >= 22000 ? '11' : '10';

    return {
        edition: `Windows ${winVersion}`,
        release: getWindowsClientRelease(build),
    };
}

export function cleanWindowsProductName(rawName: string, baseEditionFromBuild: string): string {
    if (!rawName) return baseEditionFromBuild;
    
    let cleaned = rawName.replace('Windows(R), ', 'Windows ')
                         .replace('Windows(R) ', 'Windows ')
                         .replace(' edition', '')
                         .trim();
                         
    // Replace "Core" variants with "Home"
    if (cleaned.includes('CoreSingleLanguage')) {
        cleaned = cleaned.replace('CoreSingleLanguage', 'Home Single Language');
    } else if (cleaned.includes('CoreCountrySpecific')) {
        cleaned = cleaned.replace('CoreCountrySpecific', 'Home');
    } else if (cleaned.includes('Core')) {
        cleaned = cleaned.replace('Core', 'Home');
    }
    
    if (cleaned.includes('Professional')) {
        cleaned = cleaned.replace('Professional', 'Pro');
    }

    if (cleaned.includes('ServerDatacenter')) {
        cleaned = cleaned.replace('ServerDatacenter', 'Server Datacenter');
    } else if (cleaned.includes('ServerStandard')) {
        cleaned = cleaned.replace('ServerStandard', 'Server Standard');
    }

    if (cleaned.startsWith('Windows ') && !cleaned.startsWith('Windows Server')) {
        const versionNum = baseEditionFromBuild.replace('Windows ', '');
        if ((versionNum === "10" || versionNum === "11") && !cleaned.includes(`Windows ${versionNum}`)) {
            cleaned = cleaned.replace('Windows ', `Windows ${versionNum} `);
        }
    }
    
    return cleaned;
}

/**
 * Format an OS version string in an OS-neutral way.
 * - Windows NT strings (e.g. "Microsoft Windows NT 10.0.22631.0") are parsed
 *   into a friendly label like "Windows 11 23H2".
 * - All other strings (Linux/macOS pretty names) are returned as-is.
 */
export function formatOsVersion(osVersionRaw?: string | null, productName?: string | null): string {
    if (!osVersionRaw && !productName) return "Unknown";
    const parsed = parseWindowsVersion(osVersionRaw || "", productName);
    if (parsed) {
        const { edition, release } = parsed;
        const finalEdition = productName ? cleanWindowsProductName(productName, edition) : edition;
        if (release) return `${finalEdition} ${release}`;
        return finalEdition || osVersionRaw || "Unknown";
    }
    // Non-Windows: return the OS string directly (e.g. "Ubuntu 22.04.3 LTS", "macOS 14.5")
    return productName || osVersionRaw || "Unknown";
}

/** @deprecated Use formatOsVersion instead */
export function formatWindowsVersion(osVersionRaw?: string | null, productName?: string | null): string {
    return formatOsVersion(osVersionRaw, productName);
}

export function deduplicateAntivirus(status: string | null | undefined): string {
    if (!status) return "";
    const parts = status.split(",").map((s) => s.trim()).filter(Boolean);
    const unique = Array.from(new Set(parts));
    return unique.join(", ");
}
