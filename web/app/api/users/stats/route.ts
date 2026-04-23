import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { ApiError } from "@/lib/types"
import { authenticateRequest, requireRole } from "@/lib/auth-middleware"

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

        const roleError = requireRole(authUser, ["SuperAdmin", "Refurbisher", "Enterprise", "Reseller"])
        if (roleError) return roleError

        const params: (string | number)[] = []
        let whereSql = "WHERE 1=1"
        let paramIndex = 1

        if (authUser.role === "Refurbisher" || authUser.role === "Enterprise" || authUser.role === "Reseller") {
            whereSql += ` AND (u.created_by = $${paramIndex} OR u.id = $${paramIndex})`
            params.push(authUser.id)
            paramIndex++
        }

        const rows = await query<{
            total: string
            admins: string
            technicians: string
        }>(
            `
            SELECT
              COUNT(*)::text AS total,
              SUM(CASE WHEN u.role IN ('Refurbisher','Enterprise','Reseller','SuperAdmin') THEN 1 ELSE 0 END)::text AS admins,
              SUM(CASE WHEN u.role = 'Technician' THEN 1 ELSE 0 END)::text AS technicians
            FROM users u
            ${whereSql}
            `,
            params
        )

        const row = rows[0] ?? { total: "0", admins: "0", technicians: "0" }
        return NextResponse.json({
            totalUsers: parseInt(row.total ?? "0", 10),
            totalAdmins: parseInt(row.admins ?? "0", 10),
            totalTechnicians: parseInt(row.technicians ?? "0", 10),
        })
    } catch (error) {
        console.error("Get user stats error:", error)
        return NextResponse.json(
            { error: "Server Error", message: "An error occurred while fetching user stats" } as ApiError,
            { status: 500 }
        )
    }
}

