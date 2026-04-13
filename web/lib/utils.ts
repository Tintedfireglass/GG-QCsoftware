import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

function toDate(value: string | number | Date): Date | null {
    const parsed = value instanceof Date ? value : new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

// Database timestamps are stored as local time (IST) by the desktop app.
export function formatDbDateTime(value: string | number | Date): string {
    const date = toDate(value)
    if (!date) return "-"

    const datePart = date.toLocaleDateString()
    const timePart = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    })

    return `${datePart} ${timePart}`
}

export function formatDbDate(value: string | number | Date): string {
    const date = toDate(value)
    if (!date) return "-"
    return date.toLocaleDateString()
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
 * Parse the raw Environment.OSVersion string (e.g. "Microsoft Windows NT 10.0.22631.0")
 * and return a friendly edition name and a release version label.
 */
export function parseWindowsVersion(osVersionRaw: string): { edition: string; release: string } {
    if (!osVersionRaw) return { edition: '', release: '' };

    // Extract build number from strings like "Microsoft Windows NT 10.0.22631.0"
    const match = osVersionRaw.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return { edition: osVersionRaw, release: '' };

    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const build = parseInt(match[3], 10);

    // Determine Windows 10 vs 11: build >= 22000 is Windows 11
    const winVersion = (major === 10 && build >= 22000) ? '11' : '10';

    // Map build numbers to release versions
    const buildToRelease: Record<number, string> = {
        // Windows 10
        10240: '1507', 10586: '1511', 14393: '1607', 15063: '1703',
        16299: '1709', 17134: '1803', 17763: '1809', 18362: '1903',
        18363: '1909', 19041: '2004', 19042: '20H2', 19043: '21H1',
        19044: '21H2', 19045: '22H2',
        // Windows 11
        22000: '21H2', 22621: '22H2', 22631: '23H2', 26100: '24H2',
    };

    const release = buildToRelease[build] || '';
    const edition = `Windows ${winVersion}`;

    return { edition, release };
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

export function formatWindowsVersion(osVersionRaw?: string | null, productName?: string | null): string {
    if (!osVersionRaw && !productName) return "Unknown";
    const { edition, release } = parseWindowsVersion(osVersionRaw || "");
    const finalEdition = productName ? cleanWindowsProductName(productName, edition) : edition;
    if (release) return `${finalEdition} ${release}`;
    return finalEdition || "Unknown";
}
