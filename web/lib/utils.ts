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
 */
export function parseWindowsVersion(osVersionRaw: string, productNameRaw?: string | null): { edition: string; release: string } {
    if (!osVersionRaw) return { edition: '', release: '' };

    const match = osVersionRaw.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return { edition: osVersionRaw, release: '' };

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

export function formatWindowsVersion(osVersionRaw?: string | null, productName?: string | null): string {
    if (!osVersionRaw && !productName) return "Unknown";
    const { edition, release } = parseWindowsVersion(osVersionRaw || "", productName);
    const finalEdition = productName ? cleanWindowsProductName(productName, edition) : edition;
    if (release) return `${finalEdition} ${release}`;
    return finalEdition || "Unknown";
}
