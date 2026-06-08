/**
 * Deterministic hardware fingerprint from serial + MAC + hostname.
 * Must match LaptopQC.App/Services/DeviceIdentityService.cs (same field order).
 */
export function buildFingerprint(serial: string, mac?: string, hostname?: string): string {
    const parts: string[] = [serial.trim().toUpperCase()];
    if (mac) parts.push(mac.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
    if (hostname) parts.push(hostname.trim().toUpperCase());
    return parts.join('|');
}

export function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
