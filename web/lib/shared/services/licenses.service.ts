import { db } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { AppError, ValidationError, ForbiddenError, NotFoundError } from '@/lib/http/errors';
import { GenerateLicenseInput, ToggleLicenseInput } from '@/lib/shared/domain/schemas/licenses';
import * as repo from '@/lib/shared/repositories/licenses.repo';

const VALID_TYPES = ['single_use', 'bulk', 'demo'];
const VALID_PLATFORMS = ['windows', 'android', 'ios', 'mac'];

/**
 * Resolve the multi-product fields from the request. Rules:
 *  - platform_caps given  → authoritative: scope = its keys, maxUses = sum of values.
 *  - single-platform scope → caps = { [platform]: maxUses }.
 *  - multi-platform scope w/o caps → rejected (cap per platform is required).
 *  - nothing given        → { windows }, caps = { windows: maxUses }.
 */
function resolveProductFields(
    productScope: string[] | null | undefined,
    platformCaps: Record<string, number> | null | undefined,
    fallbackMaxUses: number,
): { productScope: string[]; platformCaps: Record<string, number>; maxUses: number } {
    if (platformCaps && Object.keys(platformCaps).length > 0) {
        const platforms = Object.keys(platformCaps);
        for (const p of platforms) {
            if (!VALID_PLATFORMS.includes(p)) throw new ValidationError(`Unknown platform: ${p}`);
            if (!Number.isInteger(platformCaps[p]) || platformCaps[p] < 1) {
                throw new ValidationError(`platform_caps.${p} must be a positive integer`);
            }
        }
        const maxUses = platforms.reduce((sum, p) => sum + platformCaps[p], 0);
        return { productScope: platforms, platformCaps, maxUses };
    }

    const scope = productScope && productScope.length > 0 ? productScope : ['windows'];
    for (const p of scope) {
        if (!VALID_PLATFORMS.includes(p)) throw new ValidationError(`Unknown platform: ${p}`);
    }
    if (scope.length > 1) {
        throw new ValidationError('platform_caps is required when a key covers multiple platforms');
    }
    return { productScope: scope, platformCaps: { [scope[0]]: fallbackMaxUses }, maxUses: fallbackMaxUses };
}

/** Demo keys: one full QC run on a single device, on any one chosen platform. */
function resolveDemoFields(
    productScope: string[] | null | undefined,
    platformCaps: Record<string, number> | null | undefined,
): { productScope: string[]; platformCaps: Record<string, number>; maxUses: number } {
    const platforms = platformCaps && Object.keys(platformCaps).length > 0
        ? Object.keys(platformCaps)
        : (productScope && productScope.length > 0 ? productScope : ['windows']);
    if (platforms.length !== 1) {
        throw new ValidationError('Demo keys target exactly one platform');
    }
    const p = platforms[0];
    if (!VALID_PLATFORMS.includes(p)) throw new ValidationError(`Unknown platform: ${p}`);
    return { productScope: [p], platformCaps: { [p]: 1 }, maxUses: 1 };
}

/** 16-char grouped key, excluding ambiguous chars (0/O/1/I). */
function generateRandomKey(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export async function listLicenses(
    user: AuthenticatedUser,
    q: { search?: string; status?: string; sort?: string; page?: number; limit?: number } = {}
) {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 100);
    const page = Math.max(q.page ?? 1, 1);
    const offset = (page - 1) * limit;
    const search = q.search?.trim() || undefined;
    const status = q.status && q.status !== 'all' ? q.status : undefined;
    const sort = q.sort || undefined;

    const [keys, total] = await Promise.all([
        repo.listLicenses(user, { search, status, sort, limit, offset }),
        repo.countLicenses(user, { search, status }),
    ]);
    return { keys, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function generateLicense(user: AuthenticatedUser, input: GenerateLicenseInput) {
    const { type, max_uses, expires_at, demo_customer_name, product_scope, platform_caps } = input;

    if (!type || !VALID_TYPES.includes(type)) {
        throw new ValidationError('Invalid input parameters');
    }
    if (type === 'demo' && user.role !== 'SuperAdmin' && user.role !== 'Employee') {
        throw new ForbiddenError('Only SuperAdmin and Employee users can generate demo keys');
    }

    // Demo keys: single device + single run on one chosen platform. Other types: per-platform caps.
    const resolved = type === 'demo'
        ? resolveDemoFields(product_scope, platform_caps)
        : resolveProductFields(product_scope, platform_caps, max_uses ?? 0);

    // Employees may generate non-demo keys only for the platforms SuperAdmin assigned them.
    if (user.role === 'Employee' && type !== 'demo') {
        const allowed = await repo.getEmployeeAllowedPlatforms(user.id);
        const blocked = resolved.productScope.filter((p) => !allowed.includes(p));
        if (blocked.length > 0) {
            throw new ForbiddenError(`You are not permitted to generate ${blocked.join(', ')} license keys`);
        }
    }

    const { maxUses } = resolved;
    if (!maxUses || maxUses < 1) {
        throw new ValidationError('Invalid input parameters');
    }
    if (type === 'demo' && !demo_customer_name?.trim()) {
        throw new ValidationError('Customer name is required for demo keys');
    }

    const assignedKey = generateRandomKey();

    const key = await db.transaction(async (tx) => {
        // Non-SuperAdmins spend license credits (demo keys are free). Employees
        // generate on SuperAdmin's behalf, so their keys are free too.
        if (user.role !== 'SuperAdmin' && user.role !== 'Employee' && type !== 'demo') {
            const credits = await repo.getUserCredits(tx, user.id);
            if (credits < maxUses) {
                throw new AppError(
                    403,
                    'Credit Error',
                    `Insufficient license credits. You have ${credits} credits, but requested ${maxUses} uses.`
                );
            }
            await repo.deductCredits(tx, user.id, maxUses);
        }

        return repo.insertLicenseKey(tx, {
            key: assignedKey,
            type,
            maxUses,
            createdBy: user.id,
            expiresAt: expires_at ? new Date(expires_at) : null,
            demoCustomerName: demo_customer_name?.trim() || null,
            demoMaxRuns: type === 'demo' ? 1 : null,
            productScope: resolved.productScope,
            platformCaps: resolved.platformCaps,
        });
    });

    return { message: 'License key generated successfully', key };
}

export async function toggleLicense(user: AuthenticatedUser, input: ToggleLicenseInput) {
    const updated = await db.transaction((tx) =>
        repo.toggleActiveWithAudit(tx, {
            id: input.id,
            isActive: input.is_active,
            performedBy: user.id,
            restrictToCreator: user.role === 'SuperAdmin' ? null : user.id,
        })
    );

    if (!updated) {
        throw new NotFoundError('License key not found or not permitted');
    }
    return { message: 'License key updated', key: updated };
}
