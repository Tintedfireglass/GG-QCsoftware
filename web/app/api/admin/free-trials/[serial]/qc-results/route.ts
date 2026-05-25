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

        const machineSerial = decodeURIComponent(serial)

        // Fetch auto QC runs from machine_history for this machine serial.
        // Match by the machine's serial_number OR machine_id identifier.
        const results = await query(
            `SELECT
                mh.id,
                mh.timestamp,
                mh.source,
                mh.app_version,
                mh.component_grades,
                m.machine_id AS machine_identifier,
                m.computer_name,
                m.serial_number,
                m.manufacturer,
                m.model
            FROM machine_history mh
            JOIN machines m ON mh.machine_id = m.id
            WHERE m.serial_number = $1
               OR m.machine_id    = $1
            ORDER BY mh.timestamp DESC
            LIMIT 50`,
            [machineSerial]
        )

        return NextResponse.json({ results, serial: machineSerial })
    } catch (error) {
        console.error("Trial auto QC results fetch error:", error)
        return NextResponse.json({ error: "Server Error" }, { status: 500 })
    }
}
