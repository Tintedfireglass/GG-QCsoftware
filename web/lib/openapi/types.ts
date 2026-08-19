import { z } from 'zod';

/** Named security schemes declared once in `security.ts`. */
export type SecurityScheme = 'adminJWT' | 'customerJWT' | 'mobileJWT' | 'apiKey' | 'partnerApiKey';

/**
 * A security requirement. A plain scheme name means "this scheme alone is
 * sufficient"; multiple entries in the array are alternatives (logical OR). To
 * require several schemes *together* (logical AND), nest them in an array, e.g.
 * `[['apiKey', 'adminJWT']]` = apiKey AND adminJWT.
 */
export type SecurityRequirement = SecurityScheme | SecurityScheme[];

/** A schema is either a Zod type (converted on build) or a raw JSON-schema object. */
export type SchemaInput = z.ZodType | Record<string, unknown>;

export interface ParamDoc {
    name: string;
    in: 'path' | 'query' | 'header';
    required?: boolean;
    description?: string;
    schema?: SchemaInput;
    example?: unknown;
}

export interface BodyDoc {
    description?: string;
    required?: boolean;
    contentType?: string; // defaults to application/json
    schema: SchemaInput;
    example?: unknown;
}

export interface ResponseDoc {
    description: string;
    schema?: SchemaInput;
    example?: unknown;
    contentType?: string; // defaults to application/json
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDoc {
    method: HttpMethod;
    /** OpenAPI path with `{param}` placeholders, e.g. `/api/qc-results/{id}`. */
    path: string;
    /** Tag groups the operation in the sidebar. Should match a TagDoc name. */
    tag: string;
    summary: string;
    description?: string;
    /** Omit for a public endpoint. See {@link SecurityRequirement}. */
    security?: SecurityRequirement[];
    params?: ParamDoc[];
    body?: BodyDoc;
    /** Keyed by HTTP status code. A shared error set is merged in automatically. */
    responses?: Record<string, ResponseDoc>;
    deprecated?: boolean;
}

export interface TagDoc {
    name: string;
    description?: string;
}
