import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { ApiError } from '@/lib/types';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { username, password, email, role } = body;

        // Validate input
        if (!username || !password) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Username and password are required' } as ApiError,
                { status: 400 }
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

        // Insert user
        const result = await query(
            `INSERT INTO users (username, password_hash, email, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role, created_at`,
            [username, passwordHash, email || null, role || 'Viewer']
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
