import { createHash, randomBytes } from 'crypto';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/http/errors';
import { UserRole } from '@/lib/types';
import { findUserForManage } from '@/lib/shared/repositories/users.repo';
import { invalidateOriginCache } from './cors';
import * as repo from './keys.repo';
import { PartnerKeyRow } from './keys.repo';
import { DEFAULT_PARTNER_SCOPES, PartnerScope, canOwnPartnerKey } from './scopes';
import { usageForKey } from './usage.repo';

/**
 * Issuing, listing and revoking partner API keys.
 *
 * Only SuperAdmin mints keys today (see docs/partner-api-plan.md, decision 1);
 * reseller self-service is a later phase, which is why the permission check
 * lives here rather than being inlined in the route.
 */

const KEY_PREFIX = process.env.NODE_ENV === 'production' ? 'pk_live_' : 'pk_test_';
/** Bytes of entropy in the secret half of a key. 24 → 32 base64url chars. */
const KEY_BYTES = 24;
/** Characters of the secret shown alongside the prefix, e.g. `pk_live_A1b2c3d4`. */
const VISIBLE_CHARS = 8;
const MAX_ACTIVE_KEYS_PER_USER = 10;

export const hashKey = (plaintext: string) => createHash('sha256').update(plaintext).digest('hex');

/** A newly issued key: the only time the plaintext is ever available. */
export interface IssuedPartnerKey {
    key: PartnerKeyRow;
    /** Full secret. Shown once, never stored, never logged. */
    plaintext: string;
}

export interface IssueKeyInput {
    userId: number;
    name: string;
    scopes?: PartnerScope[];
    rateLimitPerMin?: number;
    allowedOrigins?: string[];
    /** ISO date, or null for a key that never expires. */
    expiresAt?: string | null;
}

/** Only SuperAdmin issues keys, and only for a role that may own one. */
async function assertIssuable(actor: AuthenticatedUser, userId: number): Promise<void> {
    if (actor.role !== 'SuperAdmin') {
        throw new ForbiddenError('Only administrators can manage partner API keys');
    }
    const target = await findUserForManage(userId);
    if (!target) throw new NotFoundError('User not found');
    if (!canOwnPartnerKey(target.role as UserRole)) {
        throw new ValidationError(`${target.role} accounts cannot hold partner API keys`);
    }
}

export async function listKeys(actor: AuthenticatedUser, userId: number): Promise<PartnerKeyRow[]> {
    await assertIssuable(actor, userId);
    return repo.listByUser(userId);
}

export async function issueKey(actor: AuthenticatedUser, input: IssueKeyInput): Promise<IssuedPartnerKey> {
    await assertIssuable(actor, input.userId);

    if (await repo.countActiveForUser(input.userId) >= MAX_ACTIVE_KEYS_PER_USER) {
        throw new ValidationError(`Revoke an existing key first (limit ${MAX_ACTIVE_KEYS_PER_USER} active keys)`);
    }

    const secret = randomBytes(KEY_BYTES).toString('base64url');
    const plaintext = `${KEY_PREFIX}${secret}`;

    const key = await repo.insert({
        userId: input.userId,
        name: input.name,
        keyPrefix: `${KEY_PREFIX}${secret.slice(0, VISIBLE_CHARS)}`,
        keyHash: hashKey(plaintext),
        scopes: input.scopes?.length ? input.scopes : DEFAULT_PARTNER_SCOPES,
        rateLimitPerMin: input.rateLimitPerMin ?? 120,
        allowedOrigins: input.allowedOrigins ?? [],
        expiresAt: input.expiresAt ?? null,
        createdBy: actor.id,
    });

    // The preflight allow-list is cached; a new key's origins must work at once.
    if (key.allowedOrigins.length) invalidateOriginCache();

    return { key, plaintext };
}

export async function revokeKey(actor: AuthenticatedUser, keyId: number): Promise<void> {
    const key = await repo.findById(keyId);
    if (!key) throw new NotFoundError('API key not found');
    await assertIssuable(actor, key.userId);
    await repo.revoke(keyId);
    if (key.allowedOrigins.length) invalidateOriginCache();
}

/** Request volume and error rate for one key, for the admin panel. */
export async function keyUsage(actor: AuthenticatedUser, keyId: number, days = 30) {
    const key = await repo.findById(keyId);
    if (!key) throw new NotFoundError('API key not found');
    await assertIssuable(actor, key.userId);
    return usageForKey(keyId, days);
}
