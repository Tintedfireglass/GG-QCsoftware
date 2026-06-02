import { db } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { SELF_ONLY_ROLES } from '@/lib/domain/visibility';
import { ListQuery, SubmitInput } from '@/lib/domain/schemas/qc-results';
import { ConflictError, ForbiddenError, NotFoundError, AppError } from '@/lib/http/errors';
import * as repo from '@/lib/repositories/qc-results.repo';
import type { LicenseRow } from '@/lib/repositories/qc-results.repo';

/** Normalize free-form grades from desktop clients into stored grade codes. */
function normalizeDbGrade(rawGrade?: string | null): string {
    if (!rawGrade) return '';
    const trimmed = rawGrade.trim();
    if (!trimmed) return '';
    const upper = trimmed.toUpperCase();
    if (['N/A', 'NA', 'NONE', '-'].includes(upper)) return '';
    if (['REJECT', 'FAIL', 'FAILED'].includes(upper)) return 'F';
    if (['PASS', 'PASSED'].includes(upper)) return 'A';
    return trimmed.length <= 2 ? trimmed : trimmed.slice(0, 2);
}

export interface ListResponse {
    results: Record<string, unknown>[];
    pagination: { total: number | null; limit: number; offset: number; hasMore: boolean };
}

export async function listResults(user: AuthenticatedUser, q: ListQuery): Promise<ListResponse> {
    // Self-only roles may not filter to another user's results.
    if (q.userId !== undefined && SELF_ONLY_ROLES.includes(user.role) && q.userId !== user.id) {
        throw new ForbiddenError('You can only filter your own results');
    }

    const { results, total } = await repo.listQcResults(user, q);
    return {
        results,
        pagination: {
            total,
            limit: q.limit,
            offset: q.offset,
            hasMore: total === null ? results.length === q.limit : q.offset + q.limit < total,
        },
    };
}

export async function countResults(user: AuthenticatedUser, q: ListQuery): Promise<{ total: number }> {
    if (q.userId !== undefined && SELF_ONLY_ROLES.includes(user.role) && q.userId !== user.id) {
        throw new ForbiddenError('You can only filter your own results');
    }
    const total = await repo.countQcResults(user, {
        userId: q.userId,
        refurbishId: q.refurbishId,
        overallPass: q.overallPass,
        machineId: q.machineId,
        search: q.search,
    });
    return { total };
}

export function issuesSummary(user: AuthenticatedUser) {
    return repo.issuesSummary(user);
}

export async function getResultDetail(user: AuthenticatedUser, id: string) {
    const resultId = parseInt(id, 10);
    if (!Number.isInteger(resultId) || resultId <= 0) throw new NotFoundError('QC result not found');

    const qcResult = await repo.findResultById(user, resultId);
    if (!qcResult) throw new NotFoundError('QC result not found');

    const test_results = await repo.listTestResultsFor(qcResult.id as number);
    const previous_result = qcResult.machine_id
        ? await repo.findPreviousResult(qcResult.machine_id as number, qcResult.timestamp as string | Date)
        : null;

    return { ...qcResult, test_results, previous_result };
}

/** Flag storage as tampered: 0% health but a passed SMART self-test. Mutates `body`. */
function applyTamperDetection(body: SubmitInput): void {
    const devices = body.storageDetails?.devices;
    if (!Array.isArray(devices)) return;

    const smartTest = body.testResults.find((t) => t.testType === 'SMART' || t.testType === 'Smart');
    const storageTest = body.testResults.find((t) => t.testType === 'Storage');
    const smartDetails: unknown[] = Array.isArray(smartTest?.details)
        ? smartTest!.details
        : Array.isArray(storageTest?.details)
            ? storageTest!.details
            : [];

    let tampered = false;
    for (const device of devices) {
        if (device.healthPercent === 0) {
            const passedSelfTest = smartDetails.some(
                (d: unknown) => typeof d === 'string' && d.includes('Self-Test Passed') && device.model && d.includes(device.model)
            );
            if (passedSelfTest) {
                device.isTampered = true;
                device.tamperReason = 'Storage Tampered - Unable to read data';
                tampered = true;
            }
        }
    }
    if (!tampered) return;

    body.storageDetails.isTampered = true;
    body.storageDetails.tamperReason = 'Storage Tampered - Unable to read data';
    if (storageTest) {
        storageTest.passed = false;
        storageTest.score = 0;
        storageTest.grade = 'F';
        storageTest.message = 'Storage Tampered - Unable to read data';
        storageTest.details = ['Storage Tampered - Unable to read data'];
    }
    body.overallPass = false;
    if (body.overallScore !== undefined && body.overallScore > 0) body.overallGrade = 'F';
}

