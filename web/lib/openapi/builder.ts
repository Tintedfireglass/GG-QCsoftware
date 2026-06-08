import { resolveSchema } from './schema';
import { securitySchemes } from './security';
import type {
    BodyDoc,
    ParamDoc,
    ResponseDoc,
    RouteDoc,
    SecurityRequirement,
    TagDoc,
} from './types';

/** Shared component schema for the `{ error, message }` envelope (see lib/http/errors.ts). */
const ERROR_SCHEMA = {
    type: 'object',
    properties: {
        error: { type: 'string', description: 'Short error category, e.g. "Validation Error".' },
        message: { type: 'string', description: 'Human-readable detail.' },
    },
    required: ['error', 'message'],
} as const;

const errorRef = { $ref: '#/components/schemas/Error' };

function errorResponse(description: string) {
    return { description, content: { 'application/json': { schema: errorRef } } };
}

/** Status responses every authed/validated route can return, merged unless overridden. */
function defaultResponsesFor(route: RouteDoc): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (route.body) out['400'] = errorResponse('Validation failed.');
    if (route.security && route.security.length > 0) {
        out['401'] = errorResponse('Missing or invalid credentials.');
        out['403'] = errorResponse('Authenticated, but not permitted.');
    }
    out['500'] = errorResponse('Unexpected server error.');
    return out;
}

function buildSecurity(security?: SecurityRequirement[]): Array<Record<string, string[]>> | undefined {
    if (!security) return undefined; // public — omit `security`, inherits none
    return security.map((req) =>
        Array.isArray(req)
            ? Object.fromEntries(req.map((name) => [name, []])) // AND
            : { [req]: [] }
    );
}

function buildParam(p: ParamDoc): Record<string, unknown> {
    return {
        name: p.name,
        in: p.in,
        required: p.in === 'path' ? true : p.required ?? false,
        ...(p.description ? { description: p.description } : {}),
        schema: p.schema ? resolveSchema(p.schema) : { type: 'string' },
        ...(p.example !== undefined ? { example: p.example } : {}),
    };
}

function buildBody(body: BodyDoc): Record<string, unknown> {
    const contentType = body.contentType ?? 'application/json';
    return {
        ...(body.description ? { description: body.description } : {}),
        required: body.required ?? true,
        content: {
            [contentType]: {
                schema: resolveSchema(body.schema),
                ...(body.example !== undefined ? { example: body.example } : {}),
            },
        },
    };
}

function buildResponse(res: ResponseDoc): Record<string, unknown> {
    const contentType = res.contentType ?? 'application/json';
    return {
        description: res.description,
        ...(res.schema
            ? {
                  content: {
                      [contentType]: {
                          schema: resolveSchema(res.schema),
                          ...(res.example !== undefined ? { example: res.example } : {}),
                      },
                  },
              }
            : {}),
    };
}

function buildOperation(route: RouteDoc): Record<string, unknown> {
    const responses: Record<string, unknown> = { ...defaultResponsesFor(route) };
    for (const [code, res] of Object.entries(route.responses ?? {})) {
        responses[code] = buildResponse(res);
    }

    const op: Record<string, unknown> = {
        tags: [route.tag],
        summary: route.summary,
        ...(route.description ? { description: route.description } : {}),
        ...(route.deprecated ? { deprecated: true } : {}),
        responses,
    };

    const security = buildSecurity(route.security);
    if (security) op.security = security;
    if (route.params?.length) op.parameters = route.params.map(buildParam);
    if (route.body) op.requestBody = buildBody(route.body);

    return op;
}

export interface DocumentOptions {
    info: Record<string, unknown>;
    servers: Array<Record<string, unknown>>;
    tags: TagDoc[];
    routes: RouteDoc[];
}

/** Assemble a complete OpenAPI 3.1 document from declarative route docs. */
export function assembleDocument({ info, servers, tags, routes }: DocumentOptions): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const route of routes) {
        (paths[route.path] ??= {})[route.method] = buildOperation(route);
    }

    return {
        openapi: '3.1.0',
        info,
        servers,
        tags,
        paths,
        components: {
            securitySchemes,
            schemas: { Error: ERROR_SCHEMA },
        },
    };
}
