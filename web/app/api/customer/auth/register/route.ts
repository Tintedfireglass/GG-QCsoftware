import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { generateCustomerToken } from '@/lib/customer-auth';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const email = String(body?.email || '').trim().toLowerCase();
        const password = String(body?.password || '');
        const fullName = String(body?.fullName || '').trim();

        if (!email || !password) {
            return NextResponse.json({ error: 'Validation Error', message: 'Email and password are required' }, { status: 400 });
        }

        const existing = await query<{ id: number }>(
            'SELECT id FROM customer_users WHERE email = $1',
            [email]
        );

        if (existing.length > 0) {
            return NextResponse.json({ error: 'Validation Error', message: 'Email already registered' }, { status: 409 });
        }

        const passwordHash = await hashPassword(password);
        const created = await query<{ id: number; email: string; full_name: string | null }>(
            `INSERT INTO customer_users (email, password_hash, full_name)
             VALUES ($1, $2, $3)
             RETURNING id, email, full_name`,
            [email, passwordHash, fullName || null]
        );

        const customer = created[0];
        const token = generateCustomerToken({
            customerId: customer.id,
            email: customer.email,
        });

        return NextResponse.json({
            token,
            customer: {
                id: customer.id,
                email: customer.email,
                fullName: customer.full_name,
            },
        }, { status: 201 });
    } catch (error) {
        console.error('Customer register error:', error);
        return NextResponse.json({ error: 'Server Error', message: 'Failed to register customer' }, { status: 500 });
    }
}
