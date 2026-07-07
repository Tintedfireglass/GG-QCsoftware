import { wrap, json } from '@/lib/http/handler';
import { parseQuery } from '@/lib/http/validate';
import { ValidationError } from '@/lib/http/errors';
import { platformSchema, updateCheckQuerySchema } from '@/lib/shared/domain/schemas/releases';
import { getUpdateManifest } from '@/lib/shared/services/releases.service';

export const runtime = 'nodejs';

// GET /api/updates/:platform/latest?current=1.2.0&channel=stable
// Public manifest the desktop clients poll to decide whether to update.
export const GET = wrap(async (request, { params }) => {
    const platform = platformSchema.safeParse(params.platform);
    if (!platform.success) throw new ValidationError('Unknown platform');

    const { current, channel, arch } = parseQuery(request, updateCheckQuerySchema);

    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin;
    const manifest = await getUpdateManifest(platform.data, channel, arch, current, base);

    return json(manifest, {
        headers: { 'Cache-Control': 'no-store' },
    });
});
