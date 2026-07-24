import { and, desc, eq, gt, sql, type SQL } from 'drizzle-orm';
import { db, schema, type Tx } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { ownerVisibilitySql } from '@/lib/shared/domain/visibility';
import { GradeKey, ListQuery, RiskKey, SortKey } from '@/lib/platforms/windows/domain/schemas/qc-results';
import { APP_TIME_ZONE } from '@/lib/timezone';

const { qcResults, testResults, machines, licenseKeys, licenseKeyActivations, freeTrials } = schema;
const ISSUE_SCORE_THRESHOLD = 70;

/** Battery-present boolean derived from a row alias that carries the raw JSON column. */
function batteryPresentSql(resultAlias: string): string {
    return `(
    ${resultAlias}.battery_details_json IS NOT NULL
    AND (${resultAlias}.battery_details_json->>'isPresent')::boolean IS NOT FALSE
)`;
}

/**
 * Build the "has issues" EXISTS predicate.
 */
function hasIssuesExists(rowIdRef: string): string {
    return `EXISTS (
        SELECT 1
        FROM test_results tr
        JOIN qc_results issue_qr ON issue_qr.id = tr.qc_result_id
        WHERE tr.qc_result_id = ${rowIdRef}
          AND ${issueTestPredicateSql('tr', batteryPresentSql('issue_qr'))}
    )`;
}

/**
 * `batteryPresentExpr` is a boolean SQL expression, not a table alias: callers that
 * project the raw JSON pass batteryPresentSql(alias); callers that already carry a
 * precomputed flag (the list's page_rows CTE) pass that column instead.
 */
function issueTestPredicateSql(testAlias: string, batteryPresentExpr: string): string {
    return `(
        (
            LOWER(${testAlias}.test_type) LIKE 'cpu%'
            OR LOWER(${testAlias}.test_type) LIKE 'memory%'
            OR LOWER(${testAlias}.test_type) LIKE 'ram%'
            OR LOWER(${testAlias}.test_type) LIKE 'storage%'
            OR LOWER(${testAlias}.test_type) LIKE 'nvme%'
            OR LOWER(${testAlias}.test_type) LIKE 'ssd%'
            OR LOWER(${testAlias}.test_type) LIKE 'smart%'
            OR (
                (LOWER(${testAlias}.test_type) LIKE 'gpu%' OR LOWER(${testAlias}.test_type) LIKE 'graphics%')
                AND NOT (COALESCE(${testAlias}.score, 0) = 0 AND ${testAlias}.passed IS NOT FALSE)
            )
            OR (
                LOWER(${testAlias}.test_type) LIKE 'battery%'
                AND ${batteryPresentExpr}
            )
        )
        AND (${testAlias}.passed IS FALSE OR COALESCE(${testAlias}.score, 0) < ${ISSUE_SCORE_THRESHOLD})
    )`;
}

/**
 * Bucket-rank for a grade column, mirroring the UI's getGradeKey():
 * A+ < A < B < C < Unknown. `gradeCol` is a trusted column reference.
 */
function gradeRankSql(gradeCol: string): string {
    const g = `UPPER(TRIM(COALESCE(${gradeCol}, '')))`;
    return `CASE
        WHEN ${g} LIKE 'A+%' THEN 0
        WHEN ${g} LIKE 'A%'  THEN 1
        WHEN ${g} LIKE 'B%'  THEN 2
        WHEN ${g} LIKE 'C%'  THEN 3
        ELSE 4
    END`;
}

/** WHERE predicate matching a set of grade buckets against a grade column. */
function gradesFilterSql(gradeCol: string, grades: GradeKey[]): string {
    const g = `UPPER(TRIM(COALESCE(${gradeCol}, '')))`;
    const parts = grades.map((key) => {
        switch (key) {
            case 'A+':
                return `${g} LIKE 'A+%'`;
            case 'A':
                return `(${g} LIKE 'A%' AND ${g} NOT LIKE 'A+%')`;
            case 'B':
                return `${g} LIKE 'B%'`;
            case 'C':
                return `${g} LIKE 'C%'`;
            case 'D':
                return `${g} LIKE 'D%'`;
            case 'E':
                return `${g} LIKE 'E%'`;
            case 'F':
                return `${g} LIKE 'F%'`;
            case 'Reject':
                return `${g} LIKE 'REJECT%'`;
            case 'Unknown':
                return `(${gradeCol} IS NULL OR (${g} NOT LIKE 'A%' AND ${g} NOT LIKE 'B%' AND ${g} NOT LIKE 'C%' AND ${g} NOT LIKE 'D%' AND ${g} NOT LIKE 'E%' AND ${g} NOT LIKE 'F%' AND ${g} NOT LIKE 'REJECT%'))`;
        }
    });
    return `(${parts.join(' OR ')})`;
}

