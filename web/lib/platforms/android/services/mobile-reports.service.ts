import { randomBytes } from 'crypto';
import { z } from 'zod';
import { MobileError } from '@/lib/platforms/android/http';
import * as repo from '@/lib/platforms/android/repositories/mobile-reports.repo';
import {
    batteryReportSchema, displayReportSchema, sensorsReportSchema, singleTestSchema,
    fullQcSchema, stressReportSchema, historyQuerySchema,
} from '@/lib/platforms/android/domain/schemas/mobile';

const ABBR: Record<string, string> = {
    BATTERY: 'bat', DISPLAY: 'dsp', SENSORS: 'sns', SINGLE: 'sng', FULL_QC: 'qc', STRESS_TEST: 'str',
};

function makeReportId(type: string): string {
    return `rpt_${ABBR[type] ?? 'rep'}_${randomBytes(6).toString('hex')}`;
}

function toIso(testedAt: string): string {
    const d = new Date(testedAt);
    if (!Number.isFinite(d.getTime())) throw new MobileError(400, 'VALIDATION_ERROR', 'testedAt must be a valid ISO8601 timestamp', [{ field: 'testedAt', message: 'Invalid timestamp' }]);
    return d.toISOString();
}

interface Ctx {
    customerId: number;
    ip: string | null;
}

// ── Single-row report types ───────────────────────────────────────────────────────
export async function submitBattery(ctx: Ctx, body: z.infer<typeof batteryReportSchema>) {
    const reportId = makeReportId('BATTERY');
    const saved = await repo.insertReport({
        reportId, customerUserId: ctx.customerId, deviceId: body.deviceId, reportType: 'BATTERY',
        testType: null, result: body.result, score: null, grade: null, passedCount: null, failedCount: null,
        testedAt: toIso(body.testedAt), payloadJson: body, deviceSnapshotJson: null, submissionIp: ctx.ip,
    });
    return { data: { reportId, testType: 'BATTERY', result: body.result, savedAt: saved.created_at } };
}

export async function submitDisplay(ctx: Ctx, body: z.infer<typeof displayReportSchema>) {
    const reportId = makeReportId('DISPLAY');
    const saved = await repo.insertReport({
        reportId, customerUserId: ctx.customerId, deviceId: body.deviceId, reportType: 'DISPLAY',
        testType: null, result: body.overallResult, score: null, grade: null, passedCount: null, failedCount: null,
        testedAt: toIso(body.testedAt), payloadJson: body, deviceSnapshotJson: null, submissionIp: ctx.ip,
    });
    return { data: { reportId, testType: 'DISPLAY', result: body.overallResult, savedAt: saved.created_at } };
}

export async function submitSensors(ctx: Ctx, body: z.infer<typeof sensorsReportSchema>) {
    const reportId = makeReportId('SENSORS');
    const saved = await repo.insertReport({
        reportId, customerUserId: ctx.customerId, deviceId: body.deviceId, reportType: 'SENSORS',
        testType: null, result: body.overallResult, score: null, grade: null, passedCount: null, failedCount: null,
        testedAt: toIso(body.testedAt), payloadJson: body, deviceSnapshotJson: null, submissionIp: ctx.ip,
    });
    return { data: { reportId, testType: 'SENSORS', result: body.overallResult, savedAt: saved.created_at } };
}

export async function submitSingle(ctx: Ctx, body: z.infer<typeof singleTestSchema>) {
    const reportId = makeReportId('SINGLE');
    const saved = await repo.insertReport({
        reportId, customerUserId: ctx.customerId, deviceId: body.deviceId, reportType: 'SINGLE',
        testType: body.testType, result: body.result, score: null, grade: null, passedCount: null, failedCount: null,
        testedAt: toIso(body.testedAt), payloadJson: body, deviceSnapshotJson: null, submissionIp: ctx.ip,
    });
    return { data: { reportId, testType: body.testType, result: body.result, savedAt: saved.created_at } };
}

export async function submitFullQc(ctx: Ctx, body: z.infer<typeof fullQcSchema>) {
    const reportId = makeReportId('FULL_QC');
    const saved = await repo.insertReport({
        reportId, customerUserId: ctx.customerId, deviceId: body.deviceId, reportType: 'FULL_QC',
        testType: null, result: body.overallResult, score: null, grade: null,
        passedCount: body.passedCount, failedCount: body.failedCount,
        testedAt: toIso(body.testedAt), payloadJson: body,
        deviceSnapshotJson: body.deviceSnapshot ?? null, submissionIp: ctx.ip,
    });
    return {
        data: {
            reportId, reportType: 'FULL_QC', overallResult: body.overallResult,
            passedCount: body.passedCount, failedCount: body.failedCount, savedAt: saved.created_at,
        },
    };
}

export async function submitStress(ctx: Ctx, body: z.infer<typeof stressReportSchema>) {
    const reportId = makeReportId('STRESS_TEST');
    const r = body.result;
    const samples = (body.perfGraph ?? []).map((s) => ({
        elapsedSec: s.elapsedSec, gips: s.gips ?? null, phase: s.phase ?? null,
    }));
    const saved = await repo.insertStressReport(
        {
            reportId, customerUserId: ctx.customerId, deviceId: body.deviceId, reportType: 'STRESS_TEST',
            testType: null, result: r.passed ? 'PASSED' : 'FAILED', score: r.score, grade: r.grade,
            passedCount: null, failedCount: null, testedAt: toIso(body.testedAt), payloadJson: body,
            deviceSnapshotJson: body.deviceSnapshot ?? null, submissionIp: ctx.ip,
        },
        samples
    );
    return {
        data: {
            reportId, reportType: 'STRESS_TEST', score: r.score, grade: r.grade, passed: r.passed, savedAt: saved.created_at,
        },
    };
}

// ── History ───────────────────────────────────────────────────────────────────────
export async function getHistory(customerId: number, query: z.infer<typeof historyQuerySchema>) {
    const { reports, total } = await repo.listHistory(customerId, {
        page: query.page, limit: query.limit, type: query.type, deviceId: query.deviceId,
    });
    const mapped = reports.map((r) => ({
        reportId: r.report_id,
        reportType: r.report_type,
        testType: r.test_type ?? null,
        result: r.result ?? null,
        score: r.score ?? null,
        grade: r.grade ?? null,
        passedCount: r.passed_count ?? null,
        failedCount: r.failed_count ?? null,
        deviceModel: r.device_model ?? null,
        testedAt: r.tested_at ?? null,
    }));
    return {
        data: {
            reports: mapped,
            pagination: {
                page: query.page,
                limit: query.limit,
                totalReports: total,
                totalPages: Math.max(1, Math.ceil(total / query.limit)),
            },
        },
    };
}

export async function getReport(customerId: number, reportId: string) {
    const r = await repo.findReportByReportId(customerId, reportId);
    if (!r) throw new MobileError(404, 'NOT_FOUND', 'Report not found');
    // Return the original payload plus identifiers (matches the doc's contract).
    const payload = (r.payload_json as Record<string, unknown>) ?? {};
    return {
        data: {
            ...payload,
            reportId: r.report_id,
            reportType: r.report_type,
            userId: `usr_${r.customer_user_id}`,
            savedAt: r.created_at,
        },
    };
}
