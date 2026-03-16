import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { ApiError, CreateUserRequest, UserRole } from '@/lib/types';
import { authenticateRequest, getCreatableRoles, requireRole } from '@/lib/auth-middleware';

export async function POST(request: NextRequest) {
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

        // Only SuperAdmin, Refurbisher, and Enterprise can create users
        const roleError = requireRole(authUser, ['SuperAdmin', 'Refurbisher', 'Enterprise']);
        if (roleError) return roleError;

        const body: CreateUserRequest = await request.json();
        const { username, password, email, display_name, role } = body;

        // Validate input
        if (!username || !password) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Username and password are required' } as ApiError,
                { status: 400 }
            );
        }

        // Validate role
        const validRoles: UserRole[] = ['SuperAdmin', 'Refurbisher', 'Technician', 'Enterprise'];
        if (!role || !validRoles.includes(role)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Valid role is required (SuperAdmin, Refurbisher, Technician, or Enterprise)' } as ApiError,
                { status: 400 }
            );
        }

        // Check if the creator can create this role
        const creatableRoles = getCreatableRoles(authUser);
        if (!creatableRoles.includes(role)) {
            return NextResponse.json(
                {
                    error: 'Authorization Error',
                    message: `You can only create users with roles: ${creatableRoles.join(', ')}`
                } as ApiError,
                { status: 403 }
            );
        }

        // Check if user already exists
        const existingUsers = await query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existingUsers.length > 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Username already exists' } as ApiError,
                { status: 409 }
            );
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Insert user with created_by reference
        const result = await query(
            `INSERT INTO users (username, password_hash, email, display_name, role, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, username, email, display_name, role, created_by, is_active, created_at`,
            [username, passwordHash, email || null, display_name || username, role, authUser.id]
        );

        return NextResponse.json(
            {
                message: 'User created successfully',
                user: result[0],
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Registration error:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'An error occurred during registration' } as ApiError,
            { status: 500 }
        );
    }
}