/**
 * WHERE predicate matching a set of risk-flag buckets, mirroring assetHealthSummary().
 * Multiple selected risks are OR'd (show assets flagged for ANY of them).
 */
function riskFilterSql(risks: RiskKey[]): string {
    const parts = risks.map((key) => {
        switch (key) {
            case 'storage':
                return `((qr.risk_flags->>'storage')::boolean IS TRUE OR (qr.risk_flags->>'criticalStorage')::boolean IS TRUE OR (qr.risk_flags->>'lowStorage')::boolean IS TRUE)`;
            case 'thermal':
                return `(qr.risk_flags->>'thermal')::boolean IS TRUE`;
            case 'tamper':
                return `((qr.storage_details_json->>'isTampered')::boolean IS TRUE OR (qr.battery_details_json->>'isTampered')::boolean IS TRUE)`;
        }
    });
    return `(${parts.join(' OR ')})`;
}

/**
 * ORDER BY clause for the list query. Column names are passed per-scope because
 * the inner CTE uses qc_results aliases (qr.*) while the outer SELECT reads the
 * page_rows projection. `sort` is a validated enum; all inputs are trusted.
 */
function orderBySql(sort: SortKey, cols: { ts: string; id: string; grade: string }): string {
    switch (sort) {
        case 'grade_desc':
            return `${gradeRankSql(cols.grade)} ASC, ${cols.ts} DESC, ${cols.id} DESC`;
        case 'grade_asc':
            return `${gradeRankSql(cols.grade)} DESC, ${cols.ts} DESC, ${cols.id} DESC`;
        case 'date_asc':
            return `${cols.ts} ASC, ${cols.id} ASC`;
        case 'id_asc':
            return `${cols.id} ASC`;
        case 'date_desc':
        default:
            return `${cols.ts} DESC, ${cols.id} DESC`;
    }
}

/** License/activation row fields consulted during submission. */
export interface LicenseRow {
    id: number;
    is_active: boolean;
    type: string;
    expires_at: string | null;
    demo_runs_used: number;
    demo_max_runs: number | null;
}

export interface ListResult {
    results: Record<string, unknown>[];
    total: number | null;
}

