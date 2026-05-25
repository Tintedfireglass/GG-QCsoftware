import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { authenticateRequest, requireRole } from "@/lib/auth-middleware"

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ serial: string }> }
) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request)
        if (authError || !authUser) return authError || NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const roleError = requireRole(authUser, ["SuperAdmin"])
        if (roleError) return roleError

        const { serial } = await params
        if (!serial) {
            return NextResponse.json({ error: "Missing serial" }, { status: 400 })
        }

        // Decode the serial in case it's URL-encoded
        const machineSerial = decodeURIComponent(serial)

        // Fetch QC results for this machine serial via the machines table
        const results = await query(
            `SELECT
                qr.id,
                qr.report_id,
                qr.timestamp,
                qr.overall_pass,
                qr.overall_score,
                qr.overall_grade,
                qr.pramaan_score,
                qr.pramaan_grade,
                qr.system_manufacturer,
                qr.system_model,
                qr.system_serial,
                qr.cpu_model,
                qr.ram_total,
                qr.app_version,
                m.machine_id AS machine_identifier,
                m.computer_name
            FROM qc_results qr
            JOIN machines m ON qr.machine_id = m.id
            WHERE m.serial_number = $1
               OR m.machine_id = $1
            ORDER BY qr.timestamp DESC
            LIMIT 50`,
            [machineSerial]
        )

        // For each QC result, also fetch the test results
        const enriched = await Promise.all(
            results.map(async (qr: any) => {
                const testResults = await query(
                    `SELECT
                        test_type,
                        tested,
                        passed,
                        score,
                        grade,
                        message
                    FROM test_results
                    WHERE qc_result_id = $1
                    ORDER BY test_type`,
                    [qr.id]
                )
                return { ...qr, test_results: testResults }
            })
        )

        return NextResponse.json({ results: enriched, serial: machineSerial })
    } catch (error) {
        console.error("Trial QC results fetch error:", error)
        return NextResponse.json({ error: "Server Error" }, { status: 500 })
    }
}
