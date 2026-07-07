import { AuthenticatedUser } from '@/lib/auth-middleware';
import { NotFoundError } from '@/lib/http/errors';
import * as repo from '@/lib/platforms/android/repositories/admin-mobile-reports.repo';
import type { AdminMobileListQuery } from '@/lib/platforms/android/domain/schemas/admin-mobile';

function customerName(r: Record<string, unknown>): string | null {
    const first = (r.first_name as string) ?? '';
    const last = (r.last_name as string) ?? '';
    const joined = `${first} ${last}`.trim();
    return joined || (r.full_name as string) || null;
}

function ownerLabel(r: Record<string, unknown>): string | null {
    return (r.owner_display_name as string) || (r.owner_username as string) || null;
}

function mapRow(r: Record<string, unknown>) {
    return {
        id: r.id,
        reportId: r.report_id,
        reportType: r.report_type,
        testType: r.test_type ?? null,
        result: r.result ?? null,
        score: r.score ?? null,
        grade: r.grade ?? null,
        passedCount: r.passed_count ?? null,
        failedCount: r.failed_count ?? null,
        deviceId: r.device_id,
        deviceModel: r.device_model ?? null,
        appVersion: r.app_version ?? null,
        testedAt: r.tested_at ?? null,
        createdAt: r.created_at ?? null,
        customer: {
            id: r.customer_user_id,
            name: customerName(r),
            phone: r.phone ?? null,
            email: r.email ?? null,
        },
        reseller: r.owner_id
            ? { id: r.owner_id, name: ownerLabel(r), role: r.owner_role ?? null, licenseKey: r.license_key ?? null }
            : null,
    };
}

export async function listAdminReports(user: AuthenticatedUser, query: AdminMobileListQuery) {
    const { reports, total } = await repo.listAdminReports(user, {
        limit: query.limit,
        offset: query.offset,
        type: query.type,
        deviceId: query.deviceId,
        search: query.search,
        startDate: query.startDate,
        endDate: query.endDate,
        includeTotal: query.includeTotal === '1',
    });
    return {
        reports: reports.map(mapRow),
        pagination: { total, limit: query.limit, offset: query.offset },
    };
}

export async function getAdminReport(user: AuthenticatedUser, reportId: string) {
    const r = await repo.findAdminReport(user, reportId);
    if (!r) throw new NotFoundError('Report not found');

    const reportType = r.report_type as string;
    const payload = (r.payload_json as Record<string, unknown>) ?? {};
    const samples = reportType === 'STRESS_TEST'
        ? (await repo.findStressSamples(reportId)).map((s) => ({
            elapsedSec: s.elapsed_sec,
            gips: s.gips != null ? Number(s.gips) : null,
            phase: s.phase ?? null,
        }))
        : [];

    return {
        report: {
            ...mapRow(r),
            payload,
            deviceSnapshot: (r.device_snapshot_json as Record<string, unknown>) ?? null,
            stressSamples: samples,
        },
    };
}