/** Paginated, role-scoped, filtered QC-results list (+ optional total count). */
export async function listQcResults(user: AuthenticatedUser, q: ListQuery): Promise<ListResult> {
    const conds: SQL[] = [];

    // Role-based row visibility (single source: domain/visibility).
    const scope = ownerVisibilitySql(user, 'qr.technician_id');
    if (scope) conds.push(scope);

    conds.push(sql`qr.is_hidden = false`);

    if (q.userId !== undefined) conds.push(sql`qr.technician_id = ${q.userId}`);
    if (q.refurbishId) conds.push(sql`qr.refurbish_id = ${q.refurbishId}`);
    if (q.overallPass !== undefined) conds.push(sql`qr.overall_pass = ${q.overallPass}`);
    if (q.machineId) conds.push(sql`m.machine_id = ${q.machineId}`);
    if (q.search) {
        const like = `%${q.search}%`;
        conds.push(sql`(
            COALESCE(m.computer_name, '') ILIKE ${like} OR
            COALESCE(m.machine_id, '') ILIKE ${like} OR
            CAST(qr.machine_id AS TEXT) ILIKE ${like} OR
            CAST(qr.id AS TEXT) ILIKE ${like}
        )`);
    }
    if (q.hasIssues) conds.push(sql.raw(hasIssuesExists('qr.id')));
    if (q.grades && q.grades.length) conds.push(sql.raw(gradesFilterSql('qr.health_grade', q.grades)));
    if (q.risk && q.risk.length) conds.push(sql.raw(riskFilterSql(q.risk)));
    // Inclusive date range. The picker sends calendar dates in APP_TIME_ZONE while
    // qc_results.timestamp is naive UTC, so convert the *boundaries* rather than the
    // column — that keeps idx_qc_results_timestamp usable. endDate covers the whole
    // day (< next midnight).
    if (q.startDate) conds.push(sql`qr.timestamp >= ((${q.startDate}::date)::timestamp AT TIME ZONE ${APP_TIME_ZONE} AT TIME ZONE 'UTC')`);
    if (q.endDate) conds.push(sql`qr.timestamp < ((${q.endDate}::date + INTERVAL '1 day')::timestamp AT TIME ZONE ${APP_TIME_ZONE} AT TIME ZONE 'UTC')`);

    const whereSql = conds.length ? sql.join(conds, sql` AND `) : sql`1=1`;
    const needsMachineJoin = !!q.machineId || !!q.search;

    const innerOrderBy = sql.raw(orderBySql(q.sort, { ts: 'qr.timestamp', id: 'qr.id', grade: 'qr.health_grade' }));
    const outerOrderBy = sql.raw(orderBySql(q.sort, { ts: 'timestamp', id: 'id', grade: 'health_grade' }));

    // Avoid selecting large JSON columns; compute has_issues only for the page.
    const listSql = sql`
      WITH page_rows AS (
        SELECT
          qr.id, qr.report_id, qr.machine_id, qr.timestamp, qr.overall_pass,
          qr.health_score, qr.health_grade, qr.system_manufacturer,
          qr.system_model, qr.system_serial, qr.app_version,
          m.machine_id as machine_identifier,
          m.computer_name,
          u.username as technician_username,
          u.display_name as technician_name,
          ${sql.raw(batteryPresentSql('qr'))} AS battery_present
        FROM qc_results qr
        LEFT JOIN machines m ON qr.machine_id = m.id
        LEFT JOIN users u ON qr.technician_id = u.id
        WHERE ${whereSql}
        ORDER BY ${innerOrderBy}
        LIMIT ${q.limit} OFFSET ${q.offset}
      )
      SELECT page_rows.*,
        ${sql.raw(hasIssuesExists('page_rows.id'))} AS has_issues,
        (
           SELECT tr.test_type || ': ' || tr.message
           FROM test_results tr
           WHERE tr.qc_result_id = page_rows.id
             AND ${sql.raw(issueTestPredicateSql('tr', 'page_rows.battery_present'))}
          ORDER BY tr.test_type ASC LIMIT 1
        ) AS latest_issue
      FROM page_rows
      ORDER BY ${outerOrderBy}
    `;

    if (!q.includeTotal) {
        const { rows } = await db.execute(listSql);
        return { results: rows as Record<string, unknown>[], total: null };
    }

    const countSql = needsMachineJoin
        ? sql`SELECT COUNT(*) as total FROM qc_results qr
              LEFT JOIN machines m ON qr.machine_id = m.id WHERE ${whereSql}`
        : sql`SELECT COUNT(*) as total FROM qc_results qr WHERE ${whereSql}`;

    const [listRes, countRes] = await Promise.all([db.execute(listSql), db.execute(countSql)]);
    const total = parseInt((countRes.rows[0] as { total?: string })?.total || '0', 10);
    return { results: listRes.rows as Record<string, unknown>[], total };
}

// ── Count / issues-summary / detail (read-only, via db.execute) ──

/**
 * Visibility for the count & issues-summary endpoints. NOTE: intentionally
 * narrower than the main list — OEM/Insurer are NOT team-scoped here (they fall
 * through to "see all"), preserving the exact pre-refactor behavior of those two
 * routes. Do not "unify" with ownerVisibilitySql without a deliberate decision.
 */
function countVisibilitySql(user: AuthenticatedUser): SQL | undefined {
    if (user.role === 'Technician' || user.role === 'Client' || user.role === 'B2CDevice') {
        return sql`qr.technician_id = ${user.id}`;
    }
    if (user.role === 'Refurbisher' || user.role === 'Enterprise' || user.role === 'Reseller') {
        return sql`(qr.technician_id = ${user.id} OR qr.technician_id IN (SELECT id FROM users WHERE created_by = ${user.id}))`;
    }
    return undefined;
}

export interface CountFilters {
    userId?: number;
    refurbishId?: string;
    overallPass?: boolean;
    machineId?: string;
    search?: string;
}

