export function generateRandomLicenseKey(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function getPlanPriceCents(plan: 'monthly' | 'yearly' | 'lifetime'): number {
    const monthly = parseInt(process.env.B2C_PLAN_MONTHLY_CENTS || '9900', 10);
    const yearly = parseInt(process.env.B2C_PLAN_YEARLY_CENTS || '99900', 10);
    const lifetime = parseInt(process.env.B2C_PLAN_LIFETIME_CENTS || '299900', 10);

    if (plan === 'yearly') return yearly;
    if (plan === 'lifetime') return lifetime;
    return monthly;
}

export function getPlanExpiry(plan: 'monthly' | 'yearly' | 'lifetime'): Date | null {
    if (plan === 'lifetime') return null;

    const now = new Date();
    if (plan === 'yearly') {
        now.setFullYear(now.getFullYear() + 1);
    } else {
        now.setMonth(now.getMonth() + 1);
    }
    return now;
}
