import { licenseUpdateSchema } from '@/lib/partner/schemas';
import { generateLicenseSchema } from '@/lib/shared/domain/schemas/licenses';
import { registerSchema } from '@/lib/shared/domain/schemas/auth';
import { updateUserSchema } from '@/lib/shared/domain/schemas/users';
import { renameMachineSchema } from '@/lib/platforms/windows/domain/schemas/machines';
import { fleetEnrollSchema, lifecycleEventSchema } from '@/lib/platforms/windows/domain/schemas/fleet';
import type { RouteDoc } from '../types';

/**
 * The reseller-facing surface: `/api/partner/v1/*`, authenticated with a partner
 * API key. Every operation returns the same payload as its dashboard
 * counterpart and is scoped to the key owner's own data.
 */

const TAG = 'Partner API';
const security: RouteDoc['security'] = ['partnerApiKey'];

/** Errors every partner route can return, on top of the shared error set. */
const partnerErrors: RouteDoc['responses'] = {
    '401': { description: 'Missing, invalid, revoked or expired API key.' },
    '403': { description: 'The key lacks the scope this operation requires.' },
    '429': {
        description:
            'Rate limit exceeded. `X-RateLimit-Limit`, `-Remaining` and `-Reset` are on every response; `Retry-After` is on this one.',
    },
};

/** Query params shared by the QC-results list and count endpoints. */
const listParams: RouteDoc['params'] = [
    { name: 'limit', in: 'query', description: 'Page size, 1–200 (default 50).', schema: { type: 'integer' } },
    { name: 'offset', in: 'query', description: 'Rows to skip (default 0).', schema: { type: 'integer' } },
    { name: 'search', in: 'query', description: 'Free text over serial, model and machine id.' },
    { name: 'machineId', in: 'query', description: 'Restrict to one machine.' },
    { name: 'startDate', in: 'query', description: 'Inclusive lower bound, `YYYY-MM-DD`.' },
    { name: 'endDate', in: 'query', description: 'Inclusive upper bound, `YYYY-MM-DD`.' },
    { name: 'grades', in: 'query', description: 'Comma-separated grade buckets, e.g. `A+,A,B`.' },
    { name: 'overallPass', in: 'query', description: '`true` for passing reports only.' },
    {
        name: 'since',
        in: 'query',
        description:
            'Incremental sync cursor: an ISO timestamp (e.g. `2026-08-18T10:00:00Z`). Returns everything recorded at or after it, ignoring the default retention window. Inclusive — pair it with `sort=date_asc` and de-duplicate on `id`.',
    },
    { name: 'sort', in: 'query', description: '`date_desc` (default), `date_asc`, `grade_desc`, `grade_asc`, `id_asc`.' },
];

/** Terse helper — every route in this file shares tag, security and error set. */
function route(
    method: RouteDoc['method'],
    path: string,
    summary: string,
    extra: Partial<RouteDoc> = {}
): RouteDoc {
    return {
        method,
        path: `/api/partner/v1${path}`,
        tag: TAG,
        summary,
        security,
        ...extra,
        responses: { ...partnerErrors, ...extra.responses },
    };
}

