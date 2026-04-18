import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { authenticateRequest } from "@/lib/auth-middleware"
import { ApiError } from "@/lib/types"

// Core test type prefixes — only these 5 categories count as issues (server-side mirror of lib/issues.ts)
const CORE_PREFIXES = ["cpu", "memory", "ram", "storage", "nvme", "ssd", "smart", "battery"]

function buildCoreTestSql(trAlias = "tr", qrAlias = "qr"): string {
    // Non-battery, non-GPU prefixes — just need score < 70
    const nonBatteryClauses = CORE_PREFIXES.filter((p) => p !== "battery")
        .map((p) => `LOWER(${trAlias}.test_type) LIKE '${p}%'`)
        .join("\n        OR ")

    return `(
        (
          ${nonBatteryClauses}
        )
        OR (
          -- GPU score=0 means "no discrete GPU present" — not an issue; only flag when score > 0
          (LOWER(${trAlias}.test_type) LIKE 'gpu%' OR LOWER(${trAlias}.test_type) LIKE 'graphics%')
          AND ${trAlias}.score > 0
        )
        OR (
          LOWER(${trAlias}.test_type) LIKE 'battery%'
          AND ${qrAlias}.battery_details_json IS NOT NULL
          AND (${qrAlias}.battery_details_json->>'isPresent')::boolean IS NOT FALSE
        )
    )`
}


/**
 * GET /api/qc-results/issues-summary
 *
 * Returns:
 *   { devicesWithIssues: number, totalDevices: number }
 *
 * Considers only the LATEST QC report per machine (scoped by role).
 * A device has an "issue" if any core test (CPU/GPU/Memory/Storage/Battery)
 * in its latest report has score < 70. Battery tests are skipped for desktops.
 */
export async function GET(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request)
        if (authError) return authError
        if (!authUser) {
            return NextResponse.json(
                { error: "Authentication Error", message: "Not authenticated" } as ApiError,
                { status: 401 }
            )
        }

        // Role-based scoping — same pattern as the main qc-results GET
        const whereClauses: string[] = ["1=1"]
        const params: (string | number | boolean)[] = []
        let paramCount = 1

        if (
            authUser.role === "Technician" ||
            authUser.role === "Client" ||
            authUser.role === "B2CDevice"
        ) {
            whereClauses.push(`qr.technician_id = $${paramCount}`)
            params.push(authUser.id)
            paramCount++
        } else if (
            authUser.role === "Refurbisher" ||
            authUser.role === "Enterprise" ||
            authUser.role === "Reseller"
        ) {
            whereClauses.push(
                `(qr.technician_id = $${paramCount} OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $${paramCount}))`
            )
            params.push(authUser.id)
            paramCount++
        }

        const whereSql = whereClauses.join(" AND ")
        const coreTestSql = buildCoreTestSql("tr", "lpm")

        const sql = `
      WITH latest_per_machine AS (
        SELECT DISTINCT ON (qr.machine_id)
          qr.id               AS result_id,
          qr.machine_id,
          qr.battery_details_json
        FROM qc_results qr
        WHERE ${whereSql}
        ORDER BY qr.machine_id, qr.timestamp DESC, qr.id DESC
      ),
      issues AS (
        SELECT DISTINCT lpm.machine_id
        FROM latest_per_machine lpm
        JOIN test_results tr ON tr.qc_result_id = lpm.result_id
        WHERE tr.score < 70
          AND ${coreTestSql}
      )
      SELECT
        (SELECT COUNT(*) FROM latest_per_machine) AS total_devices,
        (SELECT COUNT(*) FROM issues)              AS devices_with_issues
    `

        const result = await query(sql, params)
        const row = result[0] ?? { total_devices: 0, devices_with_issues: 0 }

        return NextResponse.json({
            totalDevices: parseInt(row.total_devices ?? "0", 10),
            devicesWithIssues: parseInt(row.devices_with_issues ?? "0", 10),
        })
    } catch (error) {
        console.error("Error fetching issues summary:", error)
        return NextResponse.json(
            { error: "Server Error", message: "Failed to fetch issues summary" } as ApiError,
            { status: 500 }
        )
    }
}
