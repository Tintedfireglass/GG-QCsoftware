import { submitSchema } from '@/lib/platforms/windows/domain/schemas/qc-results';
import type { ParamDoc, RouteDoc } from '../types';

const listQueryParams: ParamDoc[] = [
    { name: 'limit', in: 'query', description: 'Page size (clamped 1–200).', schema: { type: 'integer', default: 50 }, example: 50 },
    { name: 'offset', in: 'query', description: 'Rows to skip.', schema: { type: 'integer', default: 0 } },
    { name: 'machineId', in: 'query', description: 'Filter by machine serial/id.' },
    { name: 'refurbishId', in: 'query', description: 'Filter by refurbish batch id.' },
    { name: 'userId', in: 'query', description: 'Filter by submitting technician id.', schema: { type: 'integer' } },
    { name: 'overallPass', in: 'query', description: 'Only `true` filters to passing reports.', schema: { type: 'string', enum: ['true', 'false'] } },
    { name: 'hasIssues', in: 'query', description: 'Only `true` filters to reports with flagged issues.', schema: { type: 'string', enum: ['true', 'false'] } },
    { name: 'search', in: 'query', description: 'Free-text search across report fields.' },
    { name: 'includeTotal', in: 'query', description: 'Set `0`/`false` to skip the total-count query.', schema: { type: 'string', default: 'true' } },
];

const qcResultSummary = {
    type: 'object',
    properties: {
        report_id: { type: 'string' },
        machine_id: { type: 'string' },
        overall_grade: { type: 'string', example: 'A+' },
        overall_pass: { type: 'boolean' },
        pramaan_score: { type: 'number', nullable: true },
        timestamp: { type: 'string', format: 'date-time' },
    },
} as const;

export const qcResultRoutes: RouteDoc[] = [
    {
        method: 'get',
        path: '/api/qc-results',
        tag: 'QC Results',
        summary: 'List QC results',
        description: 'Returns QC reports visible to the authenticated principal (row-scoped by role). Supports pagination and filtering.',
        security: ['adminJWT'],
        params: listQueryParams,
        responses: {
            '200': {
                description: 'A page of QC results.',
                schema: {
                    type: 'object',
                    properties: {
                        results: { type: 'array', items: qcResultSummary },
                        total: { type: 'integer', nullable: true },
                    },
                },
            },
        },
    },
    {
        method: 'post',
        path: '/api/qc-results',
        tag: 'QC Results',
        summary: 'Submit a QC result (desktop)',
        description:
            'Ingests a full QC report from the desktop client. Requires the `x-api-key` header; a staff JWT is also accepted/recorded when present. Decrements the activating license on success.',
        security: [['apiKey', 'adminJWT'], 'apiKey'],
        body: {
            schema: submitSchema,
            description: 'The complete report snapshot. Identifying fields are required; deep detail blobs are stored as-is.',
        },
        responses: {
            '201': {
                description: 'Result stored.',
                schema: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', example: 'QC result submitted successfully' },
                        report_id: { type: 'string' },
                    },
                },
            },
            '426': { description: 'Legacy client past the upgrade cutoff.' },
        },
    },
    {
        method: 'get',
        path: '/api/qc-results/{id}',
        tag: 'QC Results',
        summary: 'Get a QC result',
        description: 'Full detail for a single report (including per-test results), if visible to the caller.',
        security: ['adminJWT'],
        params: [{ name: 'id', in: 'path', description: 'Report id or report_id.' }],
        responses: {
            '200': { description: 'The QC report with nested test results.', schema: qcResultSummary },
            '404': { description: 'Not found or not visible.' },
        },
    },
    {
        method: 'get',
        path: '/api/qc-results/count',
        tag: 'QC Results',
        summary: 'Count visible QC results',
        description: 'Fast count for dashboard cards, scoped to the caller’s visibility.',
        security: ['adminJWT'],
        responses: {
            '200': { description: 'The count.', schema: { type: 'object', properties: { count: { type: 'integer' } } } },
        },
    },
    {
        method: 'get',
        path: '/api/qc-results/issues-summary',
        tag: 'QC Results',
        summary: 'Issues summary',
        description: 'Aggregated counts of flagged hardware issues (CPU/GPU/Memory/Storage/Battery) across visible reports.',
        security: ['adminJWT'],
        responses: {
            '200': { description: 'Per-category issue counts.', schema: { type: 'object', additionalProperties: { type: 'integer' } } },
        },
    },
];
