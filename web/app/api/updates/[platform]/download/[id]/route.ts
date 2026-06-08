import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { wrap } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { openForDownload } from '@/lib/shared/services/releases.service';

export const runtime = 'nodejs';

// GET /api/updates/:platform/download/:id - stream a published installer.
// Public: the client already learned this id (and its sha256) from /latest.
export const GET = wrap(async (_request, { params }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid release id');

    const { row, stream, size } = await openForDownload(id);

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