export async function countQcResults(user: AuthenticatedUser, f: CountFilters): Promise<number> {
    const conds: SQL[] = [];
    const vis = countVisibilitySql(user);
    if (vis) conds.push(vis);
    conds.push(sql`qr.is_hidden = false`);
    if (f.userId !== undefined) conds.push(sql`qr.technician_id = ${f.userId}`);
    if (f.refurbishId) conds.push(sql`qr.refurbish_id = ${f.refurbishId}`);
    if (f.overallPass !== undefined) conds.push(sql`qr.overall_pass = ${f.overallPass}`);
    if (f.machineId) conds.push(sql`m.machine_id = ${f.machineId}`);
    if (f.search) {
        const like = `%${f.search}%`;
        conds.push(sql`(
            COALESCE(m.computer_name, '') ILIKE ${like} OR
            COALESCE(m.machine_id, '') ILIKE ${like} OR
            CAST(qr.machine_id AS TEXT) ILIKE ${like} OR
            CAST(qr.id AS TEXT) ILIKE ${like}
        )`);
    }
    const whereSql = conds.length ? sql.join(conds, sql` AND `) : sql`1=1`;
    const q = (f.machineId || f.search)
        ? sql`SELECT COUNT(*) as total FROM qc_results qr LEFT JOIN machines m ON qr.machine_id = m.id WHERE ${whereSql}`
        : sql`SELECT COUNT(*) as total FROM qc_results qr WHERE ${whereSql}`;
    const { rows } = await db.execute(q);
    return parseInt((rows[0] as { total?: string })?.total ?? '0', 10);
}

/** Core-test "is issue" predicate (tr alias, latest-row alias lpm). */
function issuesCoreTestSql(): SQL {
    return sql.raw(issueTestPredicateSql('tr', batteryPresentSql('lpm')));
}

export async function issuesSummary(user: AuthenticatedUser): Promise<{ totalDevices: number; devicesWithIssues: number }> {
    const whereSql = countVisibilitySql(user) ?? sql`1=1`;
    const { rows } = await db.execute(sql`
      WITH latest_per_machine AS (
        SELECT DISTINCT ON (qr.machine_id)
           qr.id AS result_id, qr.machine_id, qr.health_score, qr.battery_details_json
        FROM qc_results qr
        WHERE ${whereSql} AND qr.is_hidden = false
        ORDER BY qr.machine_id, qr.timestamp DESC, qr.id DESC
      ),
      issues AS (
         SELECT lpm.machine_id
         FROM latest_per_machine lpm
         JOIN test_results tr ON tr.qc_result_id = lpm.result_id
         WHERE ${issuesCoreTestSql()}
      )
      SELECT
        (SELECT COUNT(*) FROM latest_per_machine) AS total_devices,
        (SELECT COUNT(*) FROM issues) AS devices_with_issues`);
    const row = (rows[0] as { total_devices?: string; devices_with_issues?: string }) ?? {};
    return {
        totalDevices: parseInt(row.total_devices ?? '0', 10),
        devicesWithIssues: parseInt(row.devices_with_issues ?? '0', 10),
    };
}

/** Single QC result with machine info, role-scoped (full TEAM_ROLES visibility). */
export async function findResultById(user: AuthenticatedUser, id: number): Promise<Record<string, unknown> | null> {
    const vis = ownerVisibilitySql(user, 'qr.technician_id');
    const visClause = vis ? sql` AND ${vis}` : sql``;
    const { rows } = await db.execute(sql`
        SELECT
            qr.id, qr.report_id, qr.machine_id, qr.timestamp, qr.refurbish_id, qr.technician_notes,
            qr.technician_label,
            qr.technician_id,
            qr.overall_pass, qr.overall_score, qr.overall_grade, qr.health_score, qr.health_grade,
            qr.category_scores, qr.risk_flags, qr.scoring_algorithm_version, qr.health_hash,
            qr.health_id, qr.submission_ip, qr.app_version, qr.system_manufacturer, qr.system_model,
            qr.system_serial, qr.mac_address, qr.cpu_model, qr.ram_total, qr.system_info_json,
            qr.ram_details_json, qr.storage_details_json, qr.battery_details_json,
            qr.physical_condition, qr.scratches_and_dents,
            m.machine_id as machine_identifier, m.location as machine_location,
            m.manufacturer as machine_manufacturer, m.model as machine_model, m.computer_name,
            u.username as technician_username, u.display_name as technician_name
        FROM qc_results qr
        LEFT JOIN machines m ON qr.machine_id = m.id
        LEFT JOIN users u ON qr.technician_id = u.id
        WHERE qr.id = ${id}${visClause}`);
    return (rows[0] as Record<string, unknown>) ?? null;
}

