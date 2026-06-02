import { z } from 'zod';
import { NextRequest } from 'next/server';
import { ValidationError } from './errors';

/** Parse + validate a JSON body against a zod schema, or throw ValidationError. */
export async function parseBody<T extends z.ZodTypeAny>(
    request: NextRequest,
    schema: T
): Promise<z.infer<T>> {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        throw new ValidationError('Request body must be valid JSON');
    }
    return parse(schema, raw);
}

/** Parse + validate URLSearchParams against a zod schema, or throw ValidationError. */
export function parseQuery<T extends z.ZodTypeAny>(
    request: NextRequest,
    schema: T
): z.infer<T> {
    const obj = Object.fromEntries(new URL(request.url).searchParams.entries());
    return parse(schema, obj);
}

function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
    const result = schema.safeParse(data);
    if (!result.success) {
        const first = result.error.issues[0];
        const path = first?.path.join('.');
        throw new ValidationError(path ? `${path}: ${first.message}` : first?.message);
    }
    return result.data;
}
