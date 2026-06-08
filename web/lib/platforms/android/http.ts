import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError } from '@/lib/http/errors';

/**
 * Mobile (Android) HTTP layer. The app contract (phone_android_api_doc.md) uses
 * a different envelope than the dashboard/PC API:
 *   success → { success: true, message?, data? }
 *   error   → { success: false, error: { code, message, details? } }
 * so mobile routes use mobileWrap/mobileOk/MobileError instead of the shared
 * wrap/json/AppError flow.
 */

export interface FieldError {
    field: string;
    message: string;
}

/** Domain error carrying an explicit machine code (e.g. PHONE_REQUIRED, OTP_INVALID). */
export class MobileError extends AppError {
    constructor(
        status: number,
        public readonly code: string,
        message: string,
        public readonly details?: FieldError[]
    ) {
        super(status, code, message);
        this.name = 'MobileError';
    }
}

// Fallback code when a generic AppError bubbles up without a mobile code.
const STATUS_CODE: Record<number, string> = {
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    426: 'UPGRADE_REQUIRED',
    500: 'SERVER_ERROR',
};

export function mobileOk(opts: { data?: unknown; message?: string; status?: number }): NextResponse {
    const { data, message, status = 200 } = opts;
    const body: Record<string, unknown> = { success: true };
    if (message !== undefined) body.message = message;
    if (data !== undefined) body.data = data;
    return NextResponse.json(body, { status });
}

type MobileHandler = (
    request: NextRequest,
    ctx: { params: Record<string, string> }
) => Promise<NextResponse>;

/** Error boundary for a mobile route — maps any throw to the {success,error} shape. */
export function mobileWrap(handler: MobileHandler) {
    return async (request: NextRequest, route?: { params?: Promise<Record<string, string>> }) => {
        try {
            const params = route?.params ? await route.params : {};
            return await handler(request, { params });
        } catch (err) {
            return toMobileError(err);
        }
    };
}

function toMobileError(err: unknown): NextResponse {
    if (err instanceof MobileError) {
        return NextResponse.json(
            { success: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
            { status: err.status }
        );
    }
    if (err instanceof AppError) {
        return NextResponse.json(
            { success: false, error: { code: STATUS_CODE[err.status] || 'ERROR', message: err.message } },
            { status: err.status }
        );
    }
    console.error('Unhandled mobile route error:', err);
    return NextResponse.json(
        { success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } },
        { status: 500 }
    );
}

/** Parse + validate a JSON body against a zod schema, or throw a mobile 400 with field details. */
export async function parseMobileBody<T extends z.ZodTypeAny>(request: NextRequest, schema: T): Promise<z.infer<T>> {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        throw new MobileError(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    }
    return parseMobile(schema, raw);
}

export function parseMobileQuery<T extends z.ZodTypeAny>(request: NextRequest, schema: T): z.infer<T> {
    const obj = Object.fromEntries(new URL(request.url).searchParams.entries());
    return parseMobile(schema, obj);
}

function parseMobile<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
    const result = schema.safeParse(data);
    if (!result.success) {
        const details: FieldError[] = result.error.issues.map((i) => ({
            field: i.path.join('.') || '(body)',
            message: i.message,
        }));
        throw new MobileError(400, 'VALIDATION_ERROR', details[0]?.message || 'Invalid request', details);
    }
    return result.data;
}