/** test_results for a QC result (SELECT * — snake_case keys preserved for the API). */
export async function listTestResultsFor(qcResultId: number): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT * FROM test_results WHERE qc_result_id = ${qcResultId} ORDER BY test_type`);
    return rows as Record<string, unknown>[];
}

/** The QC result immediately preceding `timestamp` for a machine (change detection). */
export async function findPreviousResult(machineId: number, timestamp: string | Date): Promise<Record<string, unknown> | null> {
    const { rows } = await db.execute(sql`
        SELECT id, report_id, timestamp, cpu_model, ram_total,
               storage_details_json, battery_details_json, ram_details_json, system_serial
        FROM qc_results
        WHERE machine_id = ${machineId} AND timestamp < ${timestamp}
        ORDER BY timestamp DESC
        LIMIT 1`);
    return (rows[0] as Record<string, unknown>) ?? null;
}

/** Latest QC result per machine, role-scoped + optional search, for export. */
export async function listLatestPerMachineForExport(
    user: AuthenticatedUser,
    opts: { search?: string; userId?: number }
): Promise<Record<string, unknown>[]> {
    const conds: SQL[] = [sql`qr.is_hidden = false`];
    const vis = ownerVisibilitySql(user, 'qr.technician_id');
    if (vis) conds.push(vis);
    if (opts.userId !== undefined) conds.push(sql`qr.technician_id = ${opts.userId}`);
    const baseWhere = conds.length ? sql.join(conds, sql` AND `) : sql`1=1`;
    const searchWhere = opts.search
        ? sql`(COALESCE(numbered.computer_name, '') ILIKE ${`%${opts.search}%`} OR COALESCE(numbered.machine_identifier, '') ILIKE ${`%${opts.search}%`})`
        : sql`1=1`;

    const { rows } = await db.execute(sql`
        WITH filtered AS (
            SELECT
                qr.*,
                m.machine_id as machine_identifier,
                m.computer_name,
                u.username as technician_username,
                u.display_name as technician_name
            FROM qc_results qr
            LEFT JOIN machines m ON qr.machine_id = m.id
            LEFT JOIN users u ON qr.technician_id = u.id
            WHERE ${baseWhere}
        ),
        numbered AS (
            SELECT filtered.*,
                ROW_NUMBER() OVER (PARTITION BY filtered.machine_id ORDER BY filtered.timestamp DESC, filtered.id DESC) AS scoped_test_id
            FROM filtered
        )
        SELECT * FROM numbered
        WHERE ${searchWhere} AND scoped_test_id = 1
        ORDER BY LOWER(COALESCE(computer_name, machine_identifier, '')), timestamp DESC`);
    return rows as Record<string, unknown>[];
}

/**
 * Fetch the newest `goodCount` results with good grades (A+/A/B) and
 * `poorCount` results with poor grades (C/D) for the sample dataset export.
 * Excludes records where storage OR battery is tampered or inconclusive.
 * Returns at most goodCount + poorCount rows, ordered newest-first.
 */
export async function listResultsByGradesForSample(
    user: AuthenticatedUser,
    opts: { goodGrades: string[]; goodCount: number; poorGrades: string[]; poorCount: number }
): Promise<Record<string, unknown>[]> {
    const vis = ownerVisibilitySql(user, 'qr.technician_id');
    const visClause = vis ? sql`AND ${vis}` : sql``;

    // Exclusion filter: skip tampered or inconclusive storage/battery
    const excludeSql = sql.raw(`
        AND (qr.storage_details_json IS NULL OR (
            (qr.storage_details_json->>'isTampered')::boolean IS NOT TRUE
            AND (qr.storage_details_json->>'isInconclusive')::boolean IS NOT TRUE
        ))
        AND (qr.battery_details_json IS NULL OR (
            (qr.battery_details_json->>'isTampered')::boolean IS NOT TRUE
            AND (qr.battery_details_json->>'isInconclusive')::boolean IS NOT TRUE
        ))
        AND qr.is_hidden = false
    `);

    const goodGradeList = opts.goodGrades.map(g => `'${g}'`).join(', ');
    const poorGradeList = opts.poorGrades.map(g => `'${g}'`).join(', ');
    const goodCountVal = Math.max(0, opts.goodCount);
    const poorCountVal = Math.max(0, opts.poorCount);

    const { rows } = await db.execute(sql`
        WITH base AS (
            SELECT
                qr.*,
                m.machine_id   AS machine_identifier,
                m.computer_name,
                u.username     AS technician_username,
                u.display_name AS technician_name
            FROM qc_results qr
            LEFT JOIN machines m ON qr.machine_id = m.id
            LEFT JOIN users u   ON qr.technician_id = u.id
            WHERE qr.health_grade IS NOT NULL
              ${visClause}
              ${excludeSql}
        ),
        good_rows AS (
            SELECT * FROM base
            WHERE health_grade IN (${sql.raw(goodGradeList)})
            ORDER BY timestamp DESC, id DESC
            LIMIT ${goodCountVal}
        ),
        poor_rows AS (
            SELECT * FROM base
            WHERE health_grade IN (${sql.raw(poorGradeList)})
            ORDER BY timestamp DESC, id DESC
            LIMIT ${poorCountVal}
        )
        SELECT * FROM good_rows
        UNION ALL
        SELECT * FROM poor_rows
        ORDER BY timestamp DESC, id DESC
    `);
    return rows as Record<string, unknown>[];
}

/** Also fetch test_results for a set of QC result IDs (used by sample PDF export). */
export async function listTestResultsForIds(ids: number[]): Promise<Record<string, unknown>[]> {
    if (ids.length === 0) return [];
    const idList = ids.join(', ');
    const { rows } = await db.execute(sql`
        SELECT * FROM test_results
        WHERE qc_result_id IN (${sql.raw(idList)})
        ORDER BY qc_result_id, test_type
    `);
    return rows as Record<string, unknown>[];
}

/** Public verification lookup by health_id (only scored results). */
export async function findCertByHealthId(healthId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await db.execute(sql`
        SELECT report_id, health_id, health_hash, health_score, health_grade,
               scoring_algorithm_version, app_version, timestamp, system_model, system_manufacturer
        FROM qc_results
        WHERE health_id = ${healthId} AND health_score IS NOT NULL`);
    return (rows[0] as Record<string, unknown>) ?? null;
}

// ── Submission-path queries (run inside a Drizzle transaction, tx) ──

export async function findIdByReportId(tx: Tx, reportId: string): Promise<number | null> {
    const rows = await tx.select({ id: qcResults.id }).from(qcResults)
        .where(eq(qcResults.reportId, reportId)).limit(1);
    return rows[0]?.id ?? null;
}

export async function findLatestActivation(tx: Tx, machineSerial: string): Promise<LicenseRow | null> {
    const rows = await tx
        .select({
            id: licenseKeys.id,
            is_active: licenseKeys.isActive,
            type: licenseKeys.type,
            expires_at: licenseKeys.expiresAt,
            demo_runs_used: licenseKeys.demoRunsUsed,
            demo_max_runs: licenseKeys.demoMaxRuns,
        })
        .from(licenseKeyActivations)
        .innerJoin(licenseKeys, eq(licenseKeys.id, licenseKeyActivations.licenseKeyId))
        .where(eq(licenseKeyActivations.machineSerial, machineSerial))
        .orderBy(desc(licenseKeyActivations.activatedAt))
        .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
        id: r.id,
        is_active: r.is_active ?? false,
        type: r.type,
        expires_at: r.expires_at,
        demo_runs_used: r.demo_runs_used ?? 0,
        demo_max_runs: r.demo_max_runs,
    };
}

export async function hasActiveTrial(tx: Tx, machineSerial: string): Promise<boolean> {
    const rows = await tx.select({ id: freeTrials.id }).from(freeTrials)
        .where(and(
            eq(freeTrials.machineSerial, machineSerial),
            eq(freeTrials.isActive, true),
            gt(freeTrials.trialEndUtc, sql`NOW()`)
        )).limit(1);
    return rows.length > 0;
}

export async function findMachineId(tx: Tx, machineIdRaw: string): Promise<number | null> {
    const numeric = /^[0-9]+$/.test(machineIdRaw) ? parseInt(machineIdRaw, 10) : null;
    if (numeric !== null) {
        const byId = await tx.select({ id: machines.id }).from(machines).where(eq(machines.id, numeric)).limit(1);
        if (byId[0]) return byId[0].id;
    }
    const bySerial = await tx.select({ id: machines.id }).from(machines).where(eq(machines.machineId, machineIdRaw)).limit(1);
    return bySerial[0]?.id ?? null;
}

interface MachineFields {
    serialNumber?: string | null;
    macAddress?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    computerName?: string | null;
}

export async function touchMachine(tx: Tx, id: number, f: MachineFields): Promise<void> {
    // COALESCE(new, existing) keeps the current value when a field is absent.
    await tx.update(machines).set({
        lastSeen: sql`NOW()`,
        serialNumber: sql`COALESCE(${f.serialNumber ?? null}::varchar, ${machines.serialNumber})`,
        macAddress: sql`COALESCE(${f.macAddress ?? null}::varchar, ${machines.macAddress})`,
        manufacturer: sql`COALESCE(${f.manufacturer ?? null}::varchar, ${machines.manufacturer})`,
        model: sql`COALESCE(${f.model ?? null}::varchar, ${machines.model})`,
        computerName: sql`COALESCE(${f.computerName ?? null}::varchar, ${machines.computerName})`,
    }).where(eq(machines.id, id));
}

export async function insertMachine(tx: Tx, machineId: string, f: MachineFields): Promise<number> {
    const rows = await tx.insert(machines).values({
        machineId,
        serialNumber: f.serialNumber ?? null,
        macAddress: f.macAddress ?? null,
        manufacturer: f.manufacturer ?? null,
        model: f.model ?? null,
        computerName: f.computerName ?? null,
        lastSeen: sql`NOW()`,
    }).returning({ id: machines.id });
    return rows[0].id;
}

/** Typed payload for a new qc_results row (jsonb fields take raw objects). */
export interface NewQcResult {
    reportId: string;
    machineId: number;
    refurbishId: string | null;
    technicianNotes: string | null;
    technicianLabel: string | null;
    appVersion: string | null;
    overallPass: boolean;
    overallScore: number;
    overallGrade: string;
    systemManufacturer: string | null;
    systemModel: string | null;
    systemSerial: string | null;
    macAddress: string | null;
    cpuModel: string | null;
    ramTotal: number | null;
    systemInfoJson: unknown;
    cpuDetailsJson: unknown;
    ramDetailsJson: unknown;
    storageDetailsJson: unknown;
    batteryDetailsJson: unknown;
    deviceDetailsJson: unknown;
    submissionIp: string | null;
    technicianId: number | null;
    healthScore: number | null;
    healthId: string | null;
    healthHash: string | null;
    healthGrade: string | null;
    categoryScores: unknown;
    riskFlags: unknown;
    scoringAlgorithmVersion: string | null;
    isDemo: boolean;
    demoLicenseKeyId: number | null;
    physicalCondition: string | null;
    scratchesAndDents: string | null;
}

export async function insertQcResult(tx: Tx, v: NewQcResult): Promise<number> {
    const rows = await tx.insert(qcResults).values({
        reportId: v.reportId,
        machineId: v.machineId,
        timestamp: sql`NOW()`,
        refurbishId: v.refurbishId,
        technicianNotes: v.technicianNotes,
        technicianLabel: v.technicianLabel,
        appVersion: v.appVersion,
        overallPass: v.overallPass,
        overallScore: v.overallScore,
        overallGrade: v.overallGrade,
        systemManufacturer: v.systemManufacturer,
        systemModel: v.systemModel,
        systemSerial: v.systemSerial,
        macAddress: v.macAddress,
        cpuModel: v.cpuModel,
        ramTotal: v.ramTotal,
        systemInfoJson: v.systemInfoJson,
        cpuDetailsJson: v.cpuDetailsJson,
        ramDetailsJson: v.ramDetailsJson,
        storageDetailsJson: v.storageDetailsJson,
        batteryDetailsJson: v.batteryDetailsJson,
        deviceDetailsJson: v.deviceDetailsJson,
        submissionIp: v.submissionIp,
        technicianId: v.technicianId,
        healthScore: v.healthScore,
        healthId: v.healthId,
        healthHash: v.healthHash,
        healthGrade: v.healthGrade,
        categoryScores: v.categoryScores,
        riskFlags: v.riskFlags,
        scoringAlgorithmVersion: v.scoringAlgorithmVersion,
        isDemo: v.isDemo,
        demoLicenseKeyId: v.demoLicenseKeyId,
        physicalCondition: v.physicalCondition,
        scratchesAndDents: v.scratchesAndDents,
    }).returning({ id: qcResults.id });
    return rows[0].id;
}

export interface NewTestResult {
    qcResultId: number;
    testType: string;
    tested: boolean;
    passed: boolean;
    score: number;
    grade: string;
    message: string | null;
    detailsJson: unknown;
}

export async function insertTestResult(tx: Tx, v: NewTestResult): Promise<void> {
    await tx.insert(testResults).values({
        qcResultId: v.qcResultId,
        testType: v.testType,
        tested: v.tested,
        passed: v.passed,
        score: v.score,
        grade: v.grade,
        message: v.message,
        detailsJson: v.detailsJson,
        timestamp: sql`NOW()`,
    });
}

export async function incrementDemoRuns(tx: Tx, demoKeyId: number): Promise<void> {
    await tx.update(licenseKeys).set({
        demoRunsUsed: sql`COALESCE(demo_runs_used, 0) + 1`,
        isActive: sql`CASE WHEN COALESCE(demo_runs_used, 0) + 1 >= COALESCE(demo_max_runs, 1) THEN false ELSE is_active END`,
    }).where(eq(licenseKeys.id, demoKeyId));
}

export async function hideQcResult(user: AuthenticatedUser, id: number): Promise<void> {
    const vis = ownerVisibilitySql(user, 'technician_id');
    const visClause = vis ? sql` AND ${vis}` : sql``;
    
    await db.execute(sql`
        UPDATE qc_results
        SET is_hidden = true
        WHERE id = ${id}${visClause}
    `);
}

export async function assetHealthSummary(user: AuthenticatedUser): Promise<{
    totalAssets: number;
    healthyAssets: number;
    atRiskAssets: number;
    rejectAssets: number;
    storageIssues: number;
    thermalIssues: number;
    tamperFlags: number;
}> {
    const whereSql = countVisibilitySql(user) ?? sql`1=1`;
    const { rows } = await db.execute(sql`
        WITH latest_per_machine AS (
            SELECT DISTINCT ON (qr.machine_id)
                qr.id,
                COALESCE(qr.health_grade, qr.overall_grade) as resolved_grade,
                qr.storage_details_json,
                qr.battery_details_json,
                qr.risk_flags
            FROM qc_results qr
            WHERE ${whereSql} AND qr.is_hidden = false
            ORDER BY qr.machine_id, qr.timestamp DESC, qr.id DESC
        )
        SELECT
            COUNT(*) AS total_assets,
            COUNT(*) FILTER (WHERE resolved_grade IN ('A+', 'A', 'B')) AS healthy_assets,
            COUNT(*) FILTER (WHERE resolved_grade IN ('C', 'D', 'E')) AS at_risk_assets,
            COUNT(*) FILTER (WHERE resolved_grade IN ('F', 'Reject')) AS reject_assets,
            COUNT(*) FILTER (WHERE (risk_flags->>'storage')::boolean IS TRUE OR (risk_flags->>'criticalStorage')::boolean IS TRUE OR (risk_flags->>'lowStorage')::boolean IS TRUE) AS storage_issues,
            COUNT(*) FILTER (WHERE (risk_flags->>'thermal')::boolean IS TRUE) AS thermal_issues,
            COUNT(*) FILTER (WHERE (storage_details_json->>'isTampered')::boolean IS TRUE OR (battery_details_json->>'isTampered')::boolean IS TRUE) AS tamper_flags
        FROM latest_per_machine
    `);

    const row = rows[0] as any || {};
    return {
        totalAssets: parseInt(row.total_assets ?? '0', 10),
        healthyAssets: parseInt(row.healthy_assets ?? '0', 10),
        atRiskAssets: parseInt(row.at_risk_assets ?? '0', 10),
        rejectAssets: parseInt(row.reject_assets ?? '0', 10),
        storageIssues: parseInt(row.storage_issues ?? '0', 10),
        thermalIssues: parseInt(row.thermal_issues ?? '0', 10),
        tamperFlags: parseInt(row.tamper_flags ?? '0', 10),
    };
}
