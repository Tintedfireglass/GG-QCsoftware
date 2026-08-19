import { timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';
import { ForbiddenError, UnauthorizedError } from './errors';

/**
 * Auth for endpoints a scheduler drives.
 *
 * A cron job cannot hold a dashboard JWT — they expire in 7 days — so these
 * routes accept a long-lived shared secret in `X-Cron-Secret` as well. An admin
 * can still trigger them by hand with their normal session, which is what makes
 * them debuggable.
 */
export async function requireCronOrAdmin(request: NextRequest): Promise<void> {
    const secret = process.env.CRON_SECRET;
    const presented = request.headers.get('x-cron-secret');

    if (presented && secret) {
        const expected = Buffer.from(secret);
        const actual = Buffer.from(presented);
        if (expected.length === actual.length && timingSafeEqual(expected, actual)) return;
        // A wrong secret is never worth falling back on — fail rather than let a
        // misconfigured scheduler look like an anonymous caller.
        throw new UnauthorizedError('Invalid cron secret');
    }

    const { user, error } = await authenticateRequest(request);
    if (error || !user) throw new UnauthorizedError();
    if (user.role !== 'SuperAdmin') throw new ForbiddenError();
}
