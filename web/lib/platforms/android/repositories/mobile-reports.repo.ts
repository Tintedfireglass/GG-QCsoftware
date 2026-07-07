import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { mobileReports, mobileStressSamples } = schema;

export interface NewReport {
    reportId: string;
    customerUserId: number;
    deviceId: string;
    reportType: string;
    testType: string | null;
    result: string | null;
    score: number | null;
    grade: string | null;
    passedCount: number | null;
    failedCount: number | null;
    testedAt: string | null; // ISO
    payloadJson: unknown;
    deviceSnapshotJson: unknown | null;
    submissionIp: string | null;
}

export interface StressSample {
    elapsedSec: number;
    gips: number | null;
    phase: string | null;
}

function reportValues(r: NewReport) {
    return {
        reportId: r.reportId,
        customerUserId: r.customerUserId,
        deviceId: r.deviceId,
        reportType: r.reportType,
        testType: r.testType,
        result: r.result,
        score: r.score,
        grade: r.grade,
        passedCount: r.passedCount,
        failedCount: r.failedCount,
        testedAt: r.testedAt,
        payloadJson: r.payloadJson,
        deviceSnapshotJson: r.deviceSnapshotJson,
        submissionIp: r.submissionIp,
    };
}

export async function insertReport(r: NewReport): Promise<{ id: number; created_at: string }> {
    const rows = await db
        .insert(mobileReports)
        .values(reportValues(r))
        .returning({ id: mobileReports.id, created_at: mobileReports.createdAt });
    return rows[0];
}

/** Insert a stress report and its perfGraph samples atomically. */
export async function insertStressReport(
    r: NewReport,
    samples: StressSample[]
): Promise<{ id: number; created_at: string }> {
    return db.transaction(async (tx) => {
        const rows = await tx
            .insert(mobileReports)
            .values(reportValues(r))
            .returning({ id: mobileReports.id, created_at: mobileReports.createdAt });
        const report = rows[0];
        if (samples.length > 0) {
            await tx.insert(mobileStressSamples).values(
                samples.map((s) => ({
                    mobileReportId: report.id,
                    elapsedSec: s.elapsedSec,
                    gips: s.gips != null ? String(s.gips) : null, // numeric column takes string
                    phase: s.phase,
                }))
            );
        }
        return report;
    });
}

export interface HistoryFilters {
    page: number;
    limit: number;
    type?: string;
    deviceId?: string;
}

export async function listHistory(
    customerId: number,
    f: HistoryFilters
): Promise<{ reports: Record<string, unknown>[]; total: number }> {
    const conds = [sql`mr.customer_user_id = ${customerId}`];
    if (f.type) conds.push(sql`(mr.report_type = ${f.type} OR mr.test_type = ${f.type})`);
    if (f.deviceId) conds.push(sql`mr.device_id = ${f.deviceId}`);
    const where = sql.join(conds, sql` AND `);
    const offset = (f.page - 1) * f.limit;

    const { rows } = await db.execute(sql`
        SELECT mr.report_id, mr.report_type, mr.test_type, mr.result, mr.score, mr.grade,
               mr.passed_count, mr.failed_count, mr.tested_at, mr.created_at, mr.device_id,
               COALESCE(md.model, mr.device_snapshot_json->>'model') AS device_model
        FROM mobile_reports mr
        LEFT JOIN mobile_devices md
               ON md.customer_user_id = mr.customer_user_id AND md.device_id = mr.device_id
        WHERE ${where}
        ORDER BY mr.tested_at DESC NULLS LAST, mr.id DESC
        LIMIT ${f.limit} OFFSET ${offset}`);

    const countRes = await db.execute(sql`SELECT COUNT(*)::int AS n FROM mobile_reports mr WHERE ${where}`);
    const total = Number((countRes.rows[0] as { n: number })?.n ?? 0);
    return { reports: rows as Record<string, unknown>[], total };
}

/**
 * Public, UNSCOPED lookup for the /verify certificate endpoint — no auth, so it
 * exposes only the safe summary fields (no payload). Only SCORED reports are
 * verifiable certificates, mirroring the PC rule (`pramaan_score IS NOT NULL`).
 */
export async function findReportForVerify(reportId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await db.execute(sql`
        SELECT mr.report_id, mr.report_type, mr.grade, mr.score, mr.tested_at,
               mr.payload_json->>'appVersion' AS app_version,
               COALESCE(md.model, mr.device_snapshot_json->>'model', mr.payload_json->>'model') AS device_model,
               COALESCE(mr.device_snapshot_json->>'manufacturer', mr.payload_json->>'manufacturer') AS manufacturer
        FROM mobile_reports mr
        LEFT JOIN mobile_devices md
               ON md.customer_user_id = mr.customer_user_id AND md.device_id = mr.device_id
        WHERE mr.report_id = ${reportId} AND mr.grade IS NOT NULL
        LIMIT 1`);
    return (rows[0] as Record<string, unknown>) ?? null;
}

/** Full report (payload verbatim) scoped to the owner. */
export async function findReportByReportId(
    customerId: number,
    reportId: string
): Promise<Record<string, unknown> | null> {
    const { rows } = await db.execute(sql`
        SELECT report_id, report_type, test_type, result, score, grade,
               customer_user_id, device_id, tested_at, payload_json, device_snapshot_json,
               created_at
        FROM mobile_reports
        WHERE report_id = ${reportId} AND customer_user_id = ${customerId}
        LIMIT 1`);
    return (rows[0] as Record<string, unknown>) ?? null;
}
