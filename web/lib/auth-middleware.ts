import { NextRequest, NextResponse } from 'next/server';
import { and, eq, or } from 'drizzle-orm';
import { verifyToken, extractToken } from '@/lib/auth';
import { db, schema } from '@/lib/drizzle';
import { UserRole, ApiError } from '@/lib/types';

const { users } = schema;

export interface AuthenticatedUser {
    id: number;
    username: string;
    role: UserRole;
    created_by?: number;
    machineId?: number;
}

export interface AuthResult {
    user: AuthenticatedUser | null;
    error: NextResponse | null;
}

// Authenticate request and return user info
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
    const authHeader = request.headers.get('Authorization');
    const token = extractToken(authHeader);

    if (!token) {
        return {
            user: null,
            error: NextResponse.json(
                { error: 'Authentication Error', message: 'No token provided' } as ApiError,
                { status: 401 }
            ),
        };
    }

    const payload = verifyToken(token);
    if (!payload) {
        return {
            user: null,
            error: NextResponse.json(
                { error: 'Authentication Error', message: 'Invalid or expired token' } as ApiError,
                { status: 401 }
            ),
        };
    }

    if (payload.scope === 'license_device') {
        // TrialUser tokens: issued by /api/auth/trial, treated as device-scoped sessions.
        // They carry role='TrialUser' and no customerUserId — map them through as B2CDevice.
        if (payload.role === 'TrialUser') {
            return {
                user: {
                    id: payload.userId,
                    username: payload.username,
                    role: 'B2CDevice' as UserRole,
                },
                error: null,
            };
        }

        if (payload.role !== 'B2CDevice' || !payload.customerUserId) {
            return {
                user: null,
                error: NextResponse.json(
                    { error: 'Authentication Error', message: 'Invalid license token payload' } as ApiError,
                    { status: 401 }
                ),
            };
        }

        return {
            user: {
                id: payload.userId,
                username: payload.username,
                role: 'B2CDevice',
                machineId: payload.machineId,
            },
            error: null,
        };
    }

    // Get full user info from database
    const rows = await db
        .select({ id: users.id, username: users.username, role: users.role, created_by: users.createdBy })
        .from(users)
        .where(and(eq(users.id, payload.userId), eq(users.isActive, true)))
        .limit(1);

    if (rows.length === 0) {
        return {
            user: null,
            error: NextResponse.json(
                { error: 'Authentication Error', message: 'User not found or inactive' } as ApiError,
                { status: 401 }
            ),
        };
    }

    const u = rows[0];
    return {
        user: { id: u.id, username: u.username, role: u.role as UserRole, created_by: u.created_by ?? undefined },
        error: null,
    };
}

// Check if user has required role(s)
export function hasRole(user: AuthenticatedUser, allowedRoles: UserRole[]): boolean {
    return allowedRoles.includes(user.role);
}

// Check if user can manage another user (based on hierarchy)
export function canManageUser(manager: AuthenticatedUser, targetUserId: number, targetCreatedBy?: number): boolean {
    if (manager.role === 'SuperAdmin') return true;
    if (manager.role === 'Refurbisher' || manager.role === 'Enterprise' || manager.role === 'OEM' || manager.role === 'Insurer' || manager.role === 'Reseller') {
        return targetCreatedBy === manager.id;
    }
    return false;
}

// Check what roles a user can create
export function getCreatableRoles(user: AuthenticatedUser): UserRole[] {
    switch (user.role) {
        case 'SuperAdmin':
            return ['Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'OEM', 'Insurer', 'Client'];
        case 'Refurbisher':
            return ['Technician'];
        case 'Enterprise':
            return ['Technician'];
        case 'OEM':
            return ['Technician'];
        case 'Insurer':
            return ['Technician'];
        case 'Reseller':
            return ['Technician', 'Client'];
        case 'Employee':
            return [];
        default:
            return [];
    }
}

// Authorization middleware helper - returns error response if not authorized
export function requireRole(user: AuthenticatedUser, allowedRoles: UserRole[]): NextResponse | null {
    if (!hasRole(user, allowedRoles)) {
        return NextResponse.json(
            { error: 'Authorization Error', message: 'Insufficient permissions' } as ApiError,
            { status: 403 }
        );
    }
    return null;
}

// Get users that the authenticated user can see
export async function getVisibleUsers(user: AuthenticatedUser): Promise<number[]> {
    if (user.role === 'SuperAdmin') {
        const rows = await db.select({ id: users.id }).from(users);
        return rows.map((u) => u.id);
    } else if (user.role === 'Refurbisher' || user.role === 'Enterprise' || user.role === 'OEM' || user.role === 'Insurer' || user.role === 'Reseller') {
        const rows = await db.select({ id: users.id }).from(users)
            .where(or(eq(users.createdBy, user.id), eq(users.id, user.id)));
        return rows.map((u) => u.id);
    } else {
        return [user.id];
    }
}
