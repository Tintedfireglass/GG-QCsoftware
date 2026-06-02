import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/drizzle"
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
        const { rows } = await db.execute(sql`
            SELECT
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
            WHERE m.serial_number = ${machineSerial}
               OR m.machine_id    = ${machineSerial}
            ORDER BY mh.timestamp DESC
            LIMIT 50
        `)

        return NextResponse.json({ results: rows, serial: machineSerial })
    } catch (error) {
        console.error("Trial auto QC results fetch error:", error)
        return NextResponse.json({ error: "Server Error" }, { status: 500 })
    }
}