const LICENSE_ERRORS: Record<string, AppError> = {
    NO_ACTIVATION: new ForbiddenError('This machine is not activated with a license key'),
    KEY_DISABLED: new ForbiddenError('The license key for this machine has been disabled'),
    KEY_EXPIRED: new ForbiddenError('The license key for this machine has expired'),
    DEMO_USED: new ForbiddenError('This demo license has already been used'),
};

/** Validate the machine's license/trial standing; returns demo metadata. */
function evaluateLicense(license: LicenseRow | null): { code: string | null } {
    if (!license) return { code: 'NO_ACTIVATION' };
    if (!license.is_active) return { code: 'KEY_DISABLED' };
    if (license.expires_at && new Date(license.expires_at) < new Date()) return { code: 'KEY_EXPIRED' };
    if (license.type === 'demo' && license.demo_runs_used >= (license.demo_max_runs || 1)) {
        return { code: 'DEMO_USED' };
    }
    return { code: null };
}

export interface SubmitResult {
    id: number;
    reportId: string;
    demoExhausted: boolean;
}

export async function submitResult(
    body: SubmitInput,
    authUserId: number | null,
    submissionIp: string | null
): Promise<SubmitResult> {
    applyTamperDetection(body);

    const machineIdRaw = body.machineId.trim();
    let demoKeyId: number | null = null;
    let isDemo = false;
    let demoExhausted = false;

    const id = await db.transaction(async (tx) => {
        if (await repo.findIdByReportId(tx, body.reportId)) {
            throw new ConflictError('Report ID already exists');
        }

        let license = await repo.findLatestActivation(tx, machineIdRaw);
        const { code } = evaluateLicense(license);

        // No valid license: fall back to an active free trial.
        if (code !== null) {
            if (await repo.hasActiveTrial(tx, machineIdRaw)) {
                license = null;
            } else {
                throw LICENSE_ERRORS[code];
            }
        } else if (license?.type === 'demo') {
            isDemo = true;
            demoKeyId = license.id;
            demoExhausted = license.demo_runs_used + 1 >= (license.demo_max_runs || 1);
        }

        const mf = {
            serialNumber: body.systemInfo?.serialNumber ?? null,
            macAddress: body.systemInfo?.macAddress ?? null,
            manufacturer: body.systemInfo?.manufacturer ?? null,
            model: body.systemInfo?.model ?? null,
            computerName: body.systemInfo?.computerName ?? null,
        };
        let machineDbId = await repo.findMachineId(tx, machineIdRaw);
        if (machineDbId !== null) {
            await repo.touchMachine(tx, machineDbId, mf);
        } else {
            machineDbId = await repo.insertMachine(tx, machineIdRaw, mf);
        }

        // jsonb columns take raw objects — Drizzle serializes (no JSON.stringify).
        const qcResultId = await repo.insertQcResult(tx, {
            reportId: body.reportId,
            machineId: machineDbId,
            refurbishId: body.refurbishId || null,
            technicianNotes: body.technicianNotes || null,
            appVersion: body.appVersion || null,
            overallPass: body.overallPass,
            overallScore: body.overallScore || 0,
            overallGrade: normalizeDbGrade(body.overallGrade),
            systemManufacturer: body.systemInfo?.manufacturer || null,
            systemModel: body.systemInfo?.model || null,
            systemSerial: body.systemInfo?.serialNumber || null,
            macAddress: body.systemInfo?.macAddress || null,
            cpuModel: body.systemInfo?.cpuModel || null,
            ramTotal: body.systemInfo?.ramTotal || null,
            systemInfoJson: body.systemInfo ?? null,
            cpuDetailsJson: body.cpuDetails ?? null,
            ramDetailsJson: body.ramDetails ?? null,
            storageDetailsJson: body.storageDetails ?? null,
            batteryDetailsJson: body.batteryDetails ?? null,
            deviceDetailsJson: body.deviceDetails ?? null,
            submissionIp,
            technicianId: body.technicianId || authUserId || null,
            pramaanScore: body.pramaanScore ?? null,
            healthId: body.healthId || null,
            pramaanHash: body.pramaanHash || null,
            pramaanGrade: body.pramaanGrade || null,
            pramaanCategoryScores: body.pramaanCategoryScores ?? null,
            pramaanRiskFlags: body.pramaanRiskFlags ?? null,
            pramaanAlgorithmVersion: body.pramaanAlgorithmVersion || null,
            isDemo,
            demoLicenseKeyId: demoKeyId,
        });

        for (const test of body.testResults) {
            await repo.insertTestResult(tx, {
                qcResultId,
                testType: test.testType,
                tested: test.tested,
                passed: test.passed,
                score: test.score || 0,
                grade: normalizeDbGrade(test.grade),
                message: test.message || null,
                detailsJson: test.details ?? null,
            });
        }

        if (isDemo && demoKeyId) await repo.incrementDemoRuns(tx, demoKeyId);
        return qcResultId;
    });

    return { id, reportId: body.reportId, demoExhausted };
}
