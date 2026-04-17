import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { authenticateRequest } from "@/lib/auth-middleware"
import { ApiError } from "@/lib/types"

// Peripheral test types that are EXCLUDED from issue detection (server-side mirror of lib/issues.ts)
const PERIPHERAL_PREFIXES = [
    "keyboard",
    "touchpad",
    "trackpad",
    "webcam",
    "camera",
    "speakers",
    "speaker",
    "microphone",
    "mic",
    "screen",
    "display",
    "usb",
    "thunderbolt",
    "hdmi",
    "sd card",
    "sdcard",
    "ethernet",
    "lan",
    "bluetooth",
    "wifi",
    "wi-fi",
    "wireless",
    "ports",
    "physical ports",
    "fingerprint",
    "numpad",
    "number pad",
]

// Build a SQL expression that returns true for peripheral test types
// Uses LOWER() + LIKE to match the same logic as the client-side isPeripheral()
function buildPeripheralExclusionSql(): string {
    return PERIPHERAL_PREFIXES.map(
        (p) => `LOWER(tr.test_type) LIKE '${p.replace(/'/g, "''")}%'`
    ).join(" OR ")
}

/**
 * GET /api/qc-results/issues-summary
 *
 * Returns:
 *   { devicesWithIssues: number, totalDevices: number }
 *
 * Considers only the LATEST QC report per machine (scoped by role).
 * A device has an "issue" if any of its non-peripheral test results have score < 70.
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
        const peripheralExclusion = buildPeripheralExclusionSql()

        // Step 1: Get the latest report ID per machine (within the user's scope)
        // Step 2: For those reports, count how many have ≥1 non-peripheral test with score < 70
        const sql = `
      WITH latest_per_machine AS (
        SELECT DISTINCT ON (qr.machine_id)
          qr.id AS result_id,
          qr.machine_id
        FROM qc_results qr
        WHERE ${whereSql}
        ORDER BY qr.machine_id, qr.timestamp DESC, qr.id DESC
      ),
      issues AS (
        SELECT DISTINCT lpm.machine_id
        FROM latest_per_machine lpm
        JOIN test_results tr ON tr.qc_result_id = lpm.result_id
        WHERE tr.score < 70
          AND NOT (${peripheralExclusion})
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
