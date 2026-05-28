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
        const roleError = requireRole(authUser, ['SuperAdmin', 'Refurbisher', 'Enterprise', 'Reseller']);
        if (roleError) return roleError;

        const body: CreateUserRequest = await request.json();
        const { username, password, email, company_name, display_name, role,
            allow_monthly_keys, allow_quarterly_keys, allow_6month_keys, allow_yearly_keys } = body;

        // Validate input
        if (!username || !password || !email) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Username, password, and email are required' } as ApiError,
                { status: 400 }
            );
        }

        if (!email?.trim()) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Email is required' } as ApiError,
                { status: 400 }
            );
        }

        // Validate role
        const validRoles: UserRole[] = ['SuperAdmin', 'Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'OEM', 'Insurer', 'Client'];
        if (!role || !validRoles.includes(role)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Valid role is required (SuperAdmin, Employee, Refurbisher, Reseller, Technician, Enterprise, OEM, Insurer, or Client)' } as ApiError,
                { status: 400 }
            );
        }

        if ((role === 'Enterprise' || role === 'OEM' || role === 'Insurer' || role === 'Refurbisher' || role === 'Reseller') && !company_name?.trim()) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Company name is required for Enterprise, OEM, Insurer, Refurbisher, and Reseller users' } as ApiError,
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

        // Only SuperAdmin can set duration permission flags
        const monthlyFlag = authUser.role === 'SuperAdmin' ? (allow_monthly_keys ?? false) : false;
        const quarterlyFlag = authUser.role === 'SuperAdmin' ? (allow_quarterly_keys ?? false) : false;
        const sixMonthFlag = authUser.role === 'SuperAdmin' ? (allow_6month_keys ?? false) : false;
        const yearlyFlag = authUser.role === 'SuperAdmin' ? (allow_yearly_keys ?? false) : false;

        // Insert user with created_by reference
        const result = await query(
            `INSERT INTO users (username, password_hash, email, company_name, display_name, role, created_by,
                allow_monthly_keys, allow_quarterly_keys, allow_6month_keys, allow_yearly_keys)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id, username, email, company_name, display_name, role, created_by, is_active, created_at,
                allow_monthly_keys, allow_quarterly_keys, allow_6month_keys, allow_yearly_keys`,
            [
                username,
                passwordHash,
                email || null,
                company_name?.trim() || null,
                display_name || username,
                role,
                authUser.id,
                monthlyFlag,
                quarterlyFlag,
                sixMonthFlag,
                yearlyFlag,
            ]
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

