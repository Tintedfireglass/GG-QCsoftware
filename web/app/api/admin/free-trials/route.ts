import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { authenticateRequest, requireRole } from "@/lib/auth-middleware"

export async function GET(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request)
        if (authError || !authUser) return authError || NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const roleError = requireRole(authUser, ["SuperAdmin"])
        if (roleError) return roleError

        const trials = await query(
            `
            SELECT
                ft.id,
                ft.email,
                ft.machine_serial,
                ft.mac_address,
                ft.computer_name,
                ft.machine_id,
                m.machine_id as machine_identifier,
                ft.trial_start_utc,
                ft.trial_end_utc,
                ft.is_active,
                ft.revoked_at,
                ft.revoke_reason,
                ft.created_at
            FROM free_trials ft
            LEFT JOIN machines m ON ft.machine_id = m.id
            ORDER BY ft.created_at DESC
            `
        )

        return NextResponse.json({ trials })
    } catch (error) {
        console.error("Admin free trials list error:", error)
        return NextResponse.json({ error: "Server Error" }, { status: 500 })
    }
}

