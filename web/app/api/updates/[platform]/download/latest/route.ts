import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { wrap } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { parseQuery } from '@/lib/http/validate';
import { platformSchema, updateCheckQuerySchema } from '@/lib/shared/domain/schemas/releases';
import { openLatestForDownload } from '@/lib/shared/services/releases.service';

export const runtime = 'nodejs';

// GET /api/updates/:platform/download/latest?channel=stable
// Stable download URL that always streams the newest published installer.
// Storefronts/clients link here so they never bake a volatile release id that
// breaks when a release is re-uploaded (new row id).
export const GET = wrap(async (request, { params }) => {
    const platform = platformSchema.safeParse(params.platform);
    if (!platform.success) throw new ValidationError('Unknown platform');

    const { channel, arch } = parseQuery(request, updateCheckQuerySchema);

    const { row, stream, size } = await openLatestForDownload(platform.data, channel, arch);

    // Node Readable -> web stream for the NextResponse body.
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;

    return new NextResponse(body, {
        status: 200,
        headers: {
            'Content-Type': row.contentType || 'application/octet-stream',
            'Content-Length': String(size),
            'Content-Disposition': `attachment; filename="${row.fileName ?? 'installer'}"`,
            'X-Checksum-Sha256': row.sha256 ?? '',
            'Cache-Control': 'no-store',
        },
    });
});
