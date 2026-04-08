import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyPassword, generateToken } from '@/lib/auth';
import { LoginRequest, LoginResponse, ApiError } from '@/lib/types';

export async function POST(request: NextRequest) {
    try {
        const body: LoginRequest = await request.json();
        const { identifier, password } = body;

        // Validate input
        if (!identifier || !password) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Username/email and password are required' } as ApiError,
                { status: 400 }
            );
        }

        // Find user
        const users = await query(
            'SELECT * FROM users WHERE (username = $1 OR LOWER(email) = LOWER($1)) AND is_active = true',
            [identifier.trim()]
        );

        if (users.length === 0) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Invalid credentials' } as ApiError,
                { status: 401 }
            );
        }

        const user = users[0];

        // Verify password
        const isValid = await verifyPassword(password, user.password_hash);
        if (!isValid) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Invalid credentials' } as ApiError,
                { status: 401 }
            );
        }

        // Generate token
        const token = generateToken({
            userId: user.id,
            username: user.username,
            role: user.role,
        });

        const response: LoginResponse = {
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
            },
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'An error occurred during login' } as ApiError,
            { status: 500 }
        );
    }
}
