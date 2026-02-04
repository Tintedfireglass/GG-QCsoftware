import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { query } from '@/lib/db';
import { UserRole, ApiError } from '@/lib/types';

export interface AuthenticatedUser {
    id: number;
    username: string;
    role: UserRole;
    created_by?: number;
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

    // Get full user info from database
    const users = await query(
        'SELECT id, username, role, created_by FROM users WHERE id = $1 AND is_active = true',
        [payload.userId]
    );

    if (users.length === 0) {
        return {
            user: null,
            error: NextResponse.json(
                { error: 'Authentication Error', message: 'User not found or inactive' } as ApiError,
                { status: 401 }
            ),
        };
    }

    return {
        user: users[0] as AuthenticatedUser,
        error: null,
    };
}

// Check if user has required role(s)
export function hasRole(user: AuthenticatedUser, allowedRoles: UserRole[]): boolean {
    return allowedRoles.includes(user.role);
}

// Check if user can manage another user (based on hierarchy)
export function canManageUser(manager: AuthenticatedUser, targetUserId: number, targetCreatedBy?: number): boolean {
    // SuperAdmin can manage anyone
    if (manager.role === 'SuperAdmin') {
        return true;
    }

    // Admin can only manage users they created
    if (manager.role === 'Admin') {
        return targetCreatedBy === manager.id;
    }

    // Regular users cannot manage anyone
    return false;
}

// Check what roles a user can create
export function getCreatableRoles(user: AuthenticatedUser): UserRole[] {
    switch (user.role) {
        case 'SuperAdmin':
            return ['Admin', 'User']; // SuperAdmin can create both Admin and User
        case 'Admin':
            return ['User']; // Admin can only create Users (Technicians)
        default:
            return []; // Regular users cannot create anyone
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
        // SuperAdmin can see all users
        const users = await query('SELECT id FROM users');
        return users.map((u: any) => u.id);
    } else if (user.role === 'Admin') {
        // Admin can see users they created + themselves
        const users = await query(
            'SELECT id FROM users WHERE created_by = $1 OR id = $1',
            [user.id]
        );
        return users.map((u: any) => u.id);
    } else {
        // Regular users can only see themselves
        return [user.id];
    }
}
