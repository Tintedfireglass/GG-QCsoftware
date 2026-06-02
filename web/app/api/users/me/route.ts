import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle';
import { authenticateRequest } from '@/lib/auth-middleware';

// GET /api/users/me - Returns the full profile of the authenticated user
// Used by the auth provider to fetch up-to-date permission flags on app load
export async function GET(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError) return authError;
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { rows } = await db.execute(sql`
            SELECT
                id, username, email, display_name, role,
                is_active, license_credits, created_at,
                allow_monthly_keys, allow_quarterly_keys,
                allow_6month_keys, allow_yearly_keys, allow_perpetual_keys
             FROM users WHERE id = ${authUser.id}
        `);

        if (rows.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ user: rows[0] });
    } catch (error) {
        console.error('GET /api/users/me error:', error);
        return NextResponse.json({ error: 'Server Error' }, { status: 500 });
    }
}
