import { z } from 'zod';
import type { SchemaInput } from './types';

/**
 * Convert a Zod schema into an OpenAPI 3.1 schema object.
 *
 * OpenAPI 3.1 is a superset of JSON Schema draft 2020-12, which is exactly what
 * Zod 4's native `z.toJSONSchema` emits — so no third-party converter is needed.
 *
 *  - `io: 'input'` documents the *request* shape (before `.transform()`), which
 *    is what an API caller actually sends. The dashboard's query schemas lean on
 *    `.transform()`/`.catch()` for clamping; we want the pre-transform view.
 *  - `unrepresentable: 'any'` keeps `z.any()`/`z.unknown()` blobs (systemInfo,
 *    payload snapshots) as open `{}` instead of throwing.
 */
export function zodToOpenApi(schema: z.ZodType): Record<string, unknown> {
    try {
        const json = z.toJSONSchema(schema, {
            io: 'input',
            unrepresentable: 'any',
        }) as Record<string, unknown>;
        // OpenAPI keeps schemas under components; the JSON-Schema dialect marker
        // is noise there and some tools choke on it.
        delete json.$schema;
        return json;
    } catch {
        // Never let an unconvertible schema break the whole document.
        return { type: 'object', description: 'Schema unavailable' };
    }
}

export function isZodSchema(value: unknown): value is z.ZodType {
    return value instanceof z.ZodType;
}

/** Resolve a {@link SchemaInput} (Zod or raw JSON schema) to an OpenAPI schema. */
export function resolveSchema(input: SchemaInput): Record<string, unknown> {
    return isZodSchema(input) ? zodToOpenApi(input) : input;
}
