import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ApiError, UserWithCreator, UserRole } from '@/lib/types';
import { authenticateRequest, requireRole, getVisibleUsers } from '@/lib/auth-middleware';

// GET /api/users - List users based on role permissions
export async function GET(request: NextRequest) {
    try {
        // Authenticate the request
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError) return authError;
        if (!authUser) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Not authenticated' } as ApiError,
                { status: 401 }
            );
        }

        // Only SuperAdmin, Refurbisher, and Enterprise can list users
        const roleError = requireRole(authUser, ['SuperAdmin', 'Refurbisher', 'Enterprise', 'Reseller']);
        if (roleError) return roleError;

        // Get query parameters
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const search = searchParams.get('search') || '';
        const roleFilter = searchParams.get('role') as UserRole | null;
        const offset = (page - 1) * limit;

        // Build query based on user role
        let whereClause = 'WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;

        // SuperAdmin sees all users, Refurbisher/Enterprise see only their created users
        if (authUser.role === 'Refurbisher' || authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            whereClause += ` AND (u.created_by = $${paramIndex} OR u.id = $${paramIndex})`;
            params.push(authUser.id);
            paramIndex++;
        }

        // Add search filter
        if (search) {
            whereClause += ` AND (u.username ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.display_name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Add role filter
        if (roleFilter && ['SuperAdmin', 'Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'Client'].includes(roleFilter)) {
            whereClause += ` AND u.role = $${paramIndex}`;
            params.push(roleFilter);
            paramIndex++;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) as total FROM users u ${whereClause}`,
            params
        );
        const total = parseInt(countResult[0].total);

        // Get users with creator info and team size
        const users = await query<UserWithCreator>(
            `SELECT 
                u.id, 
                u.username, 
                u.email, 
                u.display_name,
                u.role, 
                u.created_by,
                u.is_active, 
                u.created_at,
                creator.username as creator_username,
                COALESCE(team.team_size, 0) as team_size
             FROM users u
             LEFT JOIN users creator ON u.created_by = creator.id
             LEFT JOIN (
                 SELECT created_by, COUNT(*)::int as team_size
                 FROM users
                 WHERE created_by IS NOT NULL
                 GROUP BY created_by
             ) team ON team.created_by = u.id
             ${whereClause}
             ORDER BY u.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        );

        return NextResponse.json({
            users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get users error:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'An error occurred while fetching users' } as ApiError,
            { status: 500 }
        );
    }
}
