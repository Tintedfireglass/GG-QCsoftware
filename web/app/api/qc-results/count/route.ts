import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { authenticateRequest } from "@/lib/auth-middleware"
import { ApiError } from "@/lib/types"

type SqlParam = string | number | boolean | null

// GET /api/qc-results/count - count-only helper for dashboards (JWT required)
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

        const { searchParams } = new URL(request.url)
        const machineId = searchParams.get("machineId")
        const refurbishId = searchParams.get("refurbishId")
        const userIdParam = searchParams.get("userId")
        const overallPass = searchParams.get("overallPass")
        const search = searchParams.get("search")?.trim()

        const whereClauses: string[] = ["1=1"]
        const params: SqlParam[] = []
        let paramCount = 1

        if (authUser.role === "Technician" || authUser.role === "Client" || authUser.role === "B2CDevice") {
            whereClauses.push(`qr.technician_id = $${paramCount}`)
            params.push(authUser.id)
            paramCount++
        } else if (authUser.role === "Refurbisher" || authUser.role === "Enterprise" || authUser.role === "Reseller") {
            whereClauses.push(
                `(qr.technician_id = $${paramCount} OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $${paramCount}))`
            )
            params.push(authUser.id)
            paramCount++
        }

        if (userIdParam) {
            const requestedUserId = parseInt(userIdParam, 10)
            if (!Number.isFinite(requestedUserId)) {
                return NextResponse.json(
                    { error: "Validation Error", message: "Invalid userId" } as ApiError,
                    { status: 400 }
                )
            }

            if (
                (authUser.role === "Technician" || authUser.role === "Client" || authUser.role === "B2CDevice") &&
                requestedUserId !== authUser.id
            ) {
                return NextResponse.json(
                    { error: "Authorization Error", message: "You can only filter your own results" } as ApiError,
                    { status: 403 }
                )
            }

            whereClauses.push(`qr.technician_id = $${paramCount}`)
            params.push(requestedUserId)
            paramCount++
        }

        if (refurbishId) {
            whereClauses.push(`qr.refurbish_id = $${paramCount}`)
            params.push(refurbishId)
            paramCount++
        }

        if (overallPass !== null && overallPass !== undefined) {
            whereClauses.push(`qr.overall_pass = $${paramCount}`)
            params.push(overallPass === "true")
            paramCount++
        }

        const needsMachineJoin = !!machineId || !!search

        if (machineId) {
            whereClauses.push(`m.machine_id = $${paramCount}`)
            params.push(machineId)
            paramCount++
        }

        if (search) {
            whereClauses.push(`(
                COALESCE(m.computer_name, '') ILIKE $${paramCount} OR
                COALESCE(m.machine_id, '') ILIKE $${paramCount} OR
                CAST(qr.machine_id AS TEXT) ILIKE $${paramCount} OR
                CAST(qr.id AS TEXT) ILIKE $${paramCount}
            )`)
            params.push(`%${search}%`)
            paramCount++
        }

        const whereSql = whereClauses.join(" AND ")

        const countSql = needsMachineJoin
            ? `SELECT COUNT(*) as total
               FROM qc_results qr
               LEFT JOIN machines m ON qr.machine_id = m.id
               WHERE ${whereSql}`
            : `SELECT COUNT(*) as total
               FROM qc_results qr
               WHERE ${whereSql}`

        const rows = await query<{ total: string }>(countSql, params)
        const total = parseInt(rows[0]?.total ?? "0", 10)

        return NextResponse.json(
            { total },
            { headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=25" } }
        )
    } catch (error) {
        console.error("Error counting QC results:", error)
        return NextResponse.json(
            { error: "Server Error", message: "Failed to count QC results" } as ApiError,
            { status: 500 }
        )
    }
}
