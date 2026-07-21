import { ValidationError } from '@/lib/http/errors';

export interface PlanPricingInput {
    price_cents: number;
    product_scope: string[];
    platform_caps: Record<string, number>;
}

export interface ResolvedPricing {
    amountCents: number;
    productScope: string[];
    platformCaps: Record<string, number>;
    totalDevices: number;
}

/**
 * Resolve the charged amount and the minted key's entitlement for a plan purchase.
 *
 * Two mutually exclusive modes:
 *  - platformCaps given → the buyer chose device counts per platform (store checkout).
 *    Price is per-device, derived from the plan's bundle: unit = price_cents / baseTotal,
 *    total = round(price_cents × chosenDevices / baseTotal). Platforms must be within the
 *    plan's product_scope; zero-count platforms are dropped from the key.
 *  - otherwise → legacy uniform quantity: every plan cap × quantity, price × quantity.
 */
export function computePlanPricing(
    plan: PlanPricingInput,
    opts: { quantity?: number; platformCaps?: Record<string, number> | null },
): ResolvedPricing {
    const baseTotal = Object.values(plan.platform_caps).reduce((a, b) => a + b, 0) || 1;

    if (opts.platformCaps && Object.keys(opts.platformCaps).length > 0) {
        const caps: Record<string, number> = {};
        for (const [platform, count] of Object.entries(opts.platformCaps)) {
            if (!plan.product_scope.includes(platform)) {
                throw new ValidationError(`This plan does not cover the ${platform} platform`);
            }
            if (!Number.isInteger(count) || count < 0) {
                throw new ValidationError(`Invalid device count for ${platform}`);
            }
            if (count > 0) caps[platform] = count;
        }
        const totalDevices = Object.values(caps).reduce((a, b) => a + b, 0);
        if (totalDevices < 1) {
            throw new ValidationError('Select at least one device to purchase');
        }
        // Scale the bundle price linearly by device count; exact at the base bundle.
        const amountCents = Math.round((plan.price_cents * totalDevices) / baseTotal);
        return { amountCents, productScope: Object.keys(caps), platformCaps: caps, totalDevices };
    }

    const qty = Math.max(1, Math.floor(opts.quantity || 1));
    const scaledCaps: Record<string, number> = {};
    for (const [platform, cap] of Object.entries(plan.platform_caps)) scaledCaps[platform] = cap * qty;
    const totalDevices = Object.values(scaledCaps).reduce((a, b) => a + b, 0) || 1;
    return {
        amountCents: plan.price_cents * qty,
        productScope: plan.product_scope,
        platformCaps: scaledCaps,
        totalDevices,
    };
}