export const partnerRoutes: RouteDoc[] = [
    route('get', '/me', 'Verify a key', {
        description:
            'Returns the account a key authenticates as and the scopes it holds. Requires no scope — use it to check credentials during setup.',
        responses: {
            '200': {
                description: 'The key and its owner.',
                example: {
                    account: { id: 42, username: 'acme', role: 'Reseller' },
                    key: { id: 7, scopes: ['qc:read', 'machines:read'], rateLimitPerMin: 120 },
                },
            },
        },
    }),

    route('get', '/qc-results', 'List QC results', {
        description: 'QC results visible to the key owner, newest first. Scope: `qc:read`.',
        params: listParams,
        responses: { '200': { description: 'Paginated QC results.' } },
    }),
    route('get', '/qc-results/count', 'Count QC results', {
        description:
            'Lifetime total for the account. Honours `machineId`, `search`, `userId` and `overallPass` only — **date, `since` and retention filters do not apply here**. For a filtered total, read `pagination.total` from the list endpoint instead. Scope: `qc:read`.',
        params: [
            { name: 'machineId', in: 'query', description: 'Restrict to one machine.' },
            { name: 'search', in: 'query', description: 'Free text over serial, model and machine id.' },
            { name: 'overallPass', in: 'query', description: '`true` for passing reports only.' },
        ],
        responses: { '200': { description: '`{ total }`.' } },
    }),
    route('get', '/qc-results/{id}', 'Get a QC result', {
        description: 'One result with its individual test rows. Scope: `qc:read`.',
        params: [{ name: 'id', in: 'path', required: true, description: 'QC result id.' }],
        responses: { '200': { description: 'The QC result.' }, '404': { description: 'Not found or not visible.' } },
    }),
    route('get', '/qc-results/issues-summary', 'Issue summary', {
        description: 'Device-issue counts over the latest report per machine. Scope: `qc:read`.',
        responses: { '200': { description: 'Counts per issue type.' } },
    }),
    route('get', '/qc-results/asset-health', 'Asset-health summary', {
        description: 'Storage, thermal and tamper risk buckets. Scope: `qc:read`.',
        responses: { '200': { description: 'Counts per risk bucket.' } },
    }),

    route('get', '/machines', 'List machines', {
        description: 'Machines visible to the key owner. Scope: `machines:read`.',
        responses: { '200': { description: 'The machines.' } },
    }),
    route('get', '/machines/count', 'Count machines', {
        description: 'Visible machine count. Scope: `machines:read`.',
        responses: { '200': { description: '`{ total }`.' } },
    }),
    route('get', '/machines/{id}', 'Get a machine', {
        description: 'Machine detail with test and component history. Scope: `machines:read`.',
        params: [{ name: 'id', in: 'path', required: true, description: 'Machine id.' }],
        responses: { '200': { description: 'The machine.' }, '404': { description: 'Not found or not visible.' } },
    }),

    route('get', '/licenses', 'List license keys', {
        description: 'License keys owned by the account. Scope: `licenses:read`.',
        params: [
            { name: 'search', in: 'query', description: 'Free text over key and customer.' },
            { name: 'status', in: 'query', description: '`active`, `inactive`, `expired`, or `all`.' },
            { name: 'page', in: 'query', description: 'Page number (default 1).', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', description: 'Page size, 1–100 (default 20).', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: '`{ keys, pagination }`.' } },
    }),

    route('get', '/mobile-reports', 'List mobile QC reports', {
        description: 'B2C mobile reports attributed to the account\'s licenses. Scope: `reports:read`.',
        params: [
            { name: 'limit', in: 'query', description: 'Page size, 1–100 (default 20).', schema: { type: 'integer' } },
            { name: 'offset', in: 'query', description: 'Rows to skip (default 0).', schema: { type: 'integer' } },
            { name: 'type', in: 'query', description: 'Report or test type, e.g. `FULL_QC`, `BATTERY`.' },
            { name: 'search', in: 'query', description: 'Free text over report id, device id and customer.' },
        ],
        responses: { '200': { description: 'Paginated mobile reports.' } },
    }),
    route('get', '/mobile-reports/{reportId}', 'Get a mobile QC report', {
        description: 'One mobile report in full. Scope: `reports:read`.',
        params: [{ name: 'reportId', in: 'path', required: true, description: 'Mobile report id.' }],
        responses: { '200': { description: 'The report.' }, '404': { description: 'Not found or not visible.' } },
    }),

    route('delete', '/qc-results/{id}', 'Hide a QC result', {
        description:
            'Removes a result from every listing. The row is retained and certificates already issued stay verifiable. Scope: `qc:write`.',
        params: [{ name: 'id', in: 'path', required: true, description: 'QC result id.' }],
        responses: { '200': { description: '`{ success: true }`.' }, '404': { description: 'Not found or not visible.' } },
    }),
    route('get', '/qc-results/export', 'Export QC results', {
        description:
            'Latest report per machine as a file — the only endpoint that does not answer with JSON. Scope: `reports:read`.',
        params: [
            { name: 'format', in: 'query', description: '`xlsx` (default) or `pdf`.' },
            { name: 'search', in: 'query', description: 'Free text filter, as on the list.' },
            { name: 'timeZone', in: 'query', description: 'IANA zone for rendered dates, e.g. `Asia/Kolkata`.' },
        ],
        responses: {
            '200': {
                description: 'The workbook or PDF, as an attachment.',
                contentType: 'application/octet-stream',
                schema: { type: 'string', format: 'binary' },
            },
        },
    }),

    route('patch', '/machines/{id}', 'Rename a machine', {
        description: 'Sets the human-friendly display name. Scope: `machines:write`.',
        params: [{ name: 'id', in: 'path', required: true, description: 'Machine id.' }],
        body: { schema: renameMachineSchema, example: { customName: 'Front-desk QC PC' } },
        responses: { '200': { description: 'The updated machine.' } },
    }),

    route('post', '/licenses', 'Generate a license key', {
        description:
            "Mints a key against the account's license credits, honouring its duration and platform permissions exactly as the dashboard does. Scope: `licenses:write`. Roles: Reseller, Refurbisher, Enterprise.",
        body: {
            schema: generateLicenseSchema,
            example: { type: 'yearly', product_scope: ['windows'], platform_caps: { windows: 2 } },
        },
        responses: {
            '201': { description: 'The generated key.' },
            '400': { description: 'Invalid type, or the account lacks credits or permission for it.' },
        },
    }),
    route('patch', '/licenses/{id}', 'Update a license key', {
        description:
            'Activate or deactivate a key, or move its expiry. Send one field or the other. Scope: `licenses:write`. Roles: Reseller, Refurbisher, Enterprise.',
        params: [{ name: 'id', in: 'path', required: true, description: 'License key id.' }],
        body: { schema: licenseUpdateSchema, example: { is_active: false } },
        responses: { '200': { description: 'The updated key.' }, '404': { description: 'Not found or not yours.' } },
    }),

    route('get', '/users', 'List team members', {
        description:
            'Accounts created by the key owner. Scope: `users:read`. Roles: Reseller, Refurbisher, Enterprise.',
        params: [
            { name: 'page', in: 'query', description: 'Page number (default 1).', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', description: 'Page size, 1–200 (default 20).', schema: { type: 'integer' } },
            { name: 'search', in: 'query', description: 'Free text over username, display name and email.' },
            { name: 'role', in: 'query', description: 'Filter to one role, e.g. `Technician`.' },
        ],
        responses: { '200': { description: '`{ users, pagination }`.' } },
    }),
    route('post', '/users', 'Create a team member', {
        description:
            'The roles you may create are decided by your own role, not by the request. Scope: `users:write`. Roles: Reseller, Refurbisher, Enterprise.',
        body: { schema: registerSchema, example: { username: 'tech-01', password: 'S3cret!23', role: 'Technician' } },
        responses: { '201': { description: 'The created user.' }, '409': { description: 'Username already taken.' } },
    }),
    route('get', '/users/{id}', 'Get a team member', {
        description: 'Scope: `users:read`. Only reachable for accounts on your own team.',
        params: [{ name: 'id', in: 'path', required: true, description: 'User id.' }],
        responses: { '200': { description: 'The user.' }, '404': { description: 'Not found or not on your team.' } },
    }),
    route('patch', '/users/{id}', 'Update a team member', {
        description: 'Partial update of the fields the panel exposes. Scope: `users:write`.',
        params: [{ name: 'id', in: 'path', required: true, description: 'User id.' }],
        body: { schema: updateUserSchema, example: { display_name: 'Priya S', is_active: true } },
        responses: { '200': { description: 'The updated user.' } },
    }),
    route('delete', '/users/{id}', 'Deactivate a team member', {
        description:
            'Soft delete — the account can no longer sign in, but its QC history is kept. Scope: `users:write`.',
        params: [{ name: 'id', in: 'path', required: true, description: 'User id.' }],
        responses: { '200': { description: 'Deactivated.' } },
    }),

    route('get', '/fleet', 'List fleet machines', {
        description: 'Fleet inventory with its health summary. Scope: `fleet:read`. Roles: Reseller, Enterprise.',
        params: [
            { name: 'search', in: 'query', description: 'Free text over asset tag, serial and model.' },
            { name: 'group_id', in: 'query', description: 'Restrict to one machine group.', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Fleet machines and summary.' } },
    }),
    route('post', '/fleet', 'Enrol a machine', {
        description: 'Adds a machine to the fleet. Scope: `fleet:write`. Roles: Reseller, Enterprise.',
        body: { schema: fleetEnrollSchema, example: { machine_id: 'GG-0042', asset_tag: 'IT-1187', model: 'ThinkPad T14' } },
        responses: { '201': { description: 'The enrolled machine.' } },
    }),
    route('get', '/fleet/{machineId}/lifecycle', 'List lifecycle events', {
        description: 'Ownership and service history for one machine. Scope: `fleet:read`.',
        params: [{ name: 'machineId', in: 'path', required: true, description: 'Machine id.' }],
        responses: { '200': { description: 'The events, newest first.' } },
    }),
    route('post', '/fleet/{machineId}/lifecycle', 'Record a lifecycle event', {
        description: 'Appends an event, e.g. an assignment, repair or retirement. Scope: `fleet:write`.',
        params: [{ name: 'machineId', in: 'path', required: true, description: 'Machine id.' }],
        body: { schema: lifecycleEventSchema, example: { event_type: 'assigned', notes: 'Issued to warehouse team' } },
        responses: { '201': { description: 'The recorded event.' } },
    }),
];
