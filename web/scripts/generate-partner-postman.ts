/**
 * Generate the partner Postman collection from the OpenAPI spec.
 *
 *   npm run docs:postman
 *
 * Derived rather than hand-written, so the collection cannot drift from the
 * routes: add a RouteDoc in lib/openapi/paths/partner.ts and re-run this.
 */
import { writeFileSync } from 'fs';
import { partnerRoutes } from '../lib/openapi/paths/partner';
import type { RouteDoc } from '../lib/openapi/types';

const OUT = 'docs/PRAMAAN_Partner_API.postman_collection.json';

interface PostmanItem {
    name: string;
    request: Record<string, unknown>;
}

/** `/api/partner/v1/qc-results/{id}` → segments, with `{id}` as Postman's `:id`. */
function toSegments(path: string): string[] {
    return path.replace(/^\//, '').split('/').map((s) => s.replace(/^\{(.+)\}$/, ':$1'));
}

/** Folder name: the resource after the version prefix, e.g. `qc-results`. */
function folderFor(path: string): string {
    return path.replace('/api/partner/v1', '').split('/').filter(Boolean)[0] ?? 'root';
}

function toItem(route: RouteDoc): PostmanItem {
    const segments = toSegments(route.path);
    const query = (route.params ?? [])
        .filter((p) => p.in === 'query')
        .map((p) => ({
            key: p.name,
            value: p.example !== undefined ? String(p.example) : '',
            description: p.description,
            disabled: true,
        }));

    const variable = (route.params ?? [])
        .filter((p) => p.in === 'path')
        .map((p) => ({ key: p.name, value: '', description: p.description }));

    return {
        name: route.summary,
        request: {
            method: route.method.toUpperCase(),
            description: route.description ?? route.summary,
            header: route.body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
            url: {
                // Postman resolves `:id` from `variable`, so the display URL has to
                // use that form too, not the OpenAPI `{id}`.
                raw: `{{baseUrl}}/${segments.join('/')}`,
                host: ['{{baseUrl}}'],
                path: segments,
                ...(query.length ? { query } : {}),
                ...(variable.length ? { variable } : {}),
            },
            ...(route.body?.example
                ? { body: { mode: 'raw', raw: JSON.stringify(route.body.example, null, 2) } }
                : {}),
        },
    };
}

const folders = new Map<string, PostmanItem[]>();
for (const route of partnerRoutes) {
    const name = folderFor(route.path);
    if (!folders.has(name)) folders.set(name, []);
    folders.get(name)!.push(toItem(route));
}

const collection = {
    info: {
        name: 'PRAMAAN Partner API',
        description:
            'Reseller integration endpoints. Set the `baseUrl` and `apiKey` collection variables, then start with Meta → Verify a key. Generated from the OpenAPI spec by scripts/generate-partner-postman.ts — do not edit by hand.',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
        type: 'apikey',
        apikey: [
            { key: 'key', value: 'x-api-key' },
            { key: 'value', value: '{{apiKey}}' },
            { key: 'in', value: 'header' },
        ],
    },
    variable: [
        // Whoever regenerates the collection stamps their own host in via the
        // environment; the placeholder keeps a deployment's name out of the file
        // when it is not set.
        { key: 'baseUrl', value: (process.env.NEXT_PUBLIC_APP_URL || 'https://your-host.example').replace(/\/+$/, '') },
        { key: 'apiKey', value: 'pk_live_replace_me' },
    ],
    item: [...folders].map(([name, item]) => ({ name, item })),
};

writeFileSync(OUT, JSON.stringify(collection, null, 2) + '\n');
console.log(`Wrote ${OUT} — ${partnerRoutes.length} requests in ${folders.size} folders.`);
