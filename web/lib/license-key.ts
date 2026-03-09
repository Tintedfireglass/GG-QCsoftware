export function generateRandomLicenseKey(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function getPlanPriceCents(): number {
    return parseInt(process.env.B2C_ONE_TIME_CENTS || '9900', 10);
}

export function getPlanExpiry(): Date | null {
    return null;
}
